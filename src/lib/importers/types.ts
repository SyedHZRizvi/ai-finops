// Shared types for provider usage importers.
//
// Importers pull historical usage data from provider admin APIs (or CSV
// exports), normalize it into rows the dashboard can persist as PromptLog,
// and return them — they do NOT write to the database directly.

export type SupportedProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'azure'
  | 'bedrock'
  | 'vertex'
  | 'csv';

export interface ImporterContext {
  /** Decrypted at the API layer and passed in. Empty string for CSV imports. */
  apiKey: string;
  /** Inclusive lower bound of the time range to fetch. */
  rangeFrom?: Date;
  /** Inclusive upper bound of the time range to fetch. */
  rangeTo?: Date;
  /** Raw CSV text — only used by the CSV importer. */
  csvText?: string;
}

/**
 * One imported usage row, ready to be persisted as a PromptLog.
 *
 * Most provider importers return aggregated rows (per-model-per-day or
 * per-key-per-hour), so a few PromptLog fields are synthesized:
 *  - promptText is a synthetic placeholder
 *  - responseText is null
 *  - characteristics is a minimal JSON
 *  - category/complexity are 'other' / 'simple'
 *  - latencyMs is null
 *
 * The CSV importer may have real prompt text and can populate richer fields.
 */
export interface ImportedRecord {
  timestamp: Date;
  appName?: string;
  userId?: string;
  model: string;
  provider: string;
  promptText: string;
  responseText: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  category: string;
  complexity: string;
  complexityScore: number;
  /** JSON string of `string[]` — typically `"[]"` for aggregates. */
  dimensions: string;
  /** JSON string describing the import source. */
  characteristics: string;
  latencyMs: number | null;
  /**
   * JSON string. Always stamped with `{"source":"import", ...}` so the
   * Insights engine can distinguish imported aggregates from SDK-logged
   * per-prompt rows.
   */
  metadata: string | null;
  potentialSavedTokens: number;
  potentialSavedCost: number;
  /**
   * Number of real LLM calls represented by this row. For SDK-logged rows
   * this is 1. For import-aggregate rows it is the provider's request_count
   * (typically thousands per row). Aggregations that count "calls" sum this
   * column rather than counting rows.
   */
  callCount: number;
}

export interface ImportResult {
  records: ImportedRecord[];
  warnings: string[];
  rawRangeFrom?: Date;
  rawRangeTo?: Date;
}

export interface Importer {
  provider: SupportedProvider;
  label: string;
  /** Fetch and normalize. Network-bound; awaited by the API layer. */
  run(ctx: ImporterContext): Promise<ImportResult>;
}
