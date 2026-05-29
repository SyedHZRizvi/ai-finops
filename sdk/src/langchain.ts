/**
 * LangChain callback handler for the AI FinOps SDK.
 *
 * LangChain exposes a `BaseCallbackHandler` extension point — any object that
 * implements the handler interface can be passed in the `callbacks: [...]`
 * array on a model, chain, or runnable, and LangChain will call the matching
 * lifecycle methods as the run progresses.
 *
 * We do NOT import LangChain here — that would force every consumer of this
 * SDK to install it. Instead we declare just enough of LangChain's public
 * callback surface as TypeScript interfaces, and the handler we expose
 * structurally satisfies LangChain's `BaseCallbackHandler` contract at runtime.
 *
 * Usage (the user supplies LangChain themselves):
 *
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { FinOpsClient, FinOpsLangChainHandler } from '@ai-finops/sdk';
 *
 *   const finops = new FinOpsClient({ appName: 'rag-pipeline' });
 *   const handler = new FinOpsLangChainHandler(finops);
 *
 *   const model = new ChatOpenAI({
 *     model: 'gpt-4o-mini',
 *     callbacks: [handler],
 *   });
 *
 *   await model.invoke('Summarize the doc');
 */

import type { FinOpsClient } from './client.js';
import type { LogInput } from './types.js';

// ---------------------------------------------------------------------------
// Minimal LangChain types — structural duplicates of LangChain's public API.
// We re-declare them here so we never import `langchain` or `@langchain/core`.
// ---------------------------------------------------------------------------

/**
 * LangChain's `Serialized` shape (subset). LangChain serializes runnables
 * before invoking callbacks; only the fields we read are typed.
 */
export interface LangChainSerialized {
  lc?: number;
  type?: string;
  id?: string[];
  name?: string;
  kwargs?: Record<string, unknown>;
}

/**
 * LangChain's `LLMResult` shape (subset). The framework's actual type lives
 * in `@langchain/core/outputs` — we mirror only what we read.
 */
export interface LangChainLLMResult {
  generations: Array<
    Array<{
      text?: string;
      message?: {
        content?: unknown;
        additional_kwargs?: Record<string, unknown>;
      };
      generationInfo?: Record<string, unknown>;
    }>
  >;
  llmOutput?: {
    tokenUsage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    // OpenAI-style alternative shape that some integrations surface.
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    modelName?: string;
    model_name?: string;
    [key: string]: unknown;
  };
}

/**
 * LangChain's `BaseCallbackHandler` shape. The real class lives at
 * `@langchain/core/callbacks/base`. We expose the subset our handler uses,
 * with all hook methods optional — LangChain only invokes methods that exist.
 */
export interface LangChainBaseCallbackHandler {
  name: string;
  ignoreLLM?: boolean;
  ignoreChain?: boolean;
  ignoreAgent?: boolean;
  ignoreRetriever?: boolean;

  handleLLMStart?(
    llm: LangChainSerialized,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ): unknown | Promise<unknown>;

  handleChatModelStart?(
    llm: LangChainSerialized,
    messages: unknown[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ): unknown | Promise<unknown>;

  handleLLMEnd?(
    output: LangChainLLMResult,
    runId: string,
    parentRunId?: string,
    tags?: string[],
  ): unknown | Promise<unknown>;

  handleLLMError?(
    err: unknown,
    runId: string,
    parentRunId?: string,
    tags?: string[],
  ): unknown | Promise<unknown>;

  handleChainStart?(
    chain: LangChainSerialized,
    inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runType?: string,
    runName?: string,
  ): unknown | Promise<unknown>;

  handleChainEnd?(
    outputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    kwargs?: Record<string, unknown>,
  ): unknown | Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Internal per-run state. We stash the prompt and start time when LangChain
// fires `handleLLMStart` / `handleChatModelStart`, then look it up again on
// `handleLLMEnd` to assemble the final LogInput.
// ---------------------------------------------------------------------------

interface RunState {
  promptText: string;
  model: string | undefined;
  provider: string | undefined;
  startedAt: number;
  metadata: Record<string, unknown>;
  userId: string | undefined;
}

export interface FinOpsLangChainHandlerOptions {
  /** Overrides the FinOpsClient's `appName` for the duration of this handler. */
  appName?: string;
  /**
   * Optional resolver if your chain identifies the end user out of band
   * (e.g. from a parent run tag). Returns the user id to attach to the log.
   */
  resolveUserId?: (ctx: {
    runId: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }) => string | undefined;
}

// ---------------------------------------------------------------------------
// FinOpsLangChainHandler
// ---------------------------------------------------------------------------

export class FinOpsLangChainHandler implements LangChainBaseCallbackHandler {
  /** LangChain reads `name` for trace display. */
  readonly name = 'FinOpsLangChainHandler';

  private readonly client: FinOpsClient;
  private readonly appName: string | undefined;
  private readonly resolveUserId:
    | FinOpsLangChainHandlerOptions['resolveUserId']
    | undefined;
  private readonly runs = new Map<string, RunState>();

  constructor(client: FinOpsClient, opts: FinOpsLangChainHandlerOptions = {}) {
    this.client = client;
    this.appName = opts.appName;
    this.resolveUserId = opts.resolveUserId;
  }

  // --- LLM lifecycle (text-completion-style models) ------------------------

  handleLLMStart(
    llm: LangChainSerialized,
    prompts: string[],
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
  ): void {
    this.recordStart(
      runId,
      joinPrompts(prompts),
      llm,
      extraParams,
      tags,
      metadata,
    );
  }

  // --- Chat-model lifecycle ------------------------------------------------

  handleChatModelStart(
    llm: LangChainSerialized,
    messages: unknown[][],
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
  ): void {
    this.recordStart(
      runId,
      flattenChatMessages(messages),
      llm,
      extraParams,
      tags,
      metadata,
    );
  }

  handleLLMEnd(output: LangChainLLMResult, runId: string): void {
    const state = this.runs.get(runId);
    this.runs.delete(runId);
    if (!state) return;

    const latencyMs = Date.now() - state.startedAt;
    const responseText = extractResponseText(output);
    const tokens = extractTokenUsage(output);
    const resolvedModel =
      state.model ??
      readString(output.llmOutput, 'modelName') ??
      readString(output.llmOutput, 'model_name') ??
      'unknown';

    const logInput: LogInput = {
      model: resolvedModel,
      promptText: state.promptText,
      latencyMs,
    };
    if (state.provider !== undefined) logInput.provider = state.provider;
    if (this.appName !== undefined) logInput.appName = this.appName;
    if (state.userId !== undefined) logInput.userId = state.userId;
    if (responseText !== undefined) logInput.responseText = responseText;
    if (tokens.inputTokens !== undefined)
      logInput.inputTokens = tokens.inputTokens;
    if (tokens.outputTokens !== undefined)
      logInput.outputTokens = tokens.outputTokens;
    if (Object.keys(state.metadata).length > 0)
      logInput.metadata = state.metadata;

    // Fire-and-forget — the FinOpsClient already swallows errors via onError.
    void this.client.log(logInput);
  }

  handleLLMError(_err: unknown, runId: string): void {
    // Drop the pending state so we don't leak memory on errored runs.
    this.runs.delete(runId);
  }

  // --- Chain lifecycle ------------------------------------------------------
  // We intentionally only observe chain start/end. Per-LLM-call usage is the
  // unit we cost-track; chain spans are useful as breadcrumbs in `metadata`.

  handleChainStart(
    _chain: LangChainSerialized,
    _inputs: Record<string, unknown>,
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
  ): void {
    // No-op: present so LangChain's runtime sees the hook is defined and we
    // satisfy the BaseCallbackHandler interface cleanly. Future extension
    // point if we want to log chain-level totals.
  }

  handleChainEnd(
    _outputs: Record<string, unknown>,
    _runId: string,
  ): void {
    // No-op (see handleChainStart).
  }

  // -------------------------------------------------------------------------

  private recordStart(
    runId: string,
    promptText: string,
    llm: LangChainSerialized,
    extraParams: Record<string, unknown> | undefined,
    tags: string[] | undefined,
    metadata: Record<string, unknown> | undefined,
  ): void {
    const { model, provider } = extractModelInfo(llm, extraParams);
    const userId = this.resolveUserId
      ? this.resolveUserId({
          runId,
          ...(tags !== undefined ? { tags } : {}),
          ...(metadata !== undefined ? { metadata } : {}),
        })
      : undefined;

    this.runs.set(runId, {
      promptText,
      model,
      provider,
      startedAt: Date.now(),
      metadata: buildMetadata(tags, metadata, llm),
      userId,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function joinPrompts(prompts: string[]): string {
  return prompts.filter((p) => typeof p === 'string').join('\n\n');
}

function flattenChatMessages(messages: unknown[][]): string {
  const parts: string[] = [];
  for (const turn of messages) {
    if (!Array.isArray(turn)) continue;
    for (const msg of turn) {
      const text = stringifyChatMessage(msg);
      if (text) parts.push(text);
    }
  }
  return parts.join('\n');
}

function stringifyChatMessage(msg: unknown): string | undefined {
  if (!msg || typeof msg !== 'object') return undefined;
  const obj = msg as Record<string, unknown>;
  // LangChain BaseMessage instances expose `.content` and `._getType()`. We
  // can't call methods on an `unknown` value, so we read `content` directly.
  const content = obj.content;
  const role =
    typeof obj.role === 'string'
      ? obj.role
      : typeof obj._getType === 'function'
        ? safeCallType(obj._getType)
        : undefined;
  const body = typeof content === 'string' ? content : stringifyContent(content);
  if (!body) return undefined;
  return role ? `${role}: ${body}` : body;
}

function safeCallType(fn: unknown): string | undefined {
  try {
    const result = (fn as () => unknown)();
    return typeof result === 'string' ? result : undefined;
  } catch {
    return undefined;
  }
}

function stringifyContent(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part);
    } else if (part && typeof part === 'object' && 'text' in part) {
      const text = (part as { text: unknown }).text;
      if (typeof text === 'string') parts.push(text);
    }
  }
  return parts.length > 0 ? parts.join('') : undefined;
}

function extractResponseText(output: LangChainLLMResult): string | undefined {
  const generations = output.generations;
  if (!Array.isArray(generations) || generations.length === 0) return undefined;
  const parts: string[] = [];
  for (const group of generations) {
    if (!Array.isArray(group)) continue;
    for (const gen of group) {
      if (typeof gen.text === 'string' && gen.text.length > 0) {
        parts.push(gen.text);
        continue;
      }
      const msgContent = gen.message?.content;
      const stringified = stringifyContent(msgContent);
      if (stringified) parts.push(stringified);
    }
  }
  return parts.length > 0 ? parts.join('') : undefined;
}

function extractTokenUsage(output: LangChainLLMResult): {
  inputTokens?: number;
  outputTokens?: number;
} {
  const out: { inputTokens?: number; outputTokens?: number } = {};
  const tokenUsage = output.llmOutput?.tokenUsage;
  if (tokenUsage) {
    if (typeof tokenUsage.promptTokens === 'number')
      out.inputTokens = tokenUsage.promptTokens;
    if (typeof tokenUsage.completionTokens === 'number')
      out.outputTokens = tokenUsage.completionTokens;
  }
  const usage = output.llmOutput?.usage;
  if (usage) {
    if (out.inputTokens === undefined && typeof usage.prompt_tokens === 'number')
      out.inputTokens = usage.prompt_tokens;
    if (
      out.outputTokens === undefined &&
      typeof usage.completion_tokens === 'number'
    )
      out.outputTokens = usage.completion_tokens;
  }
  return out;
}

function extractModelInfo(
  llm: LangChainSerialized,
  extraParams: Record<string, unknown> | undefined,
): { model: string | undefined; provider: string | undefined } {
  const kwargs = llm.kwargs ?? {};
  const invocation =
    (extraParams && (extraParams.invocation_params as unknown)) ?? undefined;
  const invocationParams =
    invocation && typeof invocation === 'object'
      ? (invocation as Record<string, unknown>)
      : {};

  const model =
    readString(invocationParams, 'model') ??
    readString(invocationParams, 'model_name') ??
    readString(kwargs, 'model') ??
    readString(kwargs, 'modelName') ??
    readString(kwargs, 'model_name');

  const provider = inferProvider(llm, invocationParams);

  return { model, provider };
}

function inferProvider(
  llm: LangChainSerialized,
  invocationParams: Record<string, unknown>,
): string | undefined {
  // `id` is LangChain's import path, e.g. ["langchain", "chat_models",
  // "openai", "ChatOpenAI"] — the third segment is a strong provider signal.
  if (Array.isArray(llm.id)) {
    for (const segment of llm.id) {
      if (typeof segment !== 'string') continue;
      const lower = segment.toLowerCase();
      if (lower.includes('openai')) return 'openai';
      if (lower.includes('anthropic')) return 'anthropic';
      if (lower.includes('googlegenerativeai') || lower === 'google') return 'google';
      if (lower.includes('cohere')) return 'cohere';
      if (lower.includes('mistral')) return 'mistral';
      if (lower.includes('bedrock')) return 'bedrock';
      if (lower.includes('vertex')) return 'google';
      if (lower.includes('ollama')) return 'ollama';
    }
  }
  const explicit = readString(invocationParams, '_type');
  if (explicit) return explicit;
  return undefined;
}

function buildMetadata(
  tags: string[] | undefined,
  metadata: Record<string, unknown> | undefined,
  llm: LangChainSerialized,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (tags && tags.length > 0) out.langchainTags = tags;
  if (metadata && Object.keys(metadata).length > 0) {
    out.langchainMetadata = metadata;
  }
  if (llm.name) out.langchainRunnable = llm.name;
  return out;
}

function readString(
  obj: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!obj) return undefined;
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}
