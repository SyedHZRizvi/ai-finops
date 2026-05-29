/**
 * Drop-in OpenAI SDK middleware for AI FinOps.
 *
 * The OpenAI Node SDK lets you override its HTTP layer by passing a custom
 * `fetch` implementation to its constructor:
 *
 *   new OpenAI({ fetch: finopsOpenAIFetch(finops) })
 *
 * That hook fires for every request the SDK makes — chat completions,
 * embeddings, responses, audio, anything. We intercept the ones that look
 * like LLM completions (`/chat/completions`, `/completions`, `/responses`),
 * read the request body, let the request through unchanged, then read the
 * response (or tee the stream) and ship a FinOps log on the side.
 *
 * We do NOT import the `openai` package — we only ever speak HTTP. The
 * returned function has the standard `fetch` signature, so it slots in
 * anywhere a `fetch` is expected.
 */

import type { FinOpsClient } from './client.js';
import type { LogInput } from './types.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface FinOpsOpenAIFetchOptions {
  /** Override the FinOpsClient's appName for this middleware instance. */
  appName?: string;
  /** Use a custom fetch underneath (e.g. for testing). Defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Resolve a user id off the outgoing request. The middleware passes the
   * URL, parsed body, and request init so the caller can read anything.
   */
  resolveUserId?: (ctx: {
    url: string;
    body: Record<string, unknown> | undefined;
    init: RequestInit | undefined;
  }) => string | undefined;
  /** Same shape as `resolveUserId` but for metadata attached to the log. */
  resolveMetadata?: (ctx: {
    url: string;
    body: Record<string, unknown> | undefined;
    init: RequestInit | undefined;
  }) => Record<string, unknown> | undefined;
  /**
   * Tag the provider name on logs. Useful when pointing the OpenAI SDK at an
   * OpenAI-compatible endpoint (Groq, Together, Fireworks, vLLM, …). Defaults
   * to `'openai'`.
   */
  provider?: string;
}

// ---------------------------------------------------------------------------
// Body shapes we read. Only the fields we need.
// ---------------------------------------------------------------------------

interface ChatCompletionsRequestBody {
  model?: string;
  messages?: Array<{
    role?: string;
    content?: unknown;
  }>;
  stream?: boolean;
  user?: string;
  [key: string]: unknown;
}

interface CompletionsRequestBody {
  model?: string;
  prompt?: unknown;
  stream?: boolean;
  user?: string;
  [key: string]: unknown;
}

interface ResponsesRequestBody {
  model?: string;
  input?: unknown;
  stream?: boolean;
  user?: string;
  [key: string]: unknown;
}

type AnyRequestBody =
  | ChatCompletionsRequestBody
  | CompletionsRequestBody
  | ResponsesRequestBody;

interface UsageBlock {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: { content?: unknown };
    text?: string;
  }>;
  usage?: UsageBlock;
  [key: string]: unknown;
}

interface ResponsesAPIResponse {
  model?: string;
  output?: unknown;
  output_text?: string;
  usage?: UsageBlock;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Endpoint detection
// ---------------------------------------------------------------------------

type EndpointKind = 'chat-completions' | 'completions' | 'responses' | 'other';

function classifyEndpoint(url: string): EndpointKind {
  if (url.includes('/chat/completions')) return 'chat-completions';
  if (url.includes('/responses')) return 'responses';
  // `/completions` after we've already ruled out chat/completions.
  if (url.includes('/completions')) return 'completions';
  return 'other';
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Build a `fetch`-compatible function the OpenAI SDK can use. Every chat /
 * completion / responses call flowing through this fetch is mirrored to the
 * FinOps dashboard fire-and-forget.
 */
export function finopsOpenAIFetch(
  client: FinOpsClient,
  opts: FinOpsOpenAIFetchOptions = {},
): typeof fetch {
  const baseFetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const provider = opts.provider ?? 'openai';

  const wrapped: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : urlOf(input);
    const kind = classifyEndpoint(url);

    if (kind === 'other') {
      return baseFetch(input, init);
    }

    const startedAt = Date.now();
    const body = await readRequestBody(input, init);

    // Network errors propagate to the SDK caller untouched; we just skip
    // logging this request.
    const response = await baseFetch(input, init);

    // Failed requests still surface the response to the caller; we only log
    // when we can actually pull token/usage info, which lives on a 2xx body.
    if (!response.ok) return response;

    // Streaming responses are SSE — tee the stream so the SDK consumer gets
    // an untouched copy and we collect events on the side.
    const isStream = looksLikeStream(body, response);
    if (isStream) {
      return interceptStreamingResponse({
        response,
        client,
        opts,
        body,
        url,
        kind,
        provider,
        startedAt,
        init,
      });
    }

    return interceptJsonResponse({
      response,
      client,
      opts,
      body,
      url,
      kind,
      provider,
      startedAt,
      init,
    });
  };

  return wrapped;
}

// ---------------------------------------------------------------------------
// Request body parsing — careful not to consume the body the SDK is sending.
// ---------------------------------------------------------------------------

async function readRequestBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<AnyRequestBody | undefined> {
  // Easy path: init.body is the only place the caller wrote it.
  if (init?.body !== undefined) return parseBody(init.body);

  // Harder path: input is a Request — we have to clone before reading.
  if (typeof input === 'object' && input !== null && 'clone' in input) {
    const req = input as Request;
    try {
      const cloned = req.clone();
      const text = await cloned.text();
      if (!text) return undefined;
      return JSON.parse(text) as AnyRequestBody;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function parseBody(body: BodyInit | null | undefined): AnyRequestBody | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as AnyRequestBody;
    } catch {
      return undefined;
    }
  }
  if (body instanceof Uint8Array) {
    try {
      return JSON.parse(new TextDecoder().decode(body)) as AnyRequestBody;
    } catch {
      return undefined;
    }
  }
  // ArrayBuffer / Blob / FormData / ReadableStream — we don't try to consume
  // these because that would corrupt the actual outgoing request.
  return undefined;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof input === 'object' && input !== null && 'url' in input) {
    return (input as { url: string }).url;
  }
  return '';
}

function looksLikeStream(
  body: AnyRequestBody | undefined,
  response: Response,
): boolean {
  if (body && typeof body === 'object' && body.stream === true) return true;
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('text/event-stream');
}

// ---------------------------------------------------------------------------
// Non-streaming path — clone the response, JSON-decode, log.
// ---------------------------------------------------------------------------

interface InterceptArgs {
  response: Response;
  client: FinOpsClient;
  opts: FinOpsOpenAIFetchOptions;
  body: AnyRequestBody | undefined;
  url: string;
  kind: EndpointKind;
  provider: string;
  startedAt: number;
  init: RequestInit | undefined;
}

function interceptJsonResponse(args: InterceptArgs): Response {
  const { response, client, opts, body, url, kind, provider, startedAt, init } = args;
  // Clone so the user still gets a fresh body to read.
  const cloned = response.clone();

  void (async () => {
    try {
      const text = await cloned.text();
      if (!text) return;
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const logInput = buildLogInputFromResponse({
        body,
        parsed,
        url,
        kind,
        opts,
        provider,
        latencyMs: Date.now() - startedAt,
        init,
      });
      if (logInput) void client.log(logInput);
    } catch {
      // Logging path must never throw.
    }
  })();

  return response;
}

// ---------------------------------------------------------------------------
// Streaming path — tee the body and accumulate text + final usage chunk.
// ---------------------------------------------------------------------------

function interceptStreamingResponse(args: InterceptArgs): Response {
  const { response, client, opts, body, url, kind, provider, startedAt, init } = args;
  if (!response.body) return response;

  const [forUser, forFinOps] = response.body.tee();
  const collector = collectSSE(forFinOps);

  void collector.then((collected) => {
    try {
      const logInput = buildLogInputFromStream({
        body,
        collected,
        url,
        kind,
        opts,
        provider,
        latencyMs: Date.now() - startedAt,
        init,
      });
      if (logInput) void client.log(logInput);
    } catch {
      // Swallow.
    }
  });

  // Re-wrap so the user gets a fresh Response backed by the untouched stream.
  return new Response(forUser, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

interface CollectedSSE {
  text: string;
  model: string | undefined;
  usage: UsageBlock | undefined;
}

async function collectSSE(
  stream: ReadableStream<Uint8Array>,
): Promise<CollectedSSE> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const textParts: string[] = [];
  let model: string | undefined;
  let usage: UsageBlock | undefined;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by "\n\n". Process every complete frame.
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf('\n\n');
        handleSSEFrame(frame, textParts, (m) => (model = m), (u) => (usage = u));
      }
    }
    // Process any trailing frame without the closing "\n\n".
    if (buffer.trim().length > 0) {
      handleSSEFrame(buffer, textParts, (m) => (model = m), (u) => (usage = u));
    }
  } catch {
    // Whatever we have is what we log.
  } finally {
    reader.releaseLock();
  }

  return { text: textParts.join(''), model, usage };
}

function handleSSEFrame(
  frame: string,
  textParts: string[],
  setModel: (m: string) => void,
  setUsage: (u: UsageBlock) => void,
): void {
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return;
  const payload = dataLines.join('\n');
  if (payload === '[DONE]') return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.model === 'string') setModel(obj.model);

  // chat.completions stream: choices[0].delta.content
  const choices = obj.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    if (first) {
      const delta = first.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.content === 'string') textParts.push(delta.content);
      // legacy completions stream
      if (typeof first.text === 'string') textParts.push(first.text);
    }
  }

  // responses stream emits typed events; aggregate the text deltas.
  const eventType = obj.type;
  if (typeof eventType === 'string') {
    if (eventType === 'response.output_text.delta' && typeof obj.delta === 'string') {
      textParts.push(obj.delta);
    }
    if (eventType === 'response.completed') {
      const resp = obj.response as Record<string, unknown> | undefined;
      if (resp && typeof resp.model === 'string') setModel(resp.model);
      if (resp && resp.usage && typeof resp.usage === 'object') {
        setUsage(resp.usage as UsageBlock);
      }
    }
  }

  // Final usage frame in chat.completions: { ..., "usage": {...} } after last
  // choice. OpenAI only emits this when `stream_options.include_usage` is on.
  if (obj.usage && typeof obj.usage === 'object') {
    setUsage(obj.usage as UsageBlock);
  }
}

// ---------------------------------------------------------------------------
// Build LogInput from a parsed JSON response or streamed accumulation.
// ---------------------------------------------------------------------------

interface BuildArgs {
  body: AnyRequestBody | undefined;
  url: string;
  kind: EndpointKind;
  opts: FinOpsOpenAIFetchOptions;
  provider: string;
  latencyMs: number;
  init: RequestInit | undefined;
}

function buildLogInputFromResponse(
  args: BuildArgs & { parsed: Record<string, unknown> },
): LogInput | undefined {
  const { parsed, body, url, kind, opts, provider, latencyMs, init } = args;
  const promptText = extractPrompt(body, kind);
  if (promptText === undefined) return undefined;

  const model =
    (typeof parsed.model === 'string' ? parsed.model : undefined) ??
    (body?.model as string | undefined) ??
    'unknown';

  let responseText: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  if (kind === 'responses') {
    const r = parsed as ResponsesAPIResponse;
    responseText = extractResponsesText(r);
    inputTokens = r.usage?.input_tokens ?? r.usage?.prompt_tokens;
    outputTokens = r.usage?.output_tokens ?? r.usage?.completion_tokens;
  } else {
    const r = parsed as ChatCompletionResponse;
    responseText = extractChatText(r);
    inputTokens = r.usage?.prompt_tokens;
    outputTokens = r.usage?.completion_tokens;
  }

  return assemble({
    body,
    init,
    url,
    opts,
    provider,
    model,
    promptText,
    responseText,
    inputTokens,
    outputTokens,
    latencyMs,
  });
}

function buildLogInputFromStream(
  args: BuildArgs & { collected: CollectedSSE },
): LogInput | undefined {
  const { collected, body, url, kind, opts, provider, latencyMs, init } = args;
  const promptText = extractPrompt(body, kind);
  if (promptText === undefined) return undefined;

  const model = collected.model ?? (body?.model as string | undefined) ?? 'unknown';
  const responseText = collected.text.length > 0 ? collected.text : undefined;
  const inputTokens =
    collected.usage?.input_tokens ?? collected.usage?.prompt_tokens;
  const outputTokens =
    collected.usage?.output_tokens ?? collected.usage?.completion_tokens;

  return assemble({
    body,
    init,
    url,
    opts,
    provider,
    model,
    promptText,
    responseText,
    inputTokens,
    outputTokens,
    latencyMs,
  });
}

function assemble(args: {
  body: AnyRequestBody | undefined;
  init: RequestInit | undefined;
  url: string;
  opts: FinOpsOpenAIFetchOptions;
  provider: string;
  model: string;
  promptText: string;
  responseText: string | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  latencyMs: number;
}): LogInput {
  const { body, init, url, opts, provider, model, promptText, responseText, inputTokens, outputTokens, latencyMs } = args;
  const userId =
    opts.resolveUserId?.({ url, body, init }) ??
    (body && typeof body === 'object' && typeof (body as { user?: unknown }).user === 'string'
      ? (body as { user: string }).user
      : undefined);

  const userMetadata = opts.resolveMetadata?.({ url, body, init });
  const metadata: Record<string, unknown> = { endpoint: classifyEndpoint(url) };
  if (userMetadata) Object.assign(metadata, userMetadata);

  const logInput: LogInput = {
    model,
    provider,
    promptText,
    latencyMs,
  };
  if (opts.appName !== undefined) logInput.appName = opts.appName;
  if (userId !== undefined) logInput.userId = userId;
  if (responseText !== undefined) logInput.responseText = responseText;
  if (inputTokens !== undefined) logInput.inputTokens = inputTokens;
  if (outputTokens !== undefined) logInput.outputTokens = outputTokens;
  logInput.metadata = metadata;
  return logInput;
}

// ---------------------------------------------------------------------------
// Prompt / response extraction helpers.
// ---------------------------------------------------------------------------

function extractPrompt(
  body: AnyRequestBody | undefined,
  kind: EndpointKind,
): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  if (kind === 'chat-completions') {
    const messages = (body as ChatCompletionsRequestBody).messages;
    if (!Array.isArray(messages)) return undefined;
    const parts: string[] = [];
    for (const msg of messages) {
      const content = stringifyMessageContent(msg?.content);
      if (!content) continue;
      const role = typeof msg?.role === 'string' ? msg.role : 'user';
      parts.push(`${role}: ${content}`);
    }
    return parts.length > 0 ? parts.join('\n') : undefined;
  }
  if (kind === 'completions') {
    const prompt = (body as CompletionsRequestBody).prompt;
    if (typeof prompt === 'string') return prompt;
    if (Array.isArray(prompt)) {
      return prompt.filter((p): p is string => typeof p === 'string').join('\n');
    }
    return undefined;
  }
  if (kind === 'responses') {
    const input = (body as ResponsesRequestBody).input;
    if (typeof input === 'string') return input;
    if (Array.isArray(input)) {
      const parts: string[] = [];
      for (const item of input) {
        const c = stringifyMessageContent(
          (item as { content?: unknown })?.content,
        );
        if (c) parts.push(c);
      }
      return parts.length > 0 ? parts.join('\n') : undefined;
    }
    return undefined;
  }
  return undefined;
}

function stringifyMessageContent(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part);
      continue;
    }
    if (!part || typeof part !== 'object') continue;
    const obj = part as Record<string, unknown>;
    // OpenAI chat content parts: { type: "text", text: "..." } or
    // { type: "input_text", text: "..." } on responses API.
    if (typeof obj.text === 'string') parts.push(obj.text);
  }
  return parts.length > 0 ? parts.join('') : undefined;
}

function extractChatText(r: ChatCompletionResponse): string | undefined {
  const choices = r.choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0];
  if (!first) return undefined;
  const msg = first.message;
  if (msg && typeof msg.content === 'string') return msg.content;
  if (msg && Array.isArray(msg.content)) {
    return stringifyMessageContent(msg.content);
  }
  if (typeof first.text === 'string') return first.text;
  return undefined;
}

function extractResponsesText(r: ResponsesAPIResponse): string | undefined {
  if (typeof r.output_text === 'string' && r.output_text.length > 0) {
    return r.output_text;
  }
  if (!Array.isArray(r.output)) return undefined;
  const parts: string[] = [];
  for (const item of r.output) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const content = obj.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c && typeof c === 'object') {
        const text = (c as { text?: unknown }).text;
        if (typeof text === 'string') parts.push(text);
      }
    }
  }
  return parts.length > 0 ? parts.join('') : undefined;
}
