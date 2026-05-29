// Weekly (and daily/monthly) digest builder. The digest is the email/Slack
// surface for AI FinOps — CTOs and CFOs do not open dashboards every day,
// but they will read a digest in their inbox. It needs to land the
// headline number, the vs-previous-period delta, the top recommendation,
// and any active anomalies in a few seconds of reading.
//
// We reuse computeInsights() (for recommendations) and forecastMonthEnd()
// (for the month-end projection) so the digest never disagrees with what's
// on screen. The only thing we compute fresh is the period-vs-previous
// comparison, since that view doesn't exist elsewhere.

import { prisma } from '@/lib/db';
import { computeInsights } from '@/lib/insights';
import { ensurePricingLoaded } from '@/lib/pricing';
import { forecastMonthEnd } from '@/lib/forecasting';

export type DigestPeriod = 'daily' | 'weekly' | 'monthly';

export interface DigestData {
  period: DigestPeriod;
  rangeFrom: Date;
  rangeTo: Date;
  totals: {
    calls: number;
    tokens: number;
    cost: number;
    /** Absolute USD delta vs the previous equal-length period. Positive = more spend. */
    vsPrevPeriod: number;
    /**
     * Percentage delta vs the previous equal-length period. Positive = spend up.
     * If there is no previous-period data (first week of usage), this is 0 and
     * the caller should render "no prior data to compare" rather than "0%".
     */
    vsPrevPercent: number;
  };
  topApps: Array<{ appName: string; cost: number; pctOfTotal: number }>;
  topModels: Array<{ model: string; cost: number; calls: number }>;
  topSpenders: Array<{ id: string; model: string; promptPreview: string; cost: number }>;
  topRecommendations: Array<{
    title: string;
    estimatedMonthlySavings: number;
    affectedCalls: number;
  }>;
  anomalies: Array<{ kind: string; severity: string; title: string; detectedAt: Date }>;
  forecast?: { projectedMonthEnd: number; confidence: 'high' | 'medium' | 'low' };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function periodWindow(period: DigestPeriod, now: Date): { from: Date; to: Date; spanMs: number } {
  const to = now;
  let spanMs: number;
  switch (period) {
    case 'daily':
      spanMs = 1 * MS_PER_DAY;
      break;
    case 'weekly':
      spanMs = 7 * MS_PER_DAY;
      break;
    case 'monthly':
      spanMs = 30 * MS_PER_DAY;
      break;
  }
  const from = new Date(to.getTime() - spanMs);
  return { from, to, spanMs };
}

// Map digest period onto the period vocabulary computeInsights() uses.
// '24h' / '7d' / '30d' map cleanly; monthly uses '30d'.
function insightsPeriod(period: DigestPeriod): '24h' | '7d' | '30d' {
  if (period === 'daily') return '24h';
  if (period === 'weekly') return '7d';
  return '30d';
}

interface RangeRow {
  appName: string | null;
  model: string;
  totalCost: number;
  totalTokens: number;
  callCount: number;
  promptText: string;
  id: string;
}

interface RangeAggregate {
  cost: number;
  tokens: number;
  calls: number;
}

async function aggregateRange(from: Date, to: Date): Promise<{ rows: RangeRow[]; totals: RangeAggregate }> {
  const rows = await prisma.promptLog.findMany({
    where: { timestamp: { gte: from, lt: to } },
    select: {
      id: true,
      appName: true,
      model: true,
      totalCost: true,
      totalTokens: true,
      callCount: true,
      promptText: true,
    },
    orderBy: { totalCost: 'desc' },
  });

  let cost = 0;
  let tokens = 0;
  let calls = 0;
  for (const r of rows) {
    cost += r.totalCost;
    tokens += r.totalTokens;
    // Audit H12: sum callCount, not row count — import-aggregate rows fold
    // many real calls into a single row.
    calls += r.callCount || 1;
  }

  return { rows, totals: { cost, tokens, calls } };
}

async function previousPeriodTotals(from: Date, spanMs: number): Promise<RangeAggregate | null> {
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - spanMs);
  const rows = await prisma.promptLog.findMany({
    where: { timestamp: { gte: prevFrom, lt: prevTo } },
    select: { totalCost: true, totalTokens: true, callCount: true },
  });
  if (rows.length === 0) return null;
  let cost = 0;
  let tokens = 0;
  let calls = 0;
  for (const r of rows) {
    cost += r.totalCost;
    tokens += r.totalTokens;
    calls += r.callCount || 1;
  }
  return { cost, tokens, calls };
}

function topAppsFromRows(rows: RangeRow[], totalCost: number): DigestData['topApps'] {
  const groups = new Map<string, number>();
  for (const r of rows) {
    const key = r.appName ?? 'unknown';
    groups.set(key, (groups.get(key) ?? 0) + r.totalCost);
  }
  const list = Array.from(groups.entries()).map(([appName, cost]) => ({
    appName,
    cost,
    pctOfTotal: totalCost > 0 ? (cost / totalCost) * 100 : 0,
  }));
  return list.sort((a, b) => b.cost - a.cost).slice(0, 5);
}

function topModelsFromRows(rows: RangeRow[]): DigestData['topModels'] {
  const groups = new Map<string, { cost: number; calls: number }>();
  for (const r of rows) {
    const slot = groups.get(r.model) ?? { cost: 0, calls: 0 };
    slot.cost += r.totalCost;
    slot.calls += r.callCount || 1;
    groups.set(r.model, slot);
  }
  return Array.from(groups.entries())
    .map(([model, v]) => ({ model, cost: v.cost, calls: v.calls }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);
}

function topSpendersFromRows(rows: RangeRow[]): DigestData['topSpenders'] {
  return rows
    .slice() // already sorted by totalCost desc, but defensive copy
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      model: r.model,
      // Audit M3: trim and collapse whitespace for email readability.
      promptPreview: r.promptText.slice(0, 120).replace(/\s+/g, ' ').trim(),
      cost: r.totalCost,
    }));
}

async function recentAnomalies(from: Date, to: Date): Promise<DigestData['anomalies']> {
  // Pull anomalies that fired during the digest range. We include resolved
  // ones too because the digest is a retrospective — the operator should
  // still see what happened, even if the spike has since cleared.
  const events = await prisma.anomalyEvent.findMany({
    where: { detectedAt: { gte: from, lt: to } },
    select: { kind: true, severity: true, title: true, detectedAt: true },
    orderBy: [{ severity: 'asc' }, { detectedAt: 'desc' }],
    take: 5,
  });
  return events.map((e) => ({
    kind: e.kind,
    severity: e.severity,
    title: e.title,
    detectedAt: e.detectedAt,
  }));
}

async function buildForecast(now: Date): Promise<DigestData['forecast']> {
  // Pull 30 days for EMA seeding warmth even when we run early in a month.
  const since = new Date(now.getTime() - 30 * MS_PER_DAY);
  const rows = await prisma.promptLog.findMany({
    where: { timestamp: { gte: since } },
    select: { timestamp: true, totalCost: true },
    orderBy: { timestamp: 'asc' },
  });
  if (rows.length === 0) return undefined;
  const points = rows.map((r) => ({ ts: r.timestamp, cost: r.totalCost }));
  const f = forecastMonthEnd(points, now);
  return { projectedMonthEnd: f.projectedMonthEnd, confidence: f.confidence };
}

export async function buildDigest(period: DigestPeriod, now?: Date): Promise<DigestData> {
  await ensurePricingLoaded();

  const ts = now ?? new Date();
  const { from, to, spanMs } = periodWindow(period, ts);

  // Parallel: range aggregates, previous-period comparison, anomalies,
  // forecast, and recommendations from the insights engine.
  const [{ rows, totals }, prev, anomalies, forecast, insights] = await Promise.all([
    aggregateRange(from, to),
    previousPeriodTotals(from, spanMs),
    recentAnomalies(from, to),
    buildForecast(ts),
    computeInsights(insightsPeriod(period)),
  ]);

  // vs-previous delta. If there's no comparable prior window (first week of
  // data, week 1 of deployment), surface zeros and let the renderer decide
  // how to label "no prior data". The renderer treats the (0, 0) tuple as
  // "no prior data"; in practice floating-point spend totals will never be
  // *exactly* equal across two weeks, so this aliasing is safe.
  let vsPrevPeriod = 0;
  let vsPrevPercent = 0;
  if (prev && prev.cost > 0) {
    vsPrevPeriod = totals.cost - prev.cost;
    vsPrevPercent = (vsPrevPeriod / prev.cost) * 100;
  }

  const topRecommendations = insights.recommendations.slice(0, 3).map((r) => ({
    title: r.title,
    estimatedMonthlySavings: r.estimatedMonthlySavings,
    affectedCalls: r.affectedCalls,
  }));

  return {
    period,
    rangeFrom: from,
    rangeTo: to,
    totals: {
      calls: totals.calls,
      tokens: totals.tokens,
      cost: totals.cost,
      vsPrevPeriod,
      vsPrevPercent,
    },
    topApps: topAppsFromRows(rows, totals.cost),
    topModels: topModelsFromRows(rows),
    topSpenders: topSpendersFromRows(rows),
    topRecommendations,
    anomalies,
    forecast,
  };
}
