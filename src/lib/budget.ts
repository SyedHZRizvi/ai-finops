// Budget evaluation. Given a Budget row + the current month-to-date spend
// for the budget's scope, classify status and (when a forecast is supplied)
// flag projected breaches.

import type { Budget } from '@prisma/client';
import type { Forecast } from './forecasting';

export type BudgetStatusKind = 'ok' | 'warn-75' | 'warn-90' | 'breach-100';

export interface BudgetStatus {
  budget: Budget;
  monthToDate: number;
  percentUsed: number;
  remaining: number;
  status: BudgetStatusKind;
  projectedMonthEnd?: number;
  projectedBreach?: boolean;
}

function classify(percentUsed: number): BudgetStatusKind {
  if (percentUsed >= 100) return 'breach-100';
  if (percentUsed >= 90) return 'warn-90';
  if (percentUsed >= 75) return 'warn-75';
  return 'ok';
}

export function evaluateBudget(
  budget: Budget,
  monthToDate: number,
  forecast?: Forecast,
): BudgetStatus {
  const limit = Number.isFinite(budget.monthlyLimit) ? budget.monthlyLimit : 0;
  const spend = Number.isFinite(monthToDate) ? Math.max(0, monthToDate) : 0;
  // Avoid division by zero on a $0 budget — treat any spend as a breach so
  // misconfigured caps still surface in the UI.
  const percentUsed = limit > 0 ? (spend / limit) * 100 : spend > 0 ? 100 : 0;
  const remaining = Math.max(0, limit - spend);

  const result: BudgetStatus = {
    budget,
    monthToDate: round2(spend),
    percentUsed: round2(percentUsed),
    remaining: round2(remaining),
    status: classify(percentUsed),
  };

  if (forecast) {
    result.projectedMonthEnd = round2(forecast.projectedMonthEnd);
    result.projectedBreach = limit > 0 && forecast.projectedMonthEnd > limit;
  }

  return result;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
