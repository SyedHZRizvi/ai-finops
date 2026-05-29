// MCP tool definitions for the AI FinOps server.
//
// Each tool has:
//   - a `name` (the LLM matches user requests against this)
//   - a `description` (the LLM uses this to choose between tools — make these
//     action-oriented sentences that match how a user would phrase the ask)
//   - a `schema` (zod) describing the inputs the LLM must produce
//   - a `handler` that calls the FinOps REST API and returns plain text
//     wrapped in MCP's content format.
//
// The MCP spec wants `inputSchema` as a JSON Schema object on the wire. We
// keep zod as the source of truth and convert with a tiny helper so we don't
// pull in a third-party converter just for this. The schemas here are flat
// enough that the hand-written conversion stays trivial.

import { z, type ZodTypeAny } from 'zod';
import {
  FinOpsApiClient,
  FinOpsApiError,
  type Period,
} from './client.js';

// --- zod → JSON Schema (just enough) ---------------------------------------

// We only support the primitives we actually use in our tool inputs. If we
// ever add deeper nesting (oneOf, etc.) consider pulling in zod-to-json-schema
// — but for now, less code = less to debug.
type JsonSchema = {
  type?: string;
  description?: string;
  enum?: readonly unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean;
  default?: unknown;
};

function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  // Unwrap ZodDefault / ZodOptional so we can read the inner type while
  // preserving the default value.
  let inner: ZodTypeAny = schema;
  let defaultValue: unknown = undefined;
  let isOptional = false;

  while (true) {
    const typeName = (inner._def as { typeName?: string }).typeName;
    if (typeName === 'ZodOptional') {
      isOptional = true;
      inner = (inner._def as { innerType: ZodTypeAny }).innerType;
    } else if (typeName === 'ZodDefault') {
      const def = inner._def as { defaultValue: () => unknown; innerType: ZodTypeAny };
      defaultValue = def.defaultValue();
      inner = def.innerType;
    } else {
      break;
    }
  }

  const description = (inner._def as { description?: string }).description;
  const typeName = (inner._def as { typeName?: string }).typeName;
  const base: JsonSchema = {};
  if (description) base.description = description;
  if (defaultValue !== undefined) base.default = defaultValue;

  switch (typeName) {
    case 'ZodString':
      base.type = 'string';
      break;
    case 'ZodNumber':
      base.type = 'number';
      break;
    case 'ZodBoolean':
      base.type = 'boolean';
      break;
    case 'ZodEnum': {
      const values = (inner._def as { values: readonly string[] }).values;
      base.type = 'string';
      base.enum = values;
      break;
    }
    case 'ZodArray': {
      const itemType = (inner._def as { type: ZodTypeAny }).type;
      base.type = 'array';
      base.items = zodToJsonSchema(itemType);
      break;
    }
    case 'ZodObject': {
      const shape = (inner as z.ZodObject<z.ZodRawShape>).shape;
      base.type = 'object';
      base.properties = {};
      base.required = [];
      base.additionalProperties = false;
      for (const [key, value] of Object.entries(shape)) {
        const v = value as ZodTypeAny;
        base.properties[key] = zodToJsonSchema(v);
        const innerTypeName = (v._def as { typeName?: string }).typeName;
        if (innerTypeName !== 'ZodOptional' && innerTypeName !== 'ZodDefault') {
          base.required.push(key);
        }
      }
      if (base.required.length === 0) delete base.required;
      break;
    }
    default:
      // Fallback — keep tools loadable even if we miss a type.
      base.type = 'string';
  }

  // If we unwrapped a ZodOptional but the parent didn't mark this as required
  // we still want to surface that this field is not required at the parent
  // level. That's handled by the parent ZodObject branch above.
  void isOptional;

  return base;
}

// --- Tool registry ---------------------------------------------------------

export interface McpContent {
  type: 'text';
  text: string;
}

export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: ZodTypeAny;
  handler: (input: unknown, client: FinOpsApiClient) => Promise<McpToolResult>;
}

// --- Formatting helpers ----------------------------------------------------

function usd(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return '$0';
  const abs = Math.abs(n);
  // For tiny per-call costs show 4 decimals; for aggregate totals show 2.
  const d = abs < 1 ? digits : 2;
  return `$${n.toFixed(d)}`;
}

function pct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(digits)}%`;
}

function tokens(n: number): string {
  return `${n.toLocaleString()} tokens`;
}

function truncate(s: string, max = 120): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function ok(text: string): McpToolResult {
  return { content: [{ type: 'text', text }] };
}

function fail(err: unknown, base?: string): McpToolResult {
  let msg: string;
  if (err instanceof FinOpsApiError) {
    msg = err.message;
  } else if (err instanceof Error) {
    msg = err.message;
  } else {
    msg = String(err);
  }
  const finalMessage = base ? `${base}\n\n${msg}` : msg;
  return { content: [{ type: 'text', text: finalMessage }], isError: true };
}

// --- Tool: optimize_prompt --------------------------------------------------

const OptimizeSchema = z.object({
  prompt: z.string().describe('The full prompt text to optimize.'),
  model: z
    .string()
    .optional()
    .describe('Model name the prompt is intended for (e.g. "claude-sonnet-4-5", "gpt-4o", "gpt-4o-mini"). Used for accurate token-pricing math. Defaults to a generic estimate.'),
});

const optimizeTool: ToolDefinition = {
  name: 'optimize_prompt',
  description:
    'Take an existing prompt and return a leaner, optimized version. Reports tokens saved, dollar cost saved per call, and the specific changes applied (redundancy removal, compression, model-downgrade suggestion, output cap, etc.). Use this whenever the user shares a prompt and asks to make it better, shorter, cheaper, or more efficient.',
  schema: OptimizeSchema,
  handler: async (input, client) => {
    const parsed = OptimizeSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error, 'Invalid arguments for optimize_prompt.');
    try {
      const r = await client.optimize(parsed.data);
      const lines: string[] = [];
      lines.push(`Optimization result for ${parsed.data.model ?? 'generic model'}`);
      lines.push('');
      lines.push(`Original: ${tokens(r.originalTokens)}`);
      lines.push(`Optimized: ${tokens(r.optimizedTokens)} (${pct(r.savedPercent)} shorter)`);
      lines.push(`Saved per call: ${tokens(r.savedTokens)} / ${usd(r.estimatedCostSavings)}`);
      lines.push(`Detected category: ${r.analysis.category}, complexity: ${r.analysis.complexity} (score ${r.analysis.complexityScore}/100)`);
      lines.push('');
      lines.push('--- Optimized prompt ---');
      lines.push(r.optimizedPrompt);
      lines.push('--- end ---');
      if (r.suggestions.length > 0) {
        lines.push('');
        lines.push(`Applied / suggested optimizations (${r.suggestions.length}):`);
        for (const s of r.suggestions) {
          const confPct = Math.round(s.confidence * 100);
          lines.push(`- [${s.type}] ${s.title} — save ${tokens(s.estimatedTokenSavings)} / ${usd(s.estimatedCostSavings)} (confidence ${confPct}%)`);
          if (s.description) lines.push(`    ${s.description}`);
        }
      } else {
        lines.push('');
        lines.push('No further optimization suggestions — this prompt is already tight.');
      }
      return ok(lines.join('\n'));
    } catch (err) {
      return fail(err, 'Failed to optimize prompt.');
    }
  },
};

// --- Tool: generate_prompt --------------------------------------------------

const ProviderEnum = z.enum(['claude', 'gpt', 'gemini', 'copilot', 'cursor', 'perplexity', 'generic']);
const AudienceEnum = z.enum(['beginner', 'general', 'expert', 'executive']);
const FormatEnum = z.enum([
  'free-text', 'bullet-list', 'numbered-list', 'table',
  'code', 'json', 'markdown', 'essay', 'summary', 'qa-pairs', 'step-by-step',
]);
const LengthEnum = z.enum(['brief', 'medium', 'long']);
const ToneEnum = z.enum(['neutral', 'formal', 'casual', 'technical', 'persuasive']);

const GenerateSchema = z.object({
  problem: z
    .string()
    .describe('What the user wants to solve, in plain English. Required.'),
  desiredOutcome: z
    .string()
    .optional()
    .describe('Optional: what kind of answer or artifact the user wants back. The more specific, the better the generated prompt.'),
  targetProvider: ProviderEnum.describe(
    'Which LLM the prompt will be sent to. Picks provider-specific phrasing (XML tags for Claude, role tags for GPT, etc.).',
  ),
  audience: AudienceEnum.optional().describe('Optional audience level for the output (default: general).'),
  outputFormat: FormatEnum.optional().describe('Optional desired output format (default: free-text).'),
  outputLength: LengthEnum.optional().describe('Optional desired output length (default: medium).'),
  mustInclude: z.array(z.string()).optional().describe('Optional: keywords / phrases the answer MUST include.'),
  mustAvoid: z.array(z.string()).optional().describe('Optional: keywords / phrases the answer MUST NOT include.'),
  tone: ToneEnum.optional().describe('Optional tone of the output (default: neutral).'),
  starterPrompt: z.string().optional().describe('Optional existing draft to refine instead of starting from scratch.'),
});

const generateTool: ToolDefinition = {
  name: 'generate_prompt',
  description:
    'Generate a high-quality prompt from scratch given a problem statement and target LLM provider. Returns multiple variants (terse / standard / detailed / system+user) ranked by token cost, plus the recommended model and provider-specific tips. Use this when the user asks for help WRITING a prompt — "give me a prompt to do X", "draft me a prompt for Claude that does Y", "design a prompt template for Z".',
  schema: GenerateSchema,
  handler: async (input, client) => {
    const parsed = GenerateSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error, 'Invalid arguments for generate_prompt.');
    try {
      const r = await client.generate(parsed.data);
      const lines: string[] = [];
      lines.push(`Generated prompts for ${parsed.data.targetProvider} (recommended model: ${r.recommendedModel})`);
      lines.push(`Detected: category=${r.detectedCategory}, complexity=${r.detectedComplexity}, dimensions=${r.detectedDimensions.length}`);
      lines.push('');
      lines.push(`Variants (${r.variants.length}):`);
      for (const v of r.variants) {
        lines.push('');
        lines.push(`### ${v.style} — ${tokens(v.tokenCount)} (~${tokens(v.estimatedOutputTokens)} expected out), est ${usd(v.estimatedCost)}`);
        if (v.rationale) lines.push(`Rationale: ${v.rationale}`);
        if (v.systemPrompt) {
          lines.push('System:');
          lines.push(v.systemPrompt);
          lines.push('User:');
        }
        lines.push(v.prompt);
      }
      if (r.splitPrompts && r.splitPrompts.length > 0) {
        lines.push('');
        lines.push(`Suggested split (${r.splitPrompts.length} sub-prompts, multidimensional ask):`);
        r.splitPrompts.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
      }
      if (r.warnings.length > 0) {
        lines.push('');
        lines.push('Warnings:');
        r.warnings.forEach((w) => lines.push(`- ${w}`));
      }
      if (r.tips.length > 0) {
        lines.push('');
        lines.push('Tips:');
        r.tips.forEach((t) => lines.push(`- ${t}`));
      }
      return ok(lines.join('\n'));
    } catch (err) {
      return fail(err, 'Failed to generate prompt.');
    }
  },
};

// --- Tool: compare_prompts --------------------------------------------------

const CompareSchema = z.object({
  promptA: z.string().describe('The first prompt (baseline / before).'),
  promptB: z.string().describe('The second prompt (candidate / after).'),
  model: z
    .string()
    .optional()
    .describe('Model name to use for pricing both sides. Defaults to a generic estimate.'),
});

const compareTool: ToolDefinition = {
  name: 'compare_prompts',
  description:
    'Compare two prompts side by side. Returns token counts, estimated cost per call, category/complexity classification for each, the dollar and token delta between them, a verdict (which side is cheaper / better), and human-readable analysis notes. Use this whenever the user wants to evaluate two prompt variants, A/B test prompts, or check whether a rewrite is actually cheaper.',
  schema: CompareSchema,
  handler: async (input, client) => {
    const parsed = CompareSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error, 'Invalid arguments for compare_prompts.');
    try {
      const r = await client.compare({
        a: { prompt: parsed.data.promptA, label: 'A' },
        b: { prompt: parsed.data.promptB, label: 'B' },
        model: parsed.data.model,
      });
      const lines: string[] = [];
      const winner =
        r.verdict === 'a-better' ? 'Prompt A wins' :
        r.verdict === 'b-better' ? 'Prompt B wins' :
        'Tie';
      lines.push(`Comparison verdict: ${winner}`);
      lines.push('');
      lines.push(`Prompt A: ${tokens(r.a.tokens)} (~${tokens(r.a.estimatedOutputTokens)} out), ${usd(r.a.estimatedCost)} — ${r.a.category}/${r.a.complexity}`);
      lines.push(`Prompt B: ${tokens(r.b.tokens)} (~${tokens(r.b.estimatedOutputTokens)} out), ${usd(r.b.estimatedCost)} — ${r.b.category}/${r.b.complexity}`);
      lines.push('');
      lines.push(`Delta (A → B): ${r.savings.tokens >= 0 ? 'save' : 'add'} ${tokens(Math.abs(r.savings.tokens))} (${pct(r.savings.tokensPercent)}) / ${usd(r.savings.cost)} (${pct(r.savings.costPercent)})`);
      if (r.analysisNotes.length > 0) {
        lines.push('');
        lines.push('Notes:');
        r.analysisNotes.forEach((n) => lines.push(`- ${n}`));
      }
      return ok(lines.join('\n'));
    } catch (err) {
      return fail(err, 'Failed to compare prompts.');
    }
  },
};

// --- Tool: analyze_prompt ---------------------------------------------------

const AnalyzeSchema = z.object({
  prompt: z.string().describe('The prompt text to analyze.'),
  model: z.string().optional().describe('Optional model name for accurate token counting.'),
});

const analyzeTool: ToolDefinition = {
  name: 'analyze_prompt',
  description:
    'Classify a prompt and score its complexity without rewriting it. Returns category (factual / reasoning / creative / code / analytical / conversational / instructional / other), complexity (simple / moderate / complex / multidimensional), a 0–100 complexity score, the distinct facets/dimensions detected, and characteristics like word count, redundancy, multiple questions, and code presence. Use this when the user wants to UNDERSTAND a prompt without changing it — "classify this prompt", "how complex is this prompt", "what kind of prompt is this".',
  schema: AnalyzeSchema,
  handler: async (input, client) => {
    const parsed = AnalyzeSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error, 'Invalid arguments for analyze_prompt.');
    try {
      const a = await client.analyze(parsed.data);
      const lines: string[] = [];
      lines.push(`Category: ${a.category}`);
      lines.push(`Complexity: ${a.complexity} (${a.complexityScore}/100)`);
      lines.push(`Tokens in: ${a.inputTokens}, estimated tokens out: ${a.estimatedOutputTokens}`);
      lines.push(`Dimensions detected: ${a.dimensions.length}${a.dimensions.length ? ` (${a.dimensions.slice(0, 5).join('; ')}${a.dimensions.length > 5 ? '; …' : ''})` : ''}`);
      const ch = a.characteristics as Record<string, unknown>;
      const flags: string[] = [];
      if (ch.hasCode) flags.push('code');
      if (ch.hasMultipleQuestions) flags.push('multiple-questions');
      if (ch.hasContextDump) flags.push('context-dump');
      if (ch.hasRedundancy) flags.push('redundancy');
      if (ch.hasExamples) flags.push('has-examples');
      lines.push(`Word count: ${ch.wordCount ?? '?'}, sentences: ${ch.sentenceCount ?? '?'}, questions: ${ch.questionCount ?? '?'}, imperative verbs: ${ch.imperativeVerbs ?? '?'}`);
      if (flags.length > 0) lines.push(`Flags: ${flags.join(', ')}`);
      return ok(lines.join('\n'));
    } catch (err) {
      return fail(err, 'Failed to analyze prompt.');
    }
  },
};

// --- Tool: get_stats --------------------------------------------------------

const PeriodEnum = z.enum(['24h', '7d', '30d', 'all']);

const StatsSchema = z.object({
  period: PeriodEnum.optional().describe('Time window: "24h", "7d", "30d", or "all". Defaults to "7d".'),
});

const statsTool: ToolDefinition = {
  name: 'get_stats',
  description:
    'Get total AI spend, token usage, call volume, average latency, and per-model / per-category / per-complexity breakdowns across all logged prompts. Supports period filters (24h, 7d, 30d, all). Use this when the user asks how much they spent, what the AI bill is, what their token usage is, or anything about TOTALS and BREAKDOWNS of spend.',
  schema: StatsSchema,
  handler: async (input, client) => {
    const parsed = StatsSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error, 'Invalid arguments for get_stats.');
    const period: Period = parsed.data.period ?? '7d';
    try {
      const s = await client.stats(period);
      const lines: string[] = [];
      lines.push(`AI FinOps stats — last ${period}`);
      lines.push('');
      lines.push(`Calls: ${s.totals.calls.toLocaleString()}`);
      lines.push(`Total tokens: ${s.totals.totalTokens.toLocaleString()} (in ${s.totals.inputTokens.toLocaleString()} / out ${s.totals.outputTokens.toLocaleString()})`);
      lines.push(`Total cost: ${usd(s.totals.cost, 2)}`);
      lines.push(`Avg latency: ${s.totals.avgLatencyMs ? `${Math.round(s.totals.avgLatencyMs)}ms` : 'n/a'}`);
      lines.push(`Potential savings: ${usd(s.potentialSavings.cost, 2)} (${pct(s.potentialSavings.percent)}) — ${tokens(s.potentialSavings.tokens)}`);
      const topModels = [...s.byModel].sort((a, b) => b.cost - a.cost).slice(0, 5);
      if (topModels.length > 0) {
        lines.push('');
        lines.push('Top models by cost:');
        for (const m of topModels) {
          lines.push(`- ${m.model}: ${usd(m.cost, 2)} across ${m.calls.toLocaleString()} calls (${tokens(m.tokens)})`);
        }
      }
      if (s.byCategory.length > 0) {
        lines.push('');
        lines.push('By category:');
        for (const c of [...s.byCategory].sort((a, b) => b.cost - a.cost)) {
          lines.push(`- ${c.category}: ${c.calls.toLocaleString()} calls, ${usd(c.cost, 2)}`);
        }
      }
      if (s.byComplexity.length > 0) {
        lines.push('');
        lines.push('By complexity:');
        for (const c of [...s.byComplexity].sort((a, b) => b.cost - a.cost)) {
          lines.push(`- ${c.complexity}: ${c.calls.toLocaleString()} calls, ${usd(c.cost, 2)}`);
        }
      }
      return ok(lines.join('\n'));
    } catch (err) {
      return fail(err, 'Failed to fetch stats.');
    }
  },
};

// --- Tool: get_insights -----------------------------------------------------

const InsightsSchema = z.object({
  period: PeriodEnum.optional().describe('Time window for the analysis. Defaults to "30d".'),
});

const insightsTool: ToolDefinition = {
  name: 'get_insights',
  description:
    'Return ranked, dollar-impact cost-reduction recommendations with root-cause analysis. Identifies cost concentration, model mismatch (e.g. using Sonnet for simple prompts), redundancy clusters (caching candidates), output bloat, app hotspots, and the top spenders. Returns projected monthly and annual savings if all recommendations are applied. Use this when the user asks WHY their AI bill is high, HOW to save money, what to optimize first, or for an executive cost-reduction summary.',
  schema: InsightsSchema,
  handler: async (input, client) => {
    const parsed = InsightsSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error, 'Invalid arguments for get_insights.');
    const period: Period = parsed.data.period ?? '30d';
    try {
      const i = await client.insights(period);
      const lines: string[] = [];
      lines.push(`AI FinOps insights — last ${i.period} (generated ${i.generatedAt})`);
      lines.push('');
      lines.push(`Totals: ${i.totals.calls.toLocaleString()} calls, ${usd(i.totals.cost, 2)} (avg ${usd(i.totals.avgCostPerCall)}/call)`);
      lines.push(`Projected savings if recommendations applied: ${usd(i.projectedSavings.monthly, 2)}/mo, ${usd(i.projectedSavings.annual, 2)}/yr (${pct(i.projectedSavings.percentReduction)} of current spend)`);
      lines.push(`Cost concentration: top 5% of calls = ${pct(i.concentration.p5Percent)} of cost; top 20% = ${pct(i.concentration.p20Percent)}`);
      if (i.rootCauses.length > 0) {
        lines.push('');
        lines.push('Root causes:');
        for (const rc of i.rootCauses) {
          lines.push(`- [${rc.severity}] ${rc.title} — ~${usd(rc.estimatedAnnualWaste, 0)}/yr wasted`);
          if (rc.description) lines.push(`    ${rc.description}`);
        }
      }
      if (i.recommendations.length > 0) {
        lines.push('');
        lines.push(`Top recommendations (${i.recommendations.length}):`);
        const topRecs = [...i.recommendations]
          .sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings)
          .slice(0, 10);
        for (const r of topRecs) {
          lines.push(`- [${r.confidence}] ${r.title} — ${usd(r.estimatedMonthlySavings, 0)}/mo (${usd(r.estimatedAnnualSavings, 0)}/yr) across ${r.affectedCalls.toLocaleString()} calls`);
          if (r.action) lines.push(`    Action: ${r.action}`);
        }
      }
      if (i.modelMismatch.length > 0) {
        lines.push('');
        lines.push('Model mismatch (most expensive offenders):');
        for (const m of i.modelMismatch.slice(0, 5)) {
          lines.push(`- ${m.model} on ${m.complexity}/${m.category}: ${m.calls.toLocaleString()} calls, ${usd(m.totalCost, 2)} — switch to ${m.recommendedModel}, save ${usd(m.estimatedSavings, 2)}`);
        }
      }
      if (i.appHotspots.length > 0) {
        lines.push('');
        lines.push('App hotspots:');
        for (const a of i.appHotspots.slice(0, 5)) {
          lines.push(`- ${a.appName ?? '(unattributed)'}: ${a.calls.toLocaleString()} calls, ${usd(a.totalCost, 2)} (${pct(a.pctOfTotal)} of total) — top model ${a.topModel}`);
        }
      }
      return ok(lines.join('\n'));
    } catch (err) {
      return fail(err, 'Failed to fetch insights.');
    }
  },
};

// --- Tool: list_recommendations --------------------------------------------

const RecommendationsSchema = z.object({
  period: PeriodEnum.optional().describe('Time window. Defaults to "30d".'),
  limit: z
    .number()
    .optional()
    .describe('Max number of recommendations to return. Defaults to 5.'),
});

const recommendationsTool: ToolDefinition = {
  name: 'list_recommendations',
  description:
    'Return the top N cost-reduction recommendations, ranked by estimated monthly dollar savings. Each item includes the action to take, expected savings, affected call count, and confidence level. Use this when the user asks "what should I do first" or "give me the top 5 actions" or wants a prioritized to-do list rather than the full insights dump.',
  schema: RecommendationsSchema,
  handler: async (input, client) => {
    const parsed = RecommendationsSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error, 'Invalid arguments for list_recommendations.');
    const period: Period = parsed.data.period ?? '30d';
    const limit = parsed.data.limit ?? 5;
    try {
      const i = await client.insights(period);
      const recs = [...i.recommendations]
        .sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings)
        .slice(0, limit);
      if (recs.length === 0) {
        return ok(`No cost-reduction recommendations found for the last ${period}. Either you have very little usage or your prompts are already lean.`);
      }
      const lines: string[] = [];
      lines.push(`Top ${recs.length} cost-reduction recommendations — last ${period}`);
      lines.push('');
      recs.forEach((r, idx) => {
        lines.push(`${idx + 1}. ${r.title}`);
        lines.push(`   Savings: ${usd(r.estimatedMonthlySavings, 0)}/mo (${usd(r.estimatedAnnualSavings, 0)}/yr)`);
        lines.push(`   Affects: ${r.affectedCalls.toLocaleString()} calls — confidence: ${r.confidence}`);
        lines.push(`   Action: ${r.action}`);
        if (r.rationale) lines.push(`   Why: ${r.rationale}`);
        lines.push('');
      });
      const totalMonthly = recs.reduce((sum, r) => sum + r.estimatedMonthlySavings, 0);
      lines.push(`Total estimated savings if all ${recs.length} applied: ${usd(totalMonthly, 0)}/mo`);
      return ok(lines.join('\n'));
    } catch (err) {
      return fail(err, 'Failed to list recommendations.');
    }
  },
};

// --- Tool: list_anomalies ---------------------------------------------------

const AnomaliesSchema = z.object({
  severity: z
    .enum(['info', 'warn', 'critical'])
    .optional()
    .describe('Only return anomalies of this severity or above.'),
  unresolved: z
    .boolean()
    .optional()
    .describe('If true, only return anomalies that have not yet been marked resolved.'),
  limit: z.number().optional().describe('Max anomalies to return. Defaults to 20.'),
});

const anomaliesTool: ToolDefinition = {
  name: 'list_anomalies',
  description:
    'List recent anomaly events detected by the FinOps platform — cost spikes, new model usage appearing on the bill, unusually expensive prompts, budget breaches, latency spikes. Supports filtering by severity (info/warn/critical) and by unresolved-only. Use this when the user asks about unusual activity, weird charges, "anything strange on our bill", or wants to triage alerts.',
  schema: AnomaliesSchema,
  handler: async (input, client) => {
    const parsed = AnomaliesSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error, 'Invalid arguments for list_anomalies.');
    try {
      const r = await client.anomalies({
        ...(parsed.data.severity !== undefined ? { severity: parsed.data.severity } : {}),
        ...(parsed.data.unresolved !== undefined ? { unresolved: parsed.data.unresolved } : {}),
        limit: parsed.data.limit ?? 20,
      });
      if (r.items.length === 0) {
        return ok('No anomalies match the filter. The platform is quiet.');
      }
      const lines: string[] = [];
      lines.push(`${r.items.length} anomaly event${r.items.length === 1 ? '' : 's'} (showing newest first):`);
      lines.push('');
      for (const a of r.items) {
        const resolved = a.resolvedAt ? 'resolved' : 'unresolved';
        lines.push(`- [${a.severity}/${a.kind}] ${a.title} (${resolved}) @ ${a.detectedAt}`);
        if (a.description) lines.push(`    ${truncate(a.description, 240)}`);
      }
      return ok(lines.join('\n'));
    } catch (err) {
      return fail(err, 'Failed to fetch anomalies.');
    }
  },
};

// --- Registry --------------------------------------------------------------

export const ALL_TOOLS: ToolDefinition[] = [
  optimizeTool,
  generateTool,
  compareTool,
  analyzeTool,
  statsTool,
  insightsTool,
  recommendationsTool,
  anomaliesTool,
];

/**
 * Return the array shape MCP's `tools/list` response expects — each entry has
 * `name`, `description`, and a JSON Schema `inputSchema`.
 */
export function listTools(): { name: string; description: string; inputSchema: JsonSchema }[] {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema),
  }));
}

export function findTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export { zodToJsonSchema };
