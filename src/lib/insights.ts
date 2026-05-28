import { prisma } from '@/lib/db';
import { calculateCost, cheapestEquivalent } from '@/lib/pricing';
import type {
  AppHotspot,
  Category,
  Complexity,
  InsightsResponse,
  ModelMismatchRow,
  OutputBloatRow,
  Recommendation,
  RedundancyCluster,
  RootCause,
  TopSpender,
} from '@/lib/types';

type Period = '24h' | '7d' | '30d' | 'all';

interface RawRow {
  id: string;
  timestamp: Date;
  appName: string | null;
  model: string;
  promptText: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  totalCost: number;
  category: string;
  complexity: string;
  // Audit H12: count of real LLM calls this row represents. 1 for SDK rows,
  // request_count for import-aggregate rows.
  callCount: number;
}

// Audit H5/H10: import-aggregate rows are NOT real per-call data — they are
// daily rollups synthesized from provider admin APIs. The promptText always
// starts with a "[<Provider> usage rollup:" marker. Per-prompt recommendations
// (model-mismatch, output-bloat, redundancy clusters) must filter these out;
// otherwise we recommend "downgrade this simple call" to a row that is
// actually thousands of calls of unknown complexity.
function isImportAggregate(row: { promptText?: string }): boolean {
  return typeof row.promptText === 'string' && row.promptText.startsWith('[');
}

function periodToSince(period: Period): Date | null {
  const now = Date.now();
  switch (period) {
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case 'all':
      return null;
  }
}

// Scaling factor to project period totals onto a monthly basis.
// Audit H6: never extrapolate from less than ~7 days of data — sub-day bursts
// were yielding "annual" projections off by 100x.
function monthlyMultiplier(period: Period, rows: RawRow[]): { factor: number; reliable: boolean } {
  if (period === '24h') return { factor: 30, reliable: false };
  if (period === '7d') return { factor: 30 / 7, reliable: true };
  if (period === '30d') return { factor: 1, reliable: true };
  if (rows.length === 0) return { factor: 1, reliable: false };
  // 'all': estimate based on the actual span of the dataset.
  let earliest = rows[0]!.timestamp.getTime();
  let latest = earliest;
  for (const r of rows) {
    const t = r.timestamp.getTime();
    if (t < earliest) earliest = t;
    if (t > latest) latest = t;
  }
  const spanDays = (latest - earliest) / (24 * 60 * 60 * 1000);
  if (spanDays < 7) return { factor: 30 / Math.max(1, spanDays), reliable: false };
  return { factor: 30 / spanDays, reliable: true };
}

function normalizeFingerprint(text: string): string {
  return text
    .slice(0, 60)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function modeOf<T extends string>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T = values[0]!;
  let bestCount = -1;
  for (const [v, c] of counts.entries()) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

// Quasi-gini: 1 - 2 * (sum of cumulative normalized costs / n - 0.5).
// Stable, monotonic in concentration; doesn't need to be textbook-perfect.
function giniLike(sortedDescCosts: number[], total: number): number {
  const n = sortedDescCosts.length;
  if (n === 0 || total <= 0) return 0;
  const ascending = [...sortedDescCosts].reverse();
  let cumNormSum = 0;
  let running = 0;
  for (const c of ascending) {
    running += c / total;
    cumNormSum += running;
  }
  const gini = 1 - (2 * cumNormSum) / n + 1 / n;
  return Math.max(0, Math.min(1, gini));
}

function topByCost(rows: RawRow[], n: number): RawRow[] {
  return [...rows].sort((a, b) => b.totalCost - a.totalCost).slice(0, n);
}

function toTopSpender(r: RawRow): TopSpender {
  return {
    id: r.id,
    timestamp: r.timestamp.toISOString(),
    appName: r.appName,
    model: r.model,
    category: r.category as Category,
    complexity: r.complexity as Complexity,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    totalCost: r.totalCost,
    promptPreview: r.promptText.slice(0, 140),
  };
}

function buildModelMismatch(rows: RawRow[]): ModelMismatchRow[] {
  const buckets = new Map<
    string,
    {
      model: string;
      complexity: Complexity;
      category: Category;
      recommendedModel: string;
      calls: number;
      totalCost: number;
      estimatedSavings: number;
    }
  >();

  for (const r of rows) {
    if (r.complexity !== 'simple' && r.complexity !== 'moderate') continue;
    const cheaper = cheapestEquivalent(r.model);
    if (!cheaper) continue;

    const key = `${r.model}::${r.complexity}::${r.category}`;
    const migrated = calculateCost(r.inputTokens, r.outputTokens, cheaper.model);
    const savings = r.totalCost - migrated.totalCost;
    if (savings <= 0) continue;

    const slot =
      buckets.get(key) ?? {
        model: r.model,
        complexity: r.complexity as Complexity,
        category: r.category as Category,
        recommendedModel: cheaper.model,
        calls: 0,
        totalCost: 0,
        estimatedSavings: 0,
      };
    slot.calls += 1;
    slot.totalCost += r.totalCost;
    slot.estimatedSavings += savings;
    buckets.set(key, slot);
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.estimatedSavings - a.estimatedSavings)
    .slice(0, 10);
}

function buildOutputBloat(rows: RawRow[]): OutputBloatRow[] {
  const candidates: OutputBloatRow[] = [];
  for (const r of rows) {
    if (r.complexity !== 'simple' && r.complexity !== 'moderate') continue;
    if (r.outputTokens <= 300) continue;
    if (r.inputTokens <= 0 || r.outputTokens <= 3 * r.inputTokens) continue;

    const ratio = r.outputTokens / r.inputTokens;
    const cap = Math.max(1, Math.min(r.outputTokens, 2 * r.inputTokens));
    const capped = calculateCost(r.inputTokens, cap, r.model);
    const estimatedCapSavings = r.totalCost - capped.totalCost;
    if (estimatedCapSavings <= 0) continue;

    candidates.push({
      id: r.id,
      model: r.model,
      category: r.category as Category,
      complexity: r.complexity as Complexity,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      ratio,
      totalCost: r.totalCost,
      estimatedCapSavings,
      promptPreview: r.promptText.slice(0, 140),
    });
  }

  return candidates
    .sort((a, b) => b.estimatedCapSavings - a.estimatedCapSavings)
    .slice(0, 10);
}

function buildRedundancyClusters(rows: RawRow[]): RedundancyCluster[] {
  const groups = new Map<string, RawRow[]>();
  for (const r of rows) {
    const fp = normalizeFingerprint(r.promptText);
    if (!fp) continue;
    const list = groups.get(fp) ?? [];
    list.push(r);
    groups.set(fp, list);
  }

  const clusters: RedundancyCluster[] = [];
  for (const [fp, list] of groups.entries()) {
    if (list.length < 3) continue;
    const totalCost = list.reduce((s, r) => s + r.totalCost, 0);
    const totalInputTokens = list.reduce((s, r) => s + r.inputTokens, 0);
    const totalInputCost = list.reduce((s, r) => s + r.inputCost, 0);
    const sample = list.reduce(
      (longest, r) => (r.promptText.length > longest.promptText.length ? r : longest),
      list[0]!,
    );
    // Caching savings: input-side cost on all repeats beyond the first, discounted 80%.
    const firstInputCost = sample.inputCost;
    const estimatedCachingSavings = Math.max(0, (totalInputCost - firstInputCost) * 0.8);

    clusters.push({
      fingerprint: fp,
      samplePrompt: sample.promptText,
      calls: list.length,
      totalCost,
      avgInputTokens: totalInputTokens / list.length,
      estimatedCachingSavings,
    });
  }

  return clusters
    .sort((a, b) => b.estimatedCachingSavings - a.estimatedCachingSavings)
    .slice(0, 10);
}

function buildAppHotspots(rows: RawRow[], totalCost: number): AppHotspot[] {
  const groups = new Map<string, RawRow[]>();
  for (const r of rows) {
    const key = r.appName ?? 'unknown';
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const hotspots: AppHotspot[] = [];
  for (const [name, list] of groups.entries()) {
    const cost = list.reduce((s, r) => s + r.totalCost, 0);
    hotspots.push({
      appName: name === 'unknown' ? null : name,
      calls: list.length,
      totalCost: cost,
      pctOfTotal: totalCost > 0 ? (cost / totalCost) * 100 : 0,
      topModel: modeOf(list.map((r) => r.model)),
      topCategory: modeOf(list.map((r) => r.category)) as Category,
    });
  }

  return hotspots.sort((a, b) => b.totalCost - a.totalCost).slice(0, 10);
}

function formatUSDInline(n: number): string {
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function deriveRootCauses(args: {
  rows: RawRow[];
  totalCost: number;
  concentration: InsightsResponse['concentration'];
  modelMismatch: ModelMismatchRow[];
  outputBloat: OutputBloatRow[];
  clusters: RedundancyCluster[];
  hotspots: AppHotspot[];
  multiplier: number;
}): RootCause[] {
  const causes: RootCause[] = [];
  const { rows, totalCost, concentration, modelMismatch, outputBloat, clusters, hotspots, multiplier } = args;
  const annualize = multiplier * 12;

  if (concentration.p20Percent >= 70) {
    const pct = Math.round(concentration.p20Percent);
    causes.push({
      kind: 'concentration',
      title: `20% of calls drive ${pct}% of cost`,
      description: `A small slice of expensive calls dominates spend. Targeted optimization of these few will move the needle far more than blanket changes.`,
      estimatedAnnualWaste: 0,
      severity: concentration.p20Percent >= 80 ? 'high' : 'medium',
    });
  }

  const mismatchMonthly = modelMismatch.reduce((s, r) => s + r.estimatedSavings, 0) * multiplier;
  if (mismatchMonthly > 0) {
    causes.push({
      kind: 'model-mismatch',
      title: `${formatUSDInline(mismatchMonthly)}/mo spent on premium models for simple work`,
      description: `Simple and moderate prompts are being routed to large models when a smaller same-family model would handle them with minimal quality impact.`,
      estimatedAnnualWaste: mismatchMonthly * 12,
      severity: mismatchMonthly > 100 ? 'high' : 'medium',
    });
  }

  if (outputBloat.length > 0) {
    const bloatSavings = outputBloat.reduce((s, r) => s + r.estimatedCapSavings, 0) * multiplier;
    causes.push({
      kind: 'output-bloat',
      title: `Verbose answers on ${outputBloat.length} short prompts`,
      description: `Short questions are producing disproportionately long answers. Adding output caps would cut output-token cost without losing useful content.`,
      estimatedAnnualWaste: bloatSavings * 12,
      severity: bloatSavings > 50 ? 'medium' : 'low',
    });
  }

  if (clusters.length > 0) {
    const cacheSavings = clusters.reduce((s, c) => s + c.estimatedCachingSavings, 0) * multiplier;
    const repeats = clusters.reduce((s, c) => s + c.calls, 0);
    causes.push({
      kind: 'redundancy',
      title: `${repeats} repeated prompts not using prompt caching`,
      description: `The same (or near-identical) prompt is being sent multiple times. Caching the stable prefix would reuse the input-side cost for ~90% off on each repeat.`,
      estimatedAnnualWaste: cacheSavings * 12,
      severity: cacheSavings > 50 ? 'high' : 'medium',
    });
  }

  if (hotspots.length > 0 && hotspots[0]!.pctOfTotal > 50) {
    const top = hotspots[0]!;
    const name = top.appName ?? 'unknown';
    causes.push({
      kind: 'app-hotspot',
      title: `${name} is ${Math.round(top.pctOfTotal)}% of spend`,
      description: `One application dominates AI usage. Assigning a FinOps owner there typically uncovers 10-30% optimization potential through prompt-level review.`,
      estimatedAnnualWaste: 0,
      severity: top.pctOfTotal > 75 ? 'high' : 'medium',
    });
  }

  const totalCalls = rows.length;
  if (totalCalls > 0) {
    const multi = rows.filter((r) => r.complexity === 'multidimensional');
    const multiPct = (multi.length / totalCalls) * 100;
    if (multiPct > 10 && multi.length > 0) {
      const avgMulti = multi.reduce((s, r) => s + r.totalCost, 0) / multi.length;
      const avgAll = totalCost / totalCalls;
      if (avgAll > 0 && avgMulti >= 5 * avgAll) {
        const multiCostPct = (multi.reduce((s, r) => s + r.totalCost, 0) / totalCost) * 100;
        causes.push({
          kind: 'multidim-mega-prompts',
          title: `Mega-prompts: ${Math.round(multiPct)}% of calls but ${Math.round(multiCostPct)}% of cost`,
          description: `A few multi-part prompts are running far longer than typical calls. Splitting them into focused, cacheable sub-prompts will both cut cost and improve quality.`,
          estimatedAnnualWaste: 0,
          severity: 'medium',
        });
      }
    }
  }

  if (totalCost > 0) {
    const byCategory = new Map<Category, number>();
    for (const r of rows) {
      const cat = r.category as Category;
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + r.totalCost);
    }
    let topCat: Category = 'other';
    let topCatCost = 0;
    for (const [cat, cost] of byCategory.entries()) {
      if (cost > topCatCost) {
        topCat = cat;
        topCatCost = cost;
      }
    }
    const catPct = (topCatCost / totalCost) * 100;
    if (catPct > 60 && (topCat === 'creative' || topCat === 'analytical')) {
      causes.push({
        kind: 'category-skew',
        title: `${Math.round(catPct)}% of spend is on ${topCat} prompts`,
        description: `${topCat[0]!.toUpperCase()}${topCat.slice(1)} prompts are expensive by nature. A targeted style guide and output caps for this category would compound across every call.`,
        estimatedAnnualWaste: 0,
        severity: 'medium',
      });
    }
  }

  return causes.slice(0, 6);
}

function deriveRecommendations(args: {
  rows: RawRow[];
  totalCost: number;
  totalCalls: number;
  concentration: InsightsResponse['concentration'];
  modelMismatch: ModelMismatchRow[];
  outputBloat: OutputBloatRow[];
  clusters: RedundancyCluster[];
  hotspots: AppHotspot[];
  multiplier: number;
}): Recommendation[] {
  const recs: Recommendation[] = [];
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return `r-${counter}`;
  };
  const { rows, totalCost, totalCalls, concentration, modelMismatch, outputBloat, clusters, hotspots, multiplier } = args;

  // Adaptive threshold: 0.5% of monthly burn, with a $0.001 floor so the
  // demo dataset (sub-dollar totals) still surfaces signal. On real enterprise
  // datasets this naturally rises to a meaningful dollar figure.
  const monthlyTotal = totalCost * multiplier;
  const MIN = Math.max(0.001, monthlyTotal * 0.005);

  for (const m of modelMismatch) {
    const monthly = m.estimatedSavings * multiplier;
    if (monthly <= MIN) continue;
    const monthlyCalls = Math.round(m.calls * multiplier);
    recs.push({
      id: nextId(),
      title: `Route ${m.complexity} ${m.category} calls from ${m.model} → ${m.recommendedModel}`,
      rationale: `These ${m.calls} call(s) used ${m.model} for work classified as ${m.complexity}. ${m.recommendedModel} handles this profile at a fraction of the cost.`,
      action: `Update your routing to send these ${monthlyCalls} call/month to ${m.recommendedModel}. Quality impact: minimal.`,
      estimatedMonthlySavings: monthly,
      estimatedAnnualSavings: monthly * 12,
      affectedCalls: m.calls,
      confidence: 'high',
      category: 'model-routing',
    });
  }

  for (const c of clusters) {
    const monthly = c.estimatedCachingSavings * multiplier;
    if (monthly <= MIN) continue;
    const preview = c.samplePrompt.slice(0, 40).replace(/\s+/g, ' ').trim();
    recs.push({
      id: nextId(),
      title: `Enable prompt caching for "${preview}..."`,
      rationale: `This prompt or close variants ran ${c.calls} times in the selected period at a total of ${formatUSDInline(c.totalCost)}. The stable prefix is being re-paid for on every call.`,
      action: `This prompt or close variants ran ${c.calls} times. Hoist the stable prefix into a cached system prompt.`,
      estimatedMonthlySavings: monthly,
      estimatedAnnualSavings: monthly * 12,
      affectedCalls: c.calls,
      confidence: 'high',
      category: 'caching',
    });
  }

  if (outputBloat.length > 0) {
    const groups = new Map<
      Category,
      { calls: number; savings: number; avgInput: number; inputSamples: number[] }
    >();
    for (const b of outputBloat) {
      const slot = groups.get(b.category) ?? { calls: 0, savings: 0, avgInput: 0, inputSamples: [] };
      slot.calls += 1;
      slot.savings += b.estimatedCapSavings;
      slot.inputSamples.push(b.inputTokens);
      groups.set(b.category, slot);
    }
    for (const [cat, slot] of groups.entries()) {
      const monthly = slot.savings * multiplier;
      if (monthly <= MIN) continue;
      const monthlyCalls = Math.round(slot.calls * multiplier);
      const avgIn = slot.inputSamples.reduce((s, n) => s + n, 0) / slot.inputSamples.length;
      // Word budget = ~2x input tokens, with tokens-to-words ~0.75.
      const wordBudget = Math.max(50, Math.round(avgIn * 2 * 0.75));
      recs.push({
        id: nextId(),
        title: `Add an output cap to ${cat} prompts`,
        rationale: `${slot.calls} ${cat} prompt(s) produced outputs more than 3x the input length. Capping length removes filler without losing substance.`,
        action: `Append "Respond in at most ${wordBudget} words" to ${monthlyCalls} call/month.`,
        estimatedMonthlySavings: monthly,
        estimatedAnnualSavings: monthly * 12,
        affectedCalls: slot.calls,
        confidence: 'medium',
        category: 'output-cap',
      });
    }
  }

  if (concentration.p20Percent >= 80 && totalCalls > 0) {
    const p20Count = Math.max(1, Math.ceil(totalCalls * 0.2));
    recs.push({
      id: nextId(),
      title: `Concentrate on the top 20% of calls`,
      rationale: `Cost concentration is extreme — the top ${p20Count} call(s) drive ${Math.round(concentration.p20Percent)}% of spend. A blanket optimization is wasted effort compared with hand-tuning these specific prompts.`,
      action: `The top ${p20Count} calls drive ${Math.round(concentration.p20Percent)}% of cost. Manually optimize these specific prompts.`,
      estimatedMonthlySavings: 0,
      estimatedAnnualSavings: 0,
      affectedCalls: p20Count,
      confidence: 'high',
      category: 'governance',
    });
  }

  for (const h of hotspots) {
    if (h.pctOfTotal <= 40) continue;
    const name = h.appName ?? 'unknown';
    const monthly = h.totalCost * multiplier * 0.1; // 10% audit heuristic
    recs.push({
      id: nextId(),
      title: `Review ${name} usage`,
      rationale: `${name} accounts for ${Math.round(h.pctOfTotal)}% of total AI spend (${formatUSDInline(h.totalCost)} in period). Most apps yield ~10% savings after a focused audit.`,
      action: `Owner: assign this app to a FinOps champion for a focused audit.`,
      estimatedMonthlySavings: monthly,
      estimatedAnnualSavings: monthly * 12,
      affectedCalls: h.calls,
      confidence: 'medium',
      category: 'governance',
    });
  }

  if (totalCalls > 0) {
    const multi = rows.filter((r) => r.complexity === 'multidimensional');
    const multiPct = (multi.length / totalCalls) * 100;
    if (multi.length > 0 && multiPct > 10) {
      const avgMulti = multi.reduce((s, r) => s + r.totalCost, 0) / multi.length;
      const avgAll = totalCost / totalCalls;
      if (avgAll > 0 && avgMulti >= 5 * avgAll) {
        recs.push({
          id: nextId(),
          title: `Split mega-prompts into focused calls`,
          rationale: `Multidimensional prompts average ${formatUSDInline(avgMulti)} per call — about ${Math.round(avgMulti / avgAll)}x your overall average. Splitting them improves quality and lets each sub-call cache and downgrade independently.`,
          action: `Detected ${multi.length} multidimensional prompts averaging ${formatUSDInline(avgMulti)}. Use the Studio to generate split prompts.`,
          estimatedMonthlySavings: 0,
          estimatedAnnualSavings: 0,
          affectedCalls: multi.length,
          confidence: 'medium',
          category: 'prompt-rewrite',
        });
      }
    }
  }

  return recs.sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
}

export async function computeInsights(period: Period = '30d'): Promise<InsightsResponse> {
  const since = periodToSince(period);
  const where = since ? { timestamp: { gte: since } } : {};

  const rows: RawRow[] = await prisma.promptLog.findMany({
    where,
    select: {
      id: true,
      timestamp: true,
      appName: true,
      model: true,
      promptText: true,
      inputTokens: true,
      outputTokens: true,
      inputCost: true,
      totalCost: true,
      category: true,
      complexity: true,
      callCount: true,
    },
    orderBy: { timestamp: 'desc' },
  });

  // Audit H12: totalCalls sums callCount, not row count. An imported daily
  // aggregate from Anthropic carrying request_count=10000 is 10000 calls,
  // not 1.
  const totalCalls = rows.reduce((s, r) => s + (r.callCount || 1), 0);
  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const avgCostPerCall = totalCalls > 0 ? totalCost / totalCalls : 0;

  // Audit H7: concentration metrics are noise for tiny datasets. With one
  // call, p20 = 100% trivially. Require at least 20 calls before computing
  // anything meaningful — otherwise return zeros so the UI suppresses the
  // "20% of calls drive 100% of cost" alert.
  const CONCENTRATION_MIN_CALLS = 20;
  const concentrationApplicable = totalCalls >= CONCENTRATION_MIN_CALLS;
  const sortedCosts = rows
    .map((r) => r.totalCost)
    .sort((a, b) => b - a);
  const topCount = (pct: number): number => Math.max(0, Math.ceil(totalCalls * pct));
  const sumTop = (n: number): number => sortedCosts.slice(0, n).reduce((s, c) => s + c, 0);
  const p20Count = concentrationApplicable ? topCount(0.2) : 0;
  const p5Count = concentrationApplicable ? topCount(0.05) : 0;
  const p20Cost = sumTop(p20Count);
  const p5Cost = sumTop(p5Count);
  const concentration: InsightsResponse['concentration'] = {
    p20Cost,
    p20Percent: concentrationApplicable && totalCost > 0 ? (p20Cost / totalCost) * 100 : 0,
    p5Cost,
    p5Percent: concentrationApplicable && totalCost > 0 ? (p5Cost / totalCost) * 100 : 0,
    giniLike: giniLike(sortedCosts, totalCost),
  };

  const topSpenders = topByCost(rows, 10).map(toTopSpender);
  // Per-call recommendations require actual per-call data; exclude aggregates.
  const perCallRows = rows.filter((r) => !isImportAggregate(r));
  const modelMismatch = buildModelMismatch(perCallRows);
  const outputBloat = buildOutputBloat(perCallRows);
  const redundancyClusters = buildRedundancyClusters(perCallRows);
  const appHotspots = buildAppHotspots(rows, totalCost);

  const { factor: multiplier, reliable: projectionReliable } = monthlyMultiplier(period, rows);

  const rootCauses = deriveRootCauses({
    rows,
    totalCost,
    concentration,
    modelMismatch,
    outputBloat,
    clusters: redundancyClusters,
    hotspots: appHotspots,
    multiplier,
  });

  const recommendations = deriveRecommendations({
    rows,
    totalCost,
    totalCalls,
    concentration,
    modelMismatch,
    outputBloat,
    clusters: redundancyClusters,
    hotspots: appHotspots,
    multiplier,
  });

  // Audit H11: cap monthly savings at the actual monthly burn and percent
  // reduction at 80% — no realistic optimisation eliminates spend entirely,
  // and showing 142% reduction destroys CFO trust in two seconds.
  const rawMonthly = recommendations.reduce((s, r) => s + r.estimatedMonthlySavings, 0);
  const currentMonthlyBurn = totalCost * multiplier;
  const cappedMonthly = projectionReliable
    ? Math.min(rawMonthly, currentMonthlyBurn * 0.8)
    : 0;
  const percentReduction = projectionReliable && currentMonthlyBurn > 0
    ? Math.min(80, (cappedMonthly / currentMonthlyBurn) * 100)
    : 0;
  const monthly = cappedMonthly;

  return {
    period,
    generatedAt: new Date().toISOString(),
    totals: {
      calls: totalCalls,
      cost: totalCost,
      avgCostPerCall,
    },
    projectedSavings: {
      monthly,
      annual: monthly * 12,
      percentReduction,
    },
    concentration,
    rootCauses,
    recommendations,
    topSpenders,
    modelMismatch,
    redundancyClusters,
    outputBloat,
    appHotspots,
  };
}
