import type { FinOpsClient } from './client.js';

interface AnthropicLikeResponse {
  content: unknown;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface OpenAILikeResponse {
  choices: unknown[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface WrapArgs {
  model: string;
  promptText: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export function withAnthropicLogging<T extends AnthropicLikeResponse>(
  client: FinOpsClient,
  args: WrapArgs,
  call: () => Promise<T>,
): Promise<T> {
  return client.wrap<T>({
    provider: 'anthropic',
    model: args.model,
    promptText: args.promptText,
    ...(args.userId !== undefined ? { userId: args.userId } : {}),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    call,
    extract: (res) => {
      const out: {
        responseText?: string;
        inputTokens?: number;
        outputTokens?: number;
      } = {};
      const text = extractAnthropicText(res.content);
      if (text !== undefined) out.responseText = text;
      if (typeof res.usage?.input_tokens === 'number')
        out.inputTokens = res.usage.input_tokens;
      if (typeof res.usage?.output_tokens === 'number')
        out.outputTokens = res.usage.output_tokens;
      return out;
    },
  });
}

export function withOpenAILogging<T extends OpenAILikeResponse>(
  client: FinOpsClient,
  args: WrapArgs,
  call: () => Promise<T>,
): Promise<T> {
  return client.wrap<T>({
    provider: 'openai',
    model: args.model,
    promptText: args.promptText,
    ...(args.userId !== undefined ? { userId: args.userId } : {}),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    call,
    extract: (res) => {
      const out: {
        responseText?: string;
        inputTokens?: number;
        outputTokens?: number;
      } = {};
      const text = extractOpenAIText(res.choices);
      if (text !== undefined) out.responseText = text;
      if (typeof res.usage?.prompt_tokens === 'number')
        out.inputTokens = res.usage.prompt_tokens;
      if (typeof res.usage?.completion_tokens === 'number')
        out.outputTokens = res.usage.completion_tokens;
      return out;
    },
  });
}

function extractAnthropicText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      'type' in block &&
      (block as { type: unknown }).type === 'text' &&
      'text' in block &&
      typeof (block as { text: unknown }).text === 'string'
    ) {
      parts.push((block as { text: string }).text);
    }
  }
  return parts.length > 0 ? parts.join('') : undefined;
}

function extractOpenAIText(choices: unknown[]): string | undefined {
  const first = choices[0];
  if (!first || typeof first !== 'object') return undefined;
  const message = (first as { message?: unknown }).message;
  if (message && typeof message === 'object') {
    const content = (message as { content?: unknown }).content;
    if (typeof content === 'string') return content;
  }
  // Legacy completions API surfaces `.text` directly on the choice.
  const text = (first as { text?: unknown }).text;
  return typeof text === 'string' ? text : undefined;
}

// ---------- Gemini ----------

interface GeminiLikeResponse {
  candidates?: unknown[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

export function withGeminiLogging<T extends GeminiLikeResponse>(
  client: FinOpsClient,
  args: WrapArgs,
  call: () => Promise<T>,
): Promise<T> {
  return client.wrap<T>({
    provider: 'google',
    model: args.model,
    promptText: args.promptText,
    ...(args.userId !== undefined ? { userId: args.userId } : {}),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    call,
    extract: (res) => {
      const out: {
        responseText?: string;
        inputTokens?: number;
        outputTokens?: number;
      } = {};
      const text = extractGeminiText(res.candidates);
      if (text !== undefined) out.responseText = text;
      if (typeof res.usageMetadata?.promptTokenCount === 'number')
        out.inputTokens = res.usageMetadata.promptTokenCount;
      if (typeof res.usageMetadata?.candidatesTokenCount === 'number')
        out.outputTokens = res.usageMetadata.candidatesTokenCount;
      return out;
    },
  });
}

function extractGeminiText(candidates: unknown): string | undefined {
  if (!Array.isArray(candidates)) return undefined;
  const first = candidates[0];
  if (!first || typeof first !== 'object') return undefined;
  const content = (first as { content?: unknown }).content;
  if (!content || typeof content !== 'object') return undefined;
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return undefined;
  const out: string[] = [];
  for (const part of parts) {
    if (part && typeof part === 'object' && 'text' in part) {
      const t = (part as { text: unknown }).text;
      if (typeof t === 'string') out.push(t);
    }
  }
  return out.length > 0 ? out.join('') : undefined;
}

// ---------- Perplexity (OpenAI-compatible chat completions shape) ----------

export function withPerplexityLogging<T extends OpenAILikeResponse>(
  client: FinOpsClient,
  args: WrapArgs,
  call: () => Promise<T>,
): Promise<T> {
  return client.wrap<T>({
    provider: 'perplexity',
    model: args.model,
    promptText: args.promptText,
    ...(args.userId !== undefined ? { userId: args.userId } : {}),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    call,
    extract: (res) => {
      const out: {
        responseText?: string;
        inputTokens?: number;
        outputTokens?: number;
      } = {};
      const text = extractOpenAIText(res.choices);
      if (text !== undefined) out.responseText = text;
      if (typeof res.usage?.prompt_tokens === 'number')
        out.inputTokens = res.usage.prompt_tokens;
      if (typeof res.usage?.completion_tokens === 'number')
        out.outputTokens = res.usage.completion_tokens;
      return out;
    },
  });
}

// ---------- Generic (provider-agnostic; caller supplies usage) ----------

interface GenericWrapArgs extends WrapArgs {
  provider?: string;
  extract: (response: unknown) => {
    responseText?: string;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export function withGenericLogging<T>(
  client: FinOpsClient,
  args: GenericWrapArgs,
  call: () => Promise<T>,
): Promise<T> {
  return client.wrap<T>({
    provider: args.provider ?? 'custom',
    model: args.model,
    promptText: args.promptText,
    ...(args.userId !== undefined ? { userId: args.userId } : {}),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    call,
    extract: args.extract as (res: T) => ReturnType<GenericWrapArgs['extract']>,
  });
}
