// Shared types for AI FinOps — used by API routes, core logic, UI, and SDK.

export type Complexity = 'simple' | 'moderate' | 'complex' | 'multidimensional';

export type Category =
  | 'factual'
  | 'reasoning'
  | 'creative'
  | 'code'
  | 'analytical'
  | 'conversational'
  | 'instructional'
  | 'other';

export interface PromptCharacteristics {
  wordCount: number;
  sentenceCount: number;
  questionCount: number;
  hasCode: boolean;
  hasMultipleQuestions: boolean;
  hasContextDump: boolean;
  hasRedundancy: boolean;
  hasExamples: boolean;
  imperativeVerbs: number;
}

export interface PromptAnalysis {
  inputTokens: number;
  estimatedOutputTokens: number;
  category: Category;
  complexity: Complexity;
  complexityScore: number; // 0-100
  dimensions: string[]; // distinct facets/sub-questions detected
  characteristics: PromptCharacteristics;
}

export type OptimizationType =
  | 'compression'
  | 'remove-redundancy'
  | 'restructure'
  | 'split'
  | 'few-shot-reduction'
  | 'system-prompt-extraction'
  | 'use-cheaper-model'
  | 'cap-output';

export interface OptimizationSuggestion {
  type: OptimizationType;
  title: string;
  description: string;
  before?: string;
  after?: string;
  estimatedTokenSavings: number;
  estimatedCostSavings: number; // USD
  confidence: number; // 0-1
}

export interface OptimizationResult {
  originalPrompt: string;
  optimizedPrompt: string;
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savedPercent: number;
  estimatedCostSavings: number; // USD per call
  suggestions: OptimizationSuggestion[];
  analysis: PromptAnalysis;
}

export interface ModelPricing {
  model: string;
  provider?: string;
  inputCostPer1M: number; // USD per 1M input tokens
  outputCostPer1M: number; // USD per 1M output tokens
  /**
   * Optional. USD per 1M cache-read input tokens (Anthropic ~10% of input,
   * OpenAI ~50%). When undefined, importers fall back to documented family
   * ratios.
   */
  cacheReadCostPer1M?: number;
  /**
   * Optional. USD per 1M cache-write input tokens (Anthropic ~125% of
   * input). When undefined, importers apply a 25% surcharge.
   */
  cacheWriteCostPer1M?: number;
  contextWindow: number;
}

export interface LogIngestPayload {
  model: string;
  provider?: string;
  appName?: string;
  userId?: string;
  promptText: string;
  responseText?: string;
  inputTokens?: number; // if omitted, server will compute
  outputTokens?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export interface StatsResponse {
  totals: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    avgLatencyMs: number;
  };
  potentialSavings: {
    tokens: number;
    cost: number;
    percent: number;
  };
  byCategory: { category: Category; calls: number; tokens: number; cost: number }[];
  byComplexity: { complexity: Complexity; calls: number; tokens: number; cost: number }[];
  byModel: { model: string; calls: number; tokens: number; cost: number }[];
  timeseries: { ts: string; calls: number; tokens: number; cost: number }[];
}

// --- Prompt Studio (from-scratch prompt generation) ---

export type TargetProvider =
  | 'claude' | 'gpt' | 'gemini' | 'copilot' | 'cursor' | 'perplexity' | 'generic';

export type AudienceLevel = 'beginner' | 'general' | 'expert' | 'executive';

export type OutcomeFormat =
  | 'free-text' | 'bullet-list' | 'numbered-list' | 'table'
  | 'code' | 'json' | 'markdown' | 'essay' | 'summary'
  | 'qa-pairs' | 'step-by-step';

export type OutputLength = 'brief' | 'medium' | 'long';
export type Tone = 'neutral' | 'formal' | 'casual' | 'technical' | 'persuasive';
export type VariantStyle = 'terse' | 'standard' | 'detailed' | 'system-and-user';

export interface StudioRequest {
  problem: string;                       // required, what user wants to solve
  desiredOutcome: string;                // required, what kind of answer
  targetProvider: TargetProvider;        // required
  audience?: AudienceLevel;
  outputFormat?: OutcomeFormat;
  outputLength?: OutputLength;
  mustInclude?: string[];
  mustAvoid?: string[];
  tone?: Tone;
  starterPrompt?: string;
  examples?: { input: string; output: string }[];
}

export interface StudioVariant {
  style: VariantStyle;
  prompt: string;
  systemPrompt?: string;
  tokenCount: number;
  estimatedOutputTokens: number;
  estimatedCost: number;                 // USD
  rationale: string;
}

export interface StudioResult {
  detectedComplexity: Complexity;
  detectedCategory: Category;
  detectedDimensions: string[];
  targetProvider: TargetProvider;
  recommendedModel: string;
  variants: StudioVariant[];
  splitPrompts?: string[];                // for multidimensional problems
  warnings: string[];
  tips: string[];
}

// --- Insights (cost-driver analytics) ---

export type RootCauseKind =
  | 'concentration'
  | 'model-mismatch'
  | 'output-bloat'
  | 'redundancy'
  | 'multidim-mega-prompts'
  | 'no-prompt-caching'
  | 'app-hotspot'
  | 'category-skew';

export interface RootCause {
  kind: RootCauseKind;
  title: string;
  description: string;
  estimatedAnnualWaste: number;
  severity: 'high' | 'medium' | 'low';
}

export interface Recommendation {
  id: string;
  title: string;
  rationale: string;
  action: string;
  estimatedMonthlySavings: number;
  estimatedAnnualSavings: number;
  affectedCalls: number;
  confidence: 'high' | 'medium' | 'low';
  category: 'model-routing' | 'prompt-rewrite' | 'caching' | 'output-cap' | 'consolidation' | 'governance';
}

export interface TopSpender {
  id: string;
  timestamp: string;
  appName: string | null;
  model: string;
  category: Category;
  complexity: Complexity;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  promptPreview: string;
}

export interface ModelMismatchRow {
  model: string;
  complexity: Complexity;
  category: Category;
  calls: number;
  totalCost: number;
  recommendedModel: string;
  estimatedSavings: number;
}

export interface RedundancyCluster {
  fingerprint: string;
  samplePrompt: string;
  calls: number;
  totalCost: number;
  avgInputTokens: number;
  estimatedCachingSavings: number;
}

export interface OutputBloatRow {
  id: string;
  model: string;
  category: Category;
  complexity: Complexity;
  inputTokens: number;
  outputTokens: number;
  ratio: number;
  totalCost: number;
  estimatedCapSavings: number;
  promptPreview: string;
}

export interface AppHotspot {
  appName: string | null;
  calls: number;
  totalCost: number;
  pctOfTotal: number;
  topModel: string;
  topCategory: Category;
}

export interface InsightsResponse {
  period: '24h' | '7d' | '30d' | 'all';
  generatedAt: string;
  totals: {
    calls: number;
    cost: number;
    avgCostPerCall: number;
  };
  projectedSavings: {
    monthly: number;
    annual: number;
    percentReduction: number;
  };
  concentration: {
    p20Cost: number;
    p20Percent: number;
    p5Cost: number;
    p5Percent: number;
    giniLike: number;
  };
  rootCauses: RootCause[];
  recommendations: Recommendation[];
  topSpenders: TopSpender[];
  modelMismatch: ModelMismatchRow[];
  redundancyClusters: RedundancyCluster[];
  outputBloat: OutputBloatRow[];
  appHotspots: AppHotspot[];
}
