// Small HTTP wrapper around the AI FinOps REST API.
//
// The MCP server lives in its own process and talks to the running Next.js
// dashboard over HTTP. We do NOT import anything from the dashboard's source
// tree — that would couple build outputs and pull Next/Prisma into a stdio
// JSON-RPC binary that has no business shipping them. Instead, this is a
// hand-written thin client with one method per REST endpoint.
//
// Every method:
//   1. Builds the right URL + body.
//   2. Calls fetch() with an AbortSignal so a hung dashboard cannot wedge the
//      MCP server (Claude Desktop sees the server as "not responding" and
//      gives up on the tool call — bad UX).
//   3. Throws a `FinOpsApiError` with a helpful message on non-2xx so the
//      tool layer can format it for the LLM without leaking stack traces.

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 30_000;

export interface FinOpsApiClientOptions {
  baseUrl: string;
  /** Optional ingest token. Required only if the server enforces auth on /api/log; other endpoints do not check it today. */
  token?: string;
  /** Per-request timeout in milliseconds. Defaults to 30s. */
  timeoutMs?: number;
}

export class FinOpsApiError extends Error {
  readonly status: number | undefined;
  readonly url: string;
  constructor(message: string, opts: { status?: number; url: string; cause?: unknown }) {
    super(message);
    this.name = 'FinOpsApiError';
    this.status = opts.status;
    this.url = opts.url;
    if (opts.cause !== undefined) {
      // Set .cause for Node's default error formatter without forcing the
      // strict ES2022 ErrorOptions type on older TS targets.
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

// --- Request/response shapes -----------------------------------------------
//
// We mirror just enough of the dashboard's response types here to keep this
// file standalone. If the dashboard changes a field name the worst that can
// happen is one tool prints "undefined" — we never throw on missing fields.

export type Period = '24h' | '7d' | '30d' | 'all';

export type TargetProvider =
  | 'claude' | 'gpt' | 'gemini' | 'copilot' | 'cursor' | 'perplexity' | 'generic';

export interface OptimizeInput {
  prompt: string;
  model?: string;
}

export interface OptimizationSuggestion {
  type: string;
  title: string;
  description: string;
  before?: string;
  after?: string;
  estimatedTokenSavings: number;
  estimatedCostSavings: number;
  confidence: number;
}

export interface OptimizeResult {
  originalPrompt: string;
  optimizedPrompt: string;
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savedPercent: number;
  estimatedCostSavings: number;
  suggestions: OptimizationSuggestion[];
  analysis: {
    inputTokens: number;
    estimatedOutputTokens: number;
    category: string;
    complexity: string;
    complexityScore: number;
    dimensions: string[];
    characteristics: Record<string, unknown>;
  };
}

export interface GenerateInput {
  problem: string;
  desiredOutcome?: string;
  targetProvider: TargetProvider;
  audience?: 'beginner' | 'general' | 'expert' | 'executive';
  outputFormat?:
    | 'free-text' | 'bullet-list' | 'numbered-list' | 'table'
    | 'code' | 'json' | 'markdown' | 'essay' | 'summary'
    | 'qa-pairs' | 'step-by-step';
  outputLength?: 'brief' | 'medium' | 'long';
  mustInclude?: string[];
  mustAvoid?: string[];
  tone?: 'neutral' | 'formal' | 'casual' | 'technical' | 'persuasive';
  starterPrompt?: string;
  examples?: { input: string; output: string }[];
}

export interface StudioVariant {
  style: 'terse' | 'standard' | 'detailed' | 'system-and-user';
  prompt: string;
  systemPrompt?: string;
  tokenCount: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  rationale: string;
}

export interface GenerateResult {
  detectedComplexity: string;
  detectedCategory: string;
  detectedDimensions: string[];
  targetProvider: TargetProvider;
  recommendedModel: string;
  variants: StudioVariant[];
  splitPrompts?: string[];
  warnings: string[];
  tips: string[];
}

export interface CompareSide {
  prompt: string;
  label?: string;
}

export interface CompareInput {
  a: CompareSide;
  b: CompareSide;
  model?: string;
}

export interface ComparedSide {
  prompt: string;
  tokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  category: string;
  complexity: string;
  complexityScore: number;
  dimensions: string[];
}

export interface CompareResult {
  a: ComparedSide;
  b: ComparedSide;
  savings: { tokens: number; tokensPercent: number; cost: number; costPercent: number };
  verdict: 'a-better' | 'b-better' | 'tie';
  analysisNotes: string[];
}

export interface StatsResult {
  totals: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    avgLatencyMs: number;
  };
  potentialSavings: { tokens: number; cost: number; percent: number };
  byCategory: { category: string; calls: number; tokens: number; cost: number }[];
  byComplexity: { complexity: string; calls: number; tokens: number; cost: number }[];
  byModel: { model: string; calls: number; tokens: number; cost: number }[];
  timeseries: { ts: string; calls: number; tokens: number; cost: number }[];
}

export interface InsightsResult {
  period: Period;
  generatedAt: string;
  totals: { calls: number; cost: number; avgCostPerCall: number };
  projectedSavings: { monthly: number; annual: number; percentReduction: number };
  concentration: { p20Cost: number; p20Percent: number; p5Cost: number; p5Percent: number; giniLike: number };
  rootCauses: {
    kind: string;
    title: string;
    description: string;
    estimatedAnnualWaste: number;
    severity: 'high' | 'medium' | 'low';
  }[];
  recommendations: {
    id: string;
    title: string;
    rationale: string;
    action: string;
    estimatedMonthlySavings: number;
    estimatedAnnualSavings: number;
    affectedCalls: number;
    confidence: 'high' | 'medium' | 'low';
    category: string;
  }[];
  topSpenders: {
    id: string;
    timestamp: string;
    appName: string | null;
    model: string;
    category: string;
    complexity: string;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    promptPreview: string;
  }[];
  modelMismatch: {
    model: string;
    complexity: string;
    category: string;
    calls: number;
    totalCost: number;
    recommendedModel: string;
    estimatedSavings: number;
  }[];
  redundancyClusters: {
    fingerprint: string;
    samplePrompt: string;
    calls: number;
    totalCost: number;
    avgInputTokens: number;
    estimatedCachingSavings: number;
  }[];
  outputBloat: {
    id: string;
    model: string;
    category: string;
    complexity: string;
    inputTokens: number;
    outputTokens: number;
    ratio: number;
    totalCost: number;
    estimatedCapSavings: number;
    promptPreview: string;
  }[];
  appHotspots: {
    appName: string | null;
    calls: number;
    totalCost: number;
    pctOfTotal: number;
    topModel: string;
    topCategory: string;
  }[];
}

export interface AnomalyItem {
  id: string;
  kind: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  description: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  metadata: unknown;
}

export interface AnomaliesResult {
  items: AnomalyItem[];
  total: number;
}

export interface AnalyzeResult {
  inputTokens: number;
  estimatedOutputTokens: number;
  category: string;
  complexity: string;
  complexityScore: number;
  dimensions: string[];
  characteristics: Record<string, unknown>;
}

// --- The client -----------------------------------------------------------

export class FinOpsApiClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(opts: FinOpsApiClientOptions) {
    // Strip trailing slashes so callers can pass `https://x.com/` or
    // `https://x.com` and we always build URLs with one slash.
    this.baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get base(): string {
    return this.baseUrl;
  }

  async optimize(input: OptimizeInput): Promise<OptimizeResult> {
    return this.request<OptimizeResult>('POST', '/api/optimize', input);
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    // The route requires `desiredOutcome` (zod .default('')), so fall back to
    // empty string here for callers that only pass `problem`.
    const body = { desiredOutcome: '', ...input };
    return this.request<GenerateResult>('POST', '/api/studio', body);
  }

  async compare(input: CompareInput): Promise<CompareResult> {
    return this.request<CompareResult>('POST', '/api/compare', input);
  }

  async analyze(input: { prompt: string; model?: string }): Promise<AnalyzeResult> {
    // The dashboard does not expose a standalone /api/analyze. Optimize gives
    // us the full PromptAnalysis under `analysis` plus all the token math we
    // need — pull it out and return just the analysis portion.
    const result = await this.optimize(input);
    return result.analysis as AnalyzeResult;
  }

  async stats(period: Period = '7d'): Promise<StatsResult> {
    return this.request<StatsResult>('GET', `/api/stats?period=${encodeURIComponent(period)}`);
  }

  async insights(period: Period = '30d'): Promise<InsightsResult> {
    return this.request<InsightsResult>('GET', `/api/insights?period=${encodeURIComponent(period)}`);
  }

  async anomalies(opts: {
    severity?: 'info' | 'warn' | 'critical';
    kind?: string;
    unresolved?: boolean;
    limit?: number;
  } = {}): Promise<AnomaliesResult> {
    const params = new URLSearchParams();
    if (opts.severity) params.set('severity', opts.severity);
    if (opts.kind) params.set('kind', opts.kind);
    if (opts.unresolved) params.set('unresolved', 'true');
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return this.request<AnomaliesResult>('GET', `/api/anomaly${qs ? `?${qs}` : ''}`);
  }

  /**
   * Health check — used at startup to give the user a useful warning if the
   * dashboard isn't running yet, without crashing the MCP server. We only
   * care that the request returns 2xx; the body shape is whatever the
   * dashboard chooses to return ({ status, ... } at time of writing).
   */
  async health(): Promise<{ status?: string; [key: string]: unknown }> {
    return this.request<{ status?: string; [key: string]: unknown }>('GET', '/api/health');
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        // Network-level failure — DNS, refused, aborted. Surface a clean
        // message that names the URL so the LLM can tell the user where to
        // look ("is your dashboard running on localhost:3000?").
        const cause = err instanceof Error ? err : new Error(String(err));
        const isAbort = cause.name === 'AbortError';
        const msg = isAbort
          ? `Request to ${url} timed out after ${this.timeoutMs}ms. Is the AI FinOps dashboard reachable?`
          : `Cannot reach AI FinOps at ${this.baseUrl}. ${cause.message}. Make sure the dashboard is running and FINOPS_BASE_URL is correct.`;
        throw new FinOpsApiError(msg, { url, cause });
      }

      if (!res.ok) {
        let detail = '';
        try {
          const text = await res.text();
          // Try to pull a JSON `error` field if the route returns one.
          try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && 'error' in parsed) {
              detail = String((parsed as { error: unknown }).error);
            } else {
              detail = text.slice(0, 500);
            }
          } catch {
            detail = text.slice(0, 500);
          }
        } catch {
          /* ignore body read errors */
        }
        throw new FinOpsApiError(
          `AI FinOps API ${method} ${path} returned ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`,
          { status: res.status, url },
        );
      }

      try {
        return (await res.json()) as T;
      } catch (err) {
        const cause = err instanceof Error ? err : new Error(String(err));
        throw new FinOpsApiError(
          `AI FinOps API ${method} ${path} returned a non-JSON response.`,
          { url, cause },
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
