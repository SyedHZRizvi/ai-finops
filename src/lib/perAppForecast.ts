// Per-app month-end forecasts. The global `/api/forecast` answers "what will
// our total AI spend be at month end" — useful for the CFO. This module
// answers the engineering-lead question: "How much will `chatbot-prod` cost
// by month end, and given my budget, when will it breach?"
//
// We reuse `forecastMonthEnd()` scoped to a single appName so the math stays
// consistent with the global forecast. Per-app trend direction is folded in
// from `computeAppTrends()` so the UI can show a trend chip next to each row.
import type { Budget } from '@prisma/client';
import { prisma } from './db';
import { forecastMonthEnd } from './forecasting';
import { computeAppTrends, type TrendDirection } from './trends';

export interface AppForecast {
  appName: string | null;
  monthToDate: number;
  projectedMonthEnd: number;
  daysUntilBudgetBreach: number | null;
  budgetLimit: number | null;
  pctOfBudget: number | null;
  trend: TrendDirection;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

// daysUntilBudgetBreach: how many days at the current daily run-rate before
// monthToDate crosses budgetLimit. Returns:
//   - null when there's no budget OR no daily spend (no signal to project)
//   - 0   when MTD has already breached
//   - integer days otherwise (rounded down — "you have N full days left")
function computeDaysUntilBreach(
  monthToDate: number,
  dailyAvgCost: number,
  budgetLimit: number | null,
  projectedMonthEnd: number,
): number | null {
  if (budgetLimit === null || budgetLimit <= 0) return null;
  if (dailyAvgCost <= 0) return null;
  // Only meaningful if the projected trajectory actually breaches the budget.
  // If projectedMonthEnd <= budgetLimit, there's no breach to count down to.
  if (projectedMonthEnd <= budgetLimit) return null;

  if (monthToDate >= budgetLimit) return 0;

  const remaining = budgetLimit - monthToDate;
  const days = remaining / dailyAvgCost;
  if (!Number.isFinite(days) || days < 0) return 0;
  return Math.floor(days);
}

export async function computeAppForecasts(
  now: Date = new Date(),
): Promise<AppForecast[]> {
  // Pull last 30 days of rows so the forecaster has enough EMA seed data
  // even very early in a calendar month. The forecaster filters down to
  // current-month points internally.
  const since = new Date(now.getTime() - 30 * MS_PER_DAY);
  const monthStart = startOfMonth(now);

  const rows = await prisma.promptLog.findMany({
    where: { timestamp: { gte: since } },
    select: { appName: true, timestamp: true, totalCost: true },
  });

  // Group rows per app for the forecaster and for MTD math.
  const NULL_KEY = '\0';
  const byApp = new Map<string, { ts: Date; cost: number }[]>();
  for (const r of rows) {
    const key = r.appName ?? NULL_KEY;
    const slot = byApp.get(key) ?? [];
    slot.push({ ts: r.timestamp, cost: r.totalCost });
    byApp.set(key, slot);
  }

  // Skip apps with zero spend so far this month — they have no forecast
  // signal and would otherwise clutter the table with rows of $0.
  // We tolerate apps with very few rows (< 5) by letting the forecaster
  // run; the linear extrapolation collapses to monthToDate-ish values
  // when daysElapsed is low, which is the desired "low confidence" behavior.
  const monthRowCount = new Map<string, number>();
  for (const r of rows) {
    if (r.timestamp < monthStart) continue;
    const key = r.appName ?? NULL_KEY;
    monthRowCount.set(key, (monthRowCount.get(key) ?? 0) + 1);
  }

  // Pull per-app budgets keyed by scopeValue. scopeValue === null means
  // a global budget, which doesn't apply here.
  const budgets = await prisma.budget.findMany({
    where: { scope: 'app', isActive: true },
  });
  const budgetByApp = new Map<string, Budget>();
  for (const b of budgets) {
    if (b.scopeValue) budgetByApp.set(b.scopeValue, b);
  }

  // Trend data is keyed by appName as well.
  const trends = await computeAppTrends(now);
  const trendByApp = new Map<string, TrendDirection>();
  for (const t of trends) {
    const key = t.appName ?? NULL_KEY;
    trendByApp.set(key, t.direction);
  }

  const items: AppForecast[] = [];
  for (const [key, points] of byApp.entries()) {
    const monthlyRows = monthRowCount.get(key) ?? 0;
    if (monthlyRows === 0) continue;

    const forecast = forecastMonthEnd(points, now);

    // Graceful handling for apps with very little current-month data: if
    // the projection wildly exceeds MTD but we have fewer than 5 rows of
    // signal, clamp projectedMonthEnd back to MTD. This avoids "one $0.40
    // dev call extrapolates to $12.40 by month-end" noise in the table.
    let projected = forecast.projectedMonthEnd;
    if (monthlyRows < 5 && projected > forecast.monthToDate * 3) {
      projected = forecast.monthToDate;
    }

    const appName = key === NULL_KEY ? null : key;
    const budget = appName ? budgetByApp.get(appName) ?? null : null;
    const budgetLimit =
      budget && Number.isFinite(budget.monthlyLimit) && budget.monthlyLimit > 0
        ? budget.monthlyLimit
        : null;
    const pctOfBudget =
      budgetLimit !== null ? (forecast.monthToDate / budgetLimit) * 100 : null;

    // Daily average rate from the current-month spend so far. We need this
    // both to compute days-until-breach and for callers wanting a quick
    // sortable "burn rate". Use daysElapsed (not 30) — early in the month a
    // /30 divisor would understate the current rate.
    const dailyAvgCost =
      forecast.daysElapsed > 0 ? forecast.monthToDate / forecast.daysElapsed : 0;

    const daysUntilBudgetBreach = computeDaysUntilBreach(
      forecast.monthToDate,
      dailyAvgCost,
      budgetLimit,
      projected,
    );

    items.push({
      appName,
      monthToDate: round2(forecast.monthToDate),
      projectedMonthEnd: round2(projected),
      daysUntilBudgetBreach,
      budgetLimit: budgetLimit === null ? null : round2(budgetLimit),
      pctOfBudget: pctOfBudget === null ? null : round2(pctOfBudget),
      trend: trendByApp.get(key) ?? 'flat',
    });
  }

  // Sort by projected month-end spend descending — biggest forecast cost
  // first is what an eng lead wants to see at the top.
  items.sort((a, b) => b.projectedMonthEnd - a.projectedMonthEnd);
  return items;
}
