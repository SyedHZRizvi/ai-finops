/**
 * Vercel AI SDK middleware for the AI FinOps SDK.
 *
 * The Vercel AI SDK exposes a `LanguageModelV1Middleware` extension point.
 * A middleware wraps every `generate` and `stream` call on a language model,
 * so installing one middleware logs every call site in your application.
 *
 * We do NOT import `ai` here — that would force every consumer of this SDK
 * to install it. Instead we declare the minimal slice of the AI SDK's
 * `LanguageModelV1Middleware` interface (and the types it references) in
 * this file. At runtime the middleware we return structurally satisfies
 * the AI SDK's contract.
 *
 * Usage (the user supplies `ai` themselves):
 *
 *   import { wrapLanguageModel } from 'ai';
 *   import { openai } from '@ai-sdk/openai';
 *   import { FinOpsClient, finopsMiddleware } from '@ai-finops/sdk';
 *
 *   const finops = new FinOpsClient({ appName: 'my-app' });
 *   const model = wrapLanguageModel({
 *     model: openai('gpt-4o-mini'),
 *     middleware: finopsMiddleware(finops),
 *   });
 *
 *   const { text } = await generateText({ model, prompt: 'Write a haiku.' });
 */

import type { FinOpsClient } from './client.js';
import type { LogInput } from './types.js';

// ---------------------------------------------------------------------------
// Minimal AI SDK types — structural copies of the public interface. We only
// model the fields we read. The user's `ai` package supplies the real types
// at compile time; we never import it here.
// ---------------------------------------------------------------------------

export interface LanguageModelV1CallOptions {
  prompt: LanguageModelV1Prompt;
  mode?: { type?: string; [key: string]: unknown };
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  stopSequences?: string[];
  responseFormat?: { type?: string; [key: string]: unknown };
  headers?: Record<string, string | undefined>;
  abortSignal?: AbortSignal;
  providerMetadata?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export type LanguageModelV1Prompt = LanguageModelV1Message[];

export interface LanguageModelV1Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | LanguageModelV1ContentPart[];
  [key: string]: unknown;
}

export type LanguageModelV1ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: unknown; mimeType?: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | { type: string; [key: string]: unknown };

export interface LanguageModelV1Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
}

export interface LanguageModelV1GenerateResult {
  text?: string;
  reasoning?: string | Array<{ type: string; text?: string }>;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
  }>;
  finishReason?: string;
  usage: LanguageModelV1Usage;
  rawResponse?: { headers?: Record<string, string> };
  response?: { id?: string; modelId?: string; timestamp?: Date | string };
  warnings?: unknown[];
  providerMetadata?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export type LanguageModelV1StreamPart =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'reasoning'; textDelta: string }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      args: string;
    }
  | { type: 'tool-call-delta'; toolCallId: string; toolName: string; argsTextDelta: string }
  | {
      type: 'finish';
      finishReason: string;
      usage: LanguageModelV1Usage;
      providerMetadata?: Record<string, Record<string, unknown>>;
    }
  | { type: 'error'; error: unknown }
  | { type: string; [key: string]: unknown };

export interface LanguageModelV1StreamResult {
  stream: ReadableStream<LanguageModelV1StreamPart>;
  rawCall?: { rawPrompt?: unknown; rawSettings?: Record<string, unknown> };
  rawResponse?: { headers?: Record<string, string> };
  warnings?: unknown[];
  [key: string]: unknown;
}

/**
 * Minimal slice of the AI SDK's `LanguageModelV1` that middleware can read.
 * The real type has many more fields; we expose only what we touch.
 */
export interface LanguageModelV1Like {
  readonly specificationVersion?: string;
  readonly provider?: string;
  readonly modelId?: string;
  readonly defaultObjectGenerationMode?: string;
  [key: string]: unknown;
}

export interface LanguageModelV1Middleware {
  /** Vercel reads this for tracing; optional but conventional. */
  middlewareVersion?: 'v1';
  /** Lets the middleware tweak the request before it hits the model. */
  transformParams?: (args: {
    type: 'generate' | 'stream';
    params: LanguageModelV1CallOptions;
  }) => Promise<LanguageModelV1CallOptions> | LanguageModelV1CallOptions;
  /** Wraps a single `generate` call. */
  wrapGenerate?: (args: {
    doGenerate: () => Promise<LanguageModelV1GenerateResult>;
    params: LanguageModelV1CallOptions;
    model: LanguageModelV1Like;
  }) => Promise<LanguageModelV1GenerateResult>;
  /** Wraps a single `stream` call. */
  wrapStream?: (args: {
    doStream: () => Promise<LanguageModelV1StreamResult>;
    params: LanguageModelV1CallOptions;
    model: LanguageModelV1Like;
  }) => Promise<LanguageModelV1StreamResult>;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface FinOpsMiddlewareOptions {
  /** Override the FinOpsClient's appName for this middleware instance. */
  appName?: string;
  /**
   * Pull a user id off the request — useful when you stash it on
   * `providerMetadata` or `headers`. Returns undefined to leave it unset.
   */
  resolveUserId?: (params: LanguageModelV1CallOptions) => string | undefined;
  /**
   * Pull arbitrary metadata off the request to attach to the FinOps log.
   * Returned object is merged with the middleware's built-in metadata.
   */
  resolveMetadata?: (
    params: LanguageModelV1CallOptions,
  ) => Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Build a Vercel AI SDK middleware that streams every call through the
 * FinOps dashboard. Apply with `wrapLanguageModel({ model, middleware })`.
 */
export function finopsMiddleware(
  client: FinOpsClient,
  opts: FinOpsMiddlewareOptions = {},
): LanguageModelV1Middleware {
  return {
    middlewareVersion: 'v1',

    async wrapGenerate({ doGenerate, params, model }) {
      const startedAt = Date.now();
      const result = await doGenerate();
      const latencyMs = Date.now() - startedAt;

      try {
        const logInput = buildLogInput({
          client,
          opts,
          params,
          model,
          latencyMs,
          responseText: extractGenerateText(result),
          inputTokens: result.usage?.promptTokens,
          outputTokens: result.usage?.completionTokens,
          finishReason: result.finishReason,
        });
        void client.log(logInput);
      } catch {
        // Never let logging crash the request.
      }

      return result;
    },

    async wrapStream({ doStream, params, model }) {
      const startedAt = Date.now();
      const result = await doStream();

      // Tee the stream so we can observe parts without consuming the copy the
      // user receives. The original ReadableStream stays available to the SDK.
      const [forUser, forFinOps] = result.stream.tee();

      // Consume the tap on the side; collect text + final usage, then log.
      const collector = collectStreamForLogging(forFinOps);
      void collector.then(async (collected) => {
        try {
          const latencyMs = Date.now() - startedAt;
          const logInput = buildLogInput({
            client,
            opts,
            params,
            model,
            latencyMs,
            responseText: collected.text,
            inputTokens: collected.inputTokens,
            outputTokens: collected.outputTokens,
            finishReason: collected.finishReason,
          });
          void client.log(logInput);
        } catch {
          // Swallow — logging must never bubble out of the stream path.
        }
      });

      return {
        ...result,
        stream: forUser,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface CollectedStream {
  text: string | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  finishReason: string | undefined;
}

async function collectStreamForLogging(
  stream: ReadableStream<LanguageModelV1StreamPart>,
): Promise<CollectedStream> {
  const reader = stream.getReader();
  const textParts: string[] = [];
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let finishReason: string | undefined;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || typeof value !== 'object') continue;
      const part = value as { type?: string; [key: string]: unknown };
      if (part.type === 'text-delta' && typeof part.textDelta === 'string') {
        textParts.push(part.textDelta);
        continue;
      }
      if (part.type === 'finish') {
        const usage = part.usage as LanguageModelV1Usage | undefined;
        if (usage) {
          if (typeof usage.promptTokens === 'number')
            inputTokens = usage.promptTokens;
          if (typeof usage.completionTokens === 'number')
            outputTokens = usage.completionTokens;
        }
        if (typeof part.finishReason === 'string')
          finishReason = part.finishReason;
      }
    }
  } catch {
    // If the upstream errors, log whatever we managed to collect.
  } finally {
    reader.releaseLock();
  }

  return {
    text: textParts.length > 0 ? textParts.join('') : undefined,
    inputTokens,
    outputTokens,
    finishReason,
  };
}

function extractGenerateText(
  result: LanguageModelV1GenerateResult,
): string | undefined {
  if (typeof result.text === 'string' && result.text.length > 0)
    return result.text;
  // If the SDK only returns tool calls, surface a JSON-stringified summary so
  // the dashboard still has a payload to classify against.
  if (Array.isArray(result.toolCalls) && result.toolCalls.length > 0) {
    try {
      return JSON.stringify(result.toolCalls);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function flattenPrompt(prompt: LanguageModelV1Prompt): string {
  if (!Array.isArray(prompt)) return '';
  const parts: string[] = [];
  for (const msg of prompt) {
    if (!msg || typeof msg !== 'object') continue;
    const body =
      typeof msg.content === 'string'
        ? msg.content
        : flattenContentParts(msg.content);
    if (!body) continue;
    parts.push(`${msg.role}: ${body}`);
  }
  return parts.join('\n');
}

function flattenContentParts(parts: LanguageModelV1ContentPart[]): string {
  if (!Array.isArray(parts)) return '';
  const out: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text' && typeof (part as { text?: unknown }).text === 'string') {
      out.push((part as { text: string }).text);
    } else if (
      part.type === 'tool-call' &&
      'toolName' in part &&
      typeof (part as { toolName?: unknown }).toolName === 'string'
    ) {
      out.push(`[tool-call: ${(part as { toolName: string }).toolName}]`);
    } else if (part.type === 'tool-result' && 'toolName' in part) {
      const toolName = (part as { toolName?: unknown }).toolName;
      out.push(`[tool-result: ${typeof toolName === 'string' ? toolName : 'unknown'}]`);
    } else if (part.type === 'image') {
      out.push('[image]');
    }
  }
  return out.join('');
}

function buildLogInput(args: {
  client: FinOpsClient;
  opts: FinOpsMiddlewareOptions;
  params: LanguageModelV1CallOptions;
  model: LanguageModelV1Like;
  latencyMs: number;
  responseText: string | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  finishReason: string | undefined;
}): LogInput {
  const { opts, params, model, latencyMs, responseText, inputTokens, outputTokens, finishReason } =
    args;

  const promptText = flattenPrompt(params.prompt);
  const userId = opts.resolveUserId?.(params);
  const userMetadata = opts.resolveMetadata?.(params);

  const metadata: Record<string, unknown> = {};
  if (model.provider) metadata.aiSdkProvider = model.provider;
  if (model.modelId) metadata.aiSdkModelId = model.modelId;
  if (finishReason) metadata.finishReason = finishReason;
  if (userMetadata) Object.assign(metadata, userMetadata);

  const logInput: LogInput = {
    model: typeof model.modelId === 'string' ? model.modelId : 'unknown',
    promptText,
    latencyMs,
  };
  if (typeof model.provider === 'string') logInput.provider = model.provider;
  if (opts.appName !== undefined) logInput.appName = opts.appName;
  if (userId !== undefined) logInput.userId = userId;
  if (responseText !== undefined) logInput.responseText = responseText;
  if (inputTokens !== undefined) logInput.inputTokens = inputTokens;
  if (outputTokens !== undefined) logInput.outputTokens = outputTokens;
  if (Object.keys(metadata).length > 0) logInput.metadata = metadata;

  return logInput;
}
