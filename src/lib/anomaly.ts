// Anomaly detection engine. Pure detection — does not persist or dispatch.
// The cron endpoint at /api/anomaly/check calls detectAnomalies(), then
// dedupes against AnomalyEvent rows and persists/notifies.
//
// Design notes:
// - Every detector handles the "no data" case as []. Cold-start dashboards
//   must not throw or alert phantom anomalies.
// - scopeKey is the dedupe identity. The check route filters out any
//   (kind, scopeKey) pair already represented by an unresolved row from the
//   last 24h, so detectors are free to emit the same anomaly every run; the
//   dedupe layer collapses them.
// - Cost thresholds (e.g. >$0.50 floor on cost-spike) intentionally avoid
//   false alarms on tiny demo datasets. A 10x jump from $0.001 to $0.01 is
//   technically a spike but nobody cares.
// - Each detector uses its own database query (no fan-out from a single
//   load). Cleaner to read, and the rows we need differ wildly between them
//   (counts vs. costs vs. timestamps).

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export type AnomalyKind =
  | 'cost-spike'
  | 'new-model'
  | 'expensive-prompt'
  | 'budget-breach'
  | 'latency-spike';

export type AnomalySeverity = 'info' | 'warn' | 'critical';

export interface DetectedAnomaly {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  title: string;
  description: string;
  // Stable identity for dedupe. Same (kind, scopeKey) within the dedupe
  // window is considered the same anomaly. Include date-grain for time-bound
  // detectors so a spike on Monday and a spike on Tuesday are different
  // events, but two cron runs on Monday morning are one.
  scopeKey: string;
  metadata: Record<string, unknown>;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// Configurable thresholds. These are conservative — too noisy and the
// alerts get ignored within a week.
const COST_SPIKE_MIN_ABS_USD = 0.5;
const COST_SPIKE_CRITICAL_ABS_USD = 5;
const COST_SPIKE_WARN_RATIO = 2;
const COST_SPIKE_CRITICAL_RATIO = 5;
const EXPENSIVE_PROMPT_USD = 1;
const LATENCY_SPIKE_RATIO = 3;
const LATENCY_SPIKE_MIN_SAMPLES = 10;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function formatUSDInline(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  if (Math.abs(n) < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface CostByDay {
  day: string; // YYYY-MM-DD UTC
  totalCost: number;
}

// Build per-day cost buckets in UTC over the supplied span. We do the
// bucketing in JS rather than Postgres date_trunc so the same code works on
// demo SQLite if anyone wires it up later — Prisma can't issue a portable
// GROUP BY date(timestamp).
function bucketByDay(
  rows: { timestamp: Date; totalCost: number }[],
): CostByDay[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const day = isoDate(r.timestamp);
    map.set(day, (map.get(day) ?? 0) + r.totalCost);
  }
  return Array.from(map.entries())
    .map(([day, totalCost]) => ({ day, totalCost }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

async function detectCostSpike(now: Date): Promise<DetectedAnomaly[]> {
  // Look back 8 days: today + 7 days of baseline so the rolling average
  // covers a full week. If we only had 7 days total we'd include today in
  // its own baseline, biasing the average up.
  const since = new Date(now.getTime() - 8 * MS_PER_DAY);
  const rows = await prisma.promptLog.findMany({
    where: { timestamp: { gte: since } },
    select: { timestamp: true, totalCost: true, appName: true },
  });
  if (rows.length === 0) return [];

  const today = isoDate(now);
  const out: DetectedAnomaly[] = [];

  // Inner helper: given a label (global or app name) and a filtered slice
  // of rows, evaluate the spike condition and emit.
  function evaluate(label: string, slice: { timestamp: Date; totalCost: number }[]): void {
    if (slice.length === 0) return;
    const buckets = bucketByDay(slice);
    const todayBucket = buckets.find((b) => b.day === today);
    const todayCost = todayBucket?.totalCost ?? 0;
    if (todayCost < COST_SPIKE_MIN_ABS_USD) return;

    // Average of the 7 prior days (exclude today even if it sneaks in).
    const baseline = buckets.filter((b) => b.day !== today).slice(-7);
    if (baseline.length === 0) return;
    const avg = baseline.reduce((s, b) => s + b.totalCost, 0) / baseline.length;
    // If average is essentially zero we can't compute a meaningful ratio,
    // and "infinite jump from $0 to $0.50" is more noise than signal.
    if (avg <= 0.01) return;

    const ratio = todayCost / avg;
    let severity: AnomalySeverity;
    if (ratio >= COST_SPIKE_CRITICAL_RATIO && todayCost >= COST_SPIKE_CRITICAL_ABS_USD) {
      severity = 'critical';
    } else if (ratio >= COST_SPIKE_WARN_RATIO) {
      severity = 'warn';
    } else {
      return;
    }

    const scopeKey = `cost-spike:${label}:${today}`;
    const ratioStr = ratio.toFixed(1);
    out.push({
      kind: 'cost-spike',
      severity,
      title:
        label === 'global'
          ? `Cost spike: ${ratioStr}x the 7-day average`
          : `Cost spike in "${label}": ${ratioStr}x the 7-day average`,
      description: `Today's spend is ${formatUSDInline(todayCost)} vs. a 7-day average of ${formatUSDInline(
        avg,
      )}. ${
        severity === 'critical'
          ? 'This is a critical jump and likely a runaway prompt, misconfigured loop, or new high-cost workload.'
          : 'Confirm whether this is expected — a new launch can look identical to a regression.'
      }`,
      scopeKey,
      metadata: {
        scope: label,
        todayCost: round2(todayCost),
        baselineDailyAvg: round2(avg),
        ratio: round2(ratio),
        baselineDays: baseline.length,
        date: today,
      },
    });
  }

  // Global slice.
  evaluate('global', rows);

  // Per-app slices. Only check apps with non-trivial spend today; a brand
  // new app firing one $0.60 call today shouldn't trigger 10000x alerts.
  const byApp = new Map<string, { timestamp: Date; totalCost: number }[]>();
  for (const r of rows) {
    if (!r.appName) continue;
    const list = byApp.get(r.appName) ?? [];
    list.push({ timestamp: r.timestamp, totalCost: r.totalCost });
    byApp.set(r.appName, list);
  }
  for (const [appName, slice] of byApp.entries()) {
    evaluate(appName, slice);
  }

  return out;
}

async function detectNewModel(now: Date): Promise<DetectedAnomaly[]> {
  const since = new Date(now.getTime() - 24 * MS_PER_HOUR);
  // Distinct models in the last 24h.
  const recent = await prisma.promptLog.findMany({
    where: { timestamp: { gte: since } },
    select: { model: true },
    distinct: ['model'],
  });
  if (recent.length === 0) return [];

  // Distinct models prior to that window. If a model is in `recent` but
  // not in `prior`, it's new.
  const recentSet = new Set(recent.map((r) => r.model));
  const prior = await prisma.promptLog.findMany({
    where: { timestamp: { lt: since }, model: { in: Array.from(recentSet) } },
    select: { model: true },
    distinct: ['model'],
  });
  const priorSet = new Set(prior.map((r) => r.model));

  const newModels = Array.from(recentSet).filter((m) => !priorSet.has(m));
  return newModels.map((model) => ({
    kind: 'new-model' as const,
    severity: 'info' as const,
    title: `New model in use: ${model}`,
    description: `${model} has appeared in your logs for the first time. Confirm it is approved for production and that pricing is configured — unpriced models bill at $0 and skew cost reports.`,
    scopeKey: `new-model:${model}`,
    metadata: { model, firstSeenWindow: '24h' },
  }));
}

async function detectExpensivePrompt(now: Date): Promise<DetectedAnomaly[]> {
  const since = new Date(now.getTime() - 24 * MS_PER_HOUR);
  const rows = await prisma.promptLog.findMany({
    where: { timestamp: { gte: since }, totalCost: { gt: EXPENSIVE_PROMPT_USD } },
    select: {
      id: true,
      timestamp: true,
      appName: true,
      model: true,
      totalCost: true,
      promptText: true,
      inputTokens: true,
      outputTokens: true,
    },
    orderBy: { totalCost: 'desc' },
    take: 50, // hard cap — a misconfigured loop could yield thousands
  });
  return rows.map((r) => ({
    kind: 'expensive-prompt' as const,
    severity: 'warn' as const,
    title: `Expensive prompt: ${formatUSDInline(r.totalCost)} on ${r.model}`,
    description: `${
      r.appName ? `App "${r.appName}" ` : ''
    }logged a single call costing ${formatUSDInline(r.totalCost)} (${r.inputTokens} in / ${
      r.outputTokens
    } out tokens). Review whether the prompt is unbounded or a smaller model could handle it.`,
    scopeKey: `expensive-prompt:${r.id}`,
    metadata: {
      promptLogId: r.id,
      model: r.model,
      appName: r.appName,
      totalCost: round2(r.totalCost),
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      promptPreview: r.promptText.slice(0, 140),
    },
  }));
}

async function detectBudgetBreach(now: Date): Promise<DetectedAnomaly[]> {
  const budgets = await prisma.budget.findMany({ where: { isActive: true } });
  if (budgets.length === 0) return [];

  const monthStart = startOfMonth(now);
  const out: DetectedAnomaly[] = [];

  for (const b of budgets) {
    const where: Prisma.PromptLogWhereInput = { timestamp: { gte: monthStart } };
    if (b.scope === 'app' && b.scopeValue) where.appName = b.scopeValue;
    else if (b.scope === 'user' && b.scopeValue) where.userId = b.scopeValue;

    const agg = await prisma.promptLog.aggregate({
      where,
      _sum: { totalCost: true },
    });
    const monthToDate = agg._sum.totalCost ?? 0;
    const limit = b.monthlyLimit;
    if (!Number.isFinite(limit) || limit <= 0) continue;

    const percentUsed = (monthToDate / limit) * 100;
    let severity: AnomalySeverity | null = null;
    if (percentUsed >= 100) severity = 'critical';
    else if (percentUsed >= 90) severity = 'warn';
    if (!severity) continue;

    const scopeLabel =
      b.scope === 'global'
        ? 'Global'
        : `${b.scope === 'app' ? 'App' : 'User'} "${b.scopeValue ?? ''}"`;

    out.push({
      kind: 'budget-breach',
      severity,
      title:
        severity === 'critical'
          ? `${scopeLabel} budget breached`
          : `${scopeLabel} budget at ${Math.round(percentUsed)}%`,
      description: `Month-to-date spend is ${formatUSDInline(
        monthToDate,
      )} against a ${formatUSDInline(limit)} ${b.currency} cap (${percentUsed.toFixed(
        0,
      )}% used). ${
        severity === 'critical'
          ? 'The cap is exceeded. Review the budget or investigate the source workload.'
          : 'Approaching the cap — confirm the projected month-end and decide whether to raise the cap or throttle.'
      }`,
      // Month-grain dedupe: same budget hitting 95% on the 18th and 99% on
      // the 19th of the same month is the same incident, not a new one. A
      // breach in June and a breach in July are different incidents.
      scopeKey: `budget-breach:${b.id}:${isoDate(monthStart)}`,
      metadata: {
        budgetId: b.id,
        scope: b.scope,
        scopeValue: b.scopeValue,
        monthToDate: round2(monthToDate),
        monthlyLimit: round2(limit),
        currency: b.currency,
        percentUsed: round2(percentUsed),
      },
    });
  }

  return out;
}

async function detectLatencySpike(now: Date): Promise<DetectedAnomaly[]> {
  const sinceHour = new Date(now.getTime() - MS_PER_HOUR);
  const sinceDay = new Date(now.getTime() - 24 * MS_PER_HOUR);

  // Pull the 24h window once, then split into hour/baseline in JS. Two
  // separate queries would also work; this is cheaper for the DB.
  const rows = await prisma.promptLog.findMany({
    where: { timestamp: { gte: sinceDay }, latencyMs: { not: null } },
    select: { timestamp: true, latencyMs: true },
  });
  if (rows.length === 0) return [];

  const hourSamples: number[] = [];
  const baselineSamples: number[] = [];
  for (const r of rows) {
    if (r.latencyMs == null) continue;
    if (r.timestamp >= sinceHour) hourSamples.push(r.latencyMs);
    else baselineSamples.push(r.latencyMs);
  }

  if (
    hourSamples.length < LATENCY_SPIKE_MIN_SAMPLES ||
    baselineSamples.length < LATENCY_SPIKE_MIN_SAMPLES
  ) {
    return [];
  }

  const avg = (xs: number[]): number =>
    xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
  const hourAvg = avg(hourSamples);
  const baselineAvg = avg(baselineSamples);
  if (baselineAvg <= 0) return [];
  const ratio = hourAvg / baselineAvg;
  if (ratio < LATENCY_SPIKE_RATIO) return [];

  return [
    {
      kind: 'latency-spike',
      severity: 'warn',
      title: `Latency spike: ${ratio.toFixed(1)}x slower than the 24h baseline`,
      description: `The last hour averaged ${Math.round(
        hourAvg,
      )}ms per call (${hourSamples.length} samples) vs. ${Math.round(
        baselineAvg,
      )}ms over the prior 23 hours. This often indicates provider throttling, a model swap to a slower endpoint, or upstream contention.`,
      // Hour-grain dedupe: latency spikes in 2pm vs. 3pm are different
      // incidents (the provider may have recovered and re-degraded).
      scopeKey: `latency-spike:global:${now.toISOString().slice(0, 13)}`,
      metadata: {
        hourAvgMs: Math.round(hourAvg),
        baselineAvgMs: Math.round(baselineAvg),
        ratio: round2(ratio),
        hourSamples: hourSamples.length,
        baselineSamples: baselineSamples.length,
      },
    },
  ];
}

export async function detectAnomalies(opts?: {
  lookbackHours?: number;
}): Promise<DetectedAnomaly[]> {
  // lookbackHours currently shapes nothing — every detector enforces its
  // own windows (cost-spike needs 7d, latency-spike needs 24h, etc.). Keep
  // it on the signature for API stability and so future detectors that
  // genuinely want a configurable window can use it.
  void opts;

  const now = new Date();

  // Run detectors in parallel — they share no state and each makes its
  // own DB calls.
  const results = await Promise.all([
    safeRun(() => detectCostSpike(now)),
    safeRun(() => detectNewModel(now)),
    safeRun(() => detectExpensivePrompt(now)),
    safeRun(() => detectBudgetBreach(now)),
    safeRun(() => detectLatencySpike(now)),
  ]);

  return results.flat();
}

// Wrap each detector so one failing detector (e.g. a query timeout on a
// massive table) doesn't sink the whole cron run. The cost of a failed
// detector is one missed alert this cycle; the next cycle will retry.
async function safeRun(
  fn: () => Promise<DetectedAnomaly[]>,
): Promise<DetectedAnomaly[]> {
  try {
    return await fn();
  } catch (err) {
    // Detection is best-effort. Logging here keeps Vercel's function log
    // helpful without escalating to a 500.
    // eslint-disable-next-line no-console
    console.error('[anomaly] detector failed:', err);
    return [];
  }
}
