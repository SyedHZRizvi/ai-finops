export interface LogInput {
  model: string;
  provider?: string;
  appName?: string;
  userId?: string;
  promptText: string;
  responseText?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export interface LogResult {
  id: string;
  totalCost: number;
  potentialSavedCost: number;
  category: string;
  complexity: string;
}

export interface FinOpsClientOptions {
  baseUrl?: string;
  token?: string;
  appName?: string;
  defaultUserId?: string;
  fireAndForget?: boolean;
  timeoutMs?: number;
  onError?: (err: Error) => void;
  /**
   * Redact or truncate prompt text before it leaves the process. Applied to
   * both `promptText` and `responseText`. Useful for stripping PII.
   */
  transformPrompt?: (prompt: string) => string;
}

export interface ExtractedFields {
  promptText?: string;
  responseText?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export type ExtractorFn<T> = (response: T) => ExtractedFields;

export interface WrapConfig<T> {
  provider: string;
  model: string;
  promptText: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  call: () => Promise<T>;
  extract: ExtractorFn<T>;
}
