import { prisma } from '@/lib/db';

// Quality + latency analytics.
//
// Pulled from PromptLog rows. Three primary surfaces:
//
//   1. Latency percentiles per model (p50/p95/p99 + mean).
//   2. Output length distribution per model (5 buckets).
//   3. Error rate per model (outputTokens === 0 as the failure proxy —
//      providers that returned no content for any reason show up here).
//
// All metrics gate on `callCount` so import-aggregate rows
// (one DB row representing many real calls) still weight correctly when
// summing sample counts. Latency itself is per-row (not per-call) because
// import-aggregate rows store `latencyMs` as null and are skipped.

export type Percentile = 'p50' | 'p95' | 'p99';
export type Period = '24h' | '7d' | '30d' | 'all';

export interface ModelLatency {
  model: string;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  n: number; // sample count (callCount-summed for accuracy)
}

export interface OutputDistribution {
  model: string;
  bucket: string; // e.g. "0-100", "100-500", "500-1000", "1000-2500", "2500+"
  count: number;
  pctOfModel: number;
}

export interface ErrorRate {
  model: string;
  totalCalls: number;
  emptyResponses: number; // outputTokens === 0
  emptyRate: number;
}

export interface QualityResponse {
  period: Period;
  generatedAt: string;
  latencyByModel: ModelLatency[];
  outputDistribution: OutputDistribution[];
  errorRates: ErrorRate[];
  overallStats: {
    totalCalls: number;
    avgLatencyMs: number;
    avgOutputTokens: number;
    totalEmpty: number;
    emptyRatePercent: number;
  };
}

// Models must have at least this many calls (summed callCount) to appear.
// Below the threshold percentiles are noisy and "1 empty call" reads as
// "100% empty rate" — both useless.
const MIN_SAMPLES_PER_MODEL = 5;

// Output token buckets. Ordered, exhaustive — every non-negative integer
// falls into exactly one bucket.
export const OUTPUT_BUCKETS: readonly string[] = [
  '0-100',
  '100-500',
  '500-1000',
  '1000-2500',
  '2500+',
] as const;

function bucketize(outputTokens: number): string {
  if (outputTokens < 100) return '0-100';
  if (outputTokens < 500) return '100-500';
  if (outputTokens < 1000) return '500-1000';
  if (outputTokens < 2500) return '1000-2500';
  return '2500+';
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

// Percentile on a *pre-sorted* array. Uses the nearest-rank method:
// index = floor(n * p). This matches the spec in the task description
// (Math.floor(n * 0.5), Math.floor(n * 0.95), …) and is the conventional
// choice for observability dashboards.
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (p <= 0) return sortedAsc[0]!;
  if (p >= 1) return sortedAsc[sortedAsc.length - 1]!;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * p));
  return sortedAsc[idx]!;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

// Empty response (=> `emptyResponses` increment) is gated on outputTokens
// being exactly 0. Many providers truncate to "" rather than erroring on
// content filters / context overflow, so 0 output is the cleanest single
// signal we can extract from the existing schema without provider-specific
// status fields.
interface QualityRow {
  model: string;
  latencyMs: number | null;
  outputTokens: number;
  callCount: number;
}

export async function computeQuality(period: Period = '30d'): Promise<QualityResponse> {
  const since = periodToSince(period);
  const generatedAt = new Date().toISOString();

  const rows = (await prisma.promptLog.findMany({
    where: since ? { timestamp: { gte: since } } : {},
    select: {
      model: true,
      latencyMs: true,
      outputTokens: true,
      callCount: true,
    },
  })) as QualityRow[];

  // Early-out: empty period — return a well-formed response, no NaN.
  if (rows.length === 0) {
    return {
      period,
      generatedAt,
      latencyByModel: [],
      outputDistribution: [],
      errorRates: [],
      overallStats: {
        totalCalls: 0,
        avgLatencyMs: 0,
        avgOutputTokens: 0,
        totalEmpty: 0,
        emptyRatePercent: 0,
      },
    };
  }

  // ---------- Group by model ----------
  // Three buckets per model so we can compute everything in one pass:
  //   latencies[]    — only rows with a real latencyMs (>0)
  //   outputCounts   — distribution of outputTokens, weighted by callCount
  //   totals         — totalCalls + emptyCalls, weighted by callCount
  interface ModelBucket {
    latencies: number[];
    outputCounts: Map<string, number>;
    totalCalls: number;
    emptyCalls: number;
    outputTokenSumWeighted: number; // for avgOutputTokens — sum(outputTokens * callCount)
  }

  const byModel = new Map<string, ModelBucket>();
  function bucket(model: string): ModelBucket {
    let b = byModel.get(model);
    if (b == null) {
      b = {
        latencies: [],
        outputCounts: new Map(),
        totalCalls: 0,
        emptyCalls: 0,
        outputTokenSumWeighted: 0,
      };
      byModel.set(model, b);
    }
    return b;
  }

  // Aggregate roll-up for overallStats. Computed alongside the per-model
  // pass so we only walk `rows` once.
  let globalTotalCalls = 0;
  let globalEmpty = 0;
  let globalOutputTokensWeighted = 0;
  let globalLatencySum = 0;
  let globalLatencySamples = 0;

  for (const r of rows) {
    const b = bucket(r.model);
    const calls = Math.max(0, r.callCount | 0);

    // Latency: skip null/0. We only have one latency measurement per row
    // regardless of callCount (import-aggregate rows are null anyway, so
    // this doesn't double-weight them).
    if (typeof r.latencyMs === 'number' && r.latencyMs > 0) {
      b.latencies.push(r.latencyMs);
      globalLatencySum += r.latencyMs;
      globalLatencySamples += 1;
    }

    // Output distribution + totals. Weight by callCount so import-aggregate
    // rows (one DB row, thousands of real calls) contribute correctly.
    const bk = bucketize(r.outputTokens);
    b.outputCounts.set(bk, (b.outputCounts.get(bk) ?? 0) + calls);
    b.totalCalls += calls;
    b.outputTokenSumWeighted += r.outputTokens * calls;
    if (r.outputTokens === 0) b.emptyCalls += calls;

    globalTotalCalls += calls;
    globalOutputTokensWeighted += r.outputTokens * calls;
    if (r.outputTokens === 0) globalEmpty += calls;
  }

  // ---------- Latency per model ----------
  const latencyByModel: ModelLatency[] = [];
  for (const [model, b] of byModel.entries()) {
    if (b.totalCalls < MIN_SAMPLES_PER_MODEL) continue;
    if (b.latencies.length === 0) {
      // Model has calls but no latency data (e.g. all import-aggregate rows).
      // Skip it — including with p50=0 would be misleading.
      continue;
    }
    const sorted = b.latencies.slice().sort((a, z) => a - z);
    latencyByModel.push({
      model,
      p50: Math.round(percentile(sorted, 0.5)),
      p95: Math.round(percentile(sorted, 0.95)),
      p99: Math.round(percentile(sorted, 0.99)),
      mean: Math.round(mean(sorted)),
      n: b.totalCalls,
    });
  }
  latencyByModel.sort((a, z) => z.p95 - a.p95);

  // ---------- Output distribution per model ----------
  const outputDistribution: OutputDistribution[] = [];
  for (const [model, b] of byModel.entries()) {
    if (b.totalCalls < MIN_SAMPLES_PER_MODEL) continue;
    // Emit one row per bucket (even zero-count buckets) so the stacked-bar
    // renderer doesn't have to backfill missing keys. The five buckets sum
    // to `b.totalCalls` by construction.
    const rounded: OutputDistribution[] = OUTPUT_BUCKETS.map((bk) => {
      const count = b.outputCounts.get(bk) ?? 0;
      const pct = b.totalCalls > 0 ? (count / b.totalCalls) * 100 : 0;
      return { model, bucket: bk, count, pctOfModel: Math.round(pct * 10) / 10 };
    });
    // Fix rounding drift so percentages sum to exactly 100 per model
    // (within 0.1). The largest-bucket adjustment keeps numbers visually
    // stable across reloads.
    const total = rounded.reduce((s, r) => s + r.pctOfModel, 0);
    const drift = Math.round((100 - total) * 10) / 10;
    if (Math.abs(drift) >= 0.05) {
      let largest = rounded[0]!;
      for (const r of rounded) if (r.pctOfModel > largest.pctOfModel) largest = r;
      largest.pctOfModel = Math.round((largest.pctOfModel + drift) * 10) / 10;
    }
    for (const r of rounded) outputDistribution.push(r);
  }

  // ---------- Error rates per model ----------
  const errorRates: ErrorRate[] = [];
  for (const [model, b] of byModel.entries()) {
    if (b.totalCalls < MIN_SAMPLES_PER_MODEL) continue;
    // Clamp to [0, 100] defensively — even though emptyCalls ≤ totalCalls
    // by construction, an upstream bug shouldn't surface as 137% empty.
    const rate = b.totalCalls > 0 ? (b.emptyCalls / b.totalCalls) * 100 : 0;
    errorRates.push({
      model,
      totalCalls: b.totalCalls,
      emptyResponses: b.emptyCalls,
      emptyRate: Math.max(0, Math.min(100, Math.round(rate * 100) / 100)),
    });
  }
  errorRates.sort((a, z) => z.emptyRate - a.emptyRate);

  // ---------- Overall stats ----------
  const avgLatencyMs =
    globalLatencySamples > 0 ? Math.round(globalLatencySum / globalLatencySamples) : 0;
  const avgOutputTokens =
    globalTotalCalls > 0 ? Math.round(globalOutputTokensWeighted / globalTotalCalls) : 0;
  const emptyRatePercent =
    globalTotalCalls > 0
      ? Math.max(0, Math.min(100, Math.round((globalEmpty / globalTotalCalls) * 10000) / 100))
      : 0;

  return {
    period,
    generatedAt,
    latencyByModel,
    outputDistribution,
    errorRates,
    overallStats: {
      totalCalls: globalTotalCalls,
      avgLatencyMs,
      avgOutputTokens,
      totalEmpty: globalEmpty,
      emptyRatePercent,
    },
  };
}
