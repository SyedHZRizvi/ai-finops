// Per-app cost-trend indicators. Compares the last 7 days of cost against
// the prior 7 days for every appName seen in the last 14 days, then derives
// a coarse direction label suitable for a dashboard chip.
//
// The five-bucket scheme is intentionally coarse — an engineering lead
// glancing at a list wants "burning vs flat vs cooling", not a precise
// percentage. We still surface the raw changePercent for tooltips and the
// dailyAvgCost so callers can sort by magnitude.
//
// Apps with effectively no spend in either window (<$0.01) are filtered
// out so a stale dev sandbox doesn't pollute the list with noisy ±9999%
// readings from a single accidental call.
import { prisma } from './db';

export type TrendDirection = 'up-fast' | 'up' | 'flat' | 'down' | 'down-fast';

export interface AppTrend {
  appName: string | null;
  last7DaysCost: number;
  prior7DaysCost: number;
  changePercent: number;
  direction: TrendDirection;
  dailyAvgCost: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_WINDOW_COST = 0.01;

// Threshold table: bucket boundaries on changePercent (last vs prior).
// Symmetric around 0; flat is a ±10% deadband.
function classifyDirection(changePercent: number): TrendDirection {
  if (!Number.isFinite(changePercent)) return 'flat';
  if (changePercent > 50) return 'up-fast';
  if (changePercent > 10) return 'up';
  if (changePercent >= -10) return 'flat';
  if (changePercent >= -50) return 'down';
  return 'down-fast';
}

// Divide-by-zero handling: if the prior window had no spend but the last
// window did, that's a brand-new spend pattern — definitionally up-fast.
// If both windows are empty we filter the app out upstream.
function changePercentSafe(last: number, prior: number): number {
  if (prior <= 0) {
    if (last <= 0) return 0;
    return Number.POSITIVE_INFINITY;
  }
  return ((last - prior) / prior) * 100;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

export async function computeAppTrends(now: Date = new Date()): Promise<AppTrend[]> {
  const fourteenDaysAgo = new Date(now.getTime() - 14 * MS_PER_DAY);
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);

  const rows = await prisma.promptLog.findMany({
    where: { timestamp: { gte: fourteenDaysAgo, lte: now } },
    select: { appName: true, timestamp: true, totalCost: true },
  });

  // Per-app cost in each window. Map key uses '\0' as a sentinel for null
  // appName so we can preserve the distinction in the output.
  const NULL_KEY = '\0';
  const byApp = new Map<string, { last: number; prior: number }>();
  for (const r of rows) {
    const key = r.appName ?? NULL_KEY;
    const slot = byApp.get(key) ?? { last: 0, prior: 0 };
    if (r.timestamp >= sevenDaysAgo) {
      slot.last += r.totalCost;
    } else {
      slot.prior += r.totalCost;
    }
    byApp.set(key, slot);
  }

  const items: AppTrend[] = [];
  for (const [key, { last, prior }] of byApp.entries()) {
    // Skip apps with negligible spend in BOTH windows — these are stale
    // sandboxes, not a real trend.
    if (last < MIN_WINDOW_COST && prior < MIN_WINDOW_COST) continue;

    const changePercent = changePercentSafe(last, prior);
    const direction = classifyDirection(changePercent);
    const dailyAvgCost = last / 7;

    items.push({
      appName: key === NULL_KEY ? null : key,
      last7DaysCost: round4(last),
      prior7DaysCost: round4(prior),
      // Cap the percentage at a sane value for UI display while still
      // marking direction = 'up-fast'. JSON can't carry Infinity.
      changePercent: Number.isFinite(changePercent)
        ? round2(changePercent)
        : 9999,
      direction,
      dailyAvgCost: round4(dailyAvgCost),
    });
  }

  items.sort((a, b) => b.dailyAvgCost - a.dailyAvgCost);
  return items;
}
