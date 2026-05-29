export { FinOpsClient } from './client.js';
export {
  withAnthropicLogging,
  withOpenAILogging,
  withGeminiLogging,
  withPerplexityLogging,
  withGenericLogging,
} from './wrappers.js';
export type {
  FinOpsClientOptions,
  LogInput,
  LogResult,
  ExtractedFields,
  ExtractorFn,
  WrapConfig,
} from './types.js';

// ---------- Framework adapters ----------

export {
  FinOpsLangChainHandler,
} from './langchain.js';
export type {
  FinOpsLangChainHandlerOptions,
  LangChainBaseCallbackHandler,
  LangChainSerialized,
  LangChainLLMResult,
} from './langchain.js';

export { finopsMiddleware } from './vercel-ai-sdk.js';
export type {
  FinOpsMiddlewareOptions,
  LanguageModelV1Middleware,
  LanguageModelV1CallOptions,
  LanguageModelV1Prompt,
  LanguageModelV1Message,
  LanguageModelV1ContentPart,
  LanguageModelV1Usage,
  LanguageModelV1GenerateResult,
  LanguageModelV1StreamResult,
  LanguageModelV1StreamPart,
  LanguageModelV1Like,
} from './vercel-ai-sdk.js';

export { finopsOpenAIFetch } from './openai-middleware.js';
export type { FinOpsOpenAIFetchOptions } from './openai-middleware.js';
