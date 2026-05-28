// End-of-month cost projection. Given a series of {ts, cost} points (assumed
// to be in the current calendar month or earlier — older points are ignored),
// produce two estimates of where total spend will land by month-end and
// return the higher of the two. Returning the higher figure is intentional:
// this powers budget warnings, and under-forecasting causes silent breaches.
//
//   linear     = (avg daily spend so far this month) × (days in month)
//   ema-blend  = EMA(last 7 days) × (days remaining) + (cost so far)
//
// Confidence reflects how much month data we have. With <5 days elapsed the
// estimates are essentially noise; >14 days they tend to be quite stable.
export interface Forecast {
  monthToDate: number;
  projectedMonthEnd: number;
  daysElapsed: number;
  daysRemaining: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'linear' | 'ema-blend';
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfNextMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function daysInMonth(d: Date): number {
  const start = startOfMonth(d);
  const end = startOfNextMonth(d);
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

function startOfDayUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

export function forecastMonthEnd(
  points: { ts: Date; cost: number }[],
  now: Date = new Date(),
): Forecast {
  const monthStart = startOfMonth(now);
  const monthEnd = startOfNextMonth(now);
  const totalDays = daysInMonth(now);

  // Day index inside the month: day 1 is the 1st, etc.
  const dayOfMonth = now.getUTCDate();
  // Fractional elapsed time (in days) gives slightly smoother per-day averages
  // very early in the month — clamp to at least ~1 hour so we never divide by 0.
  const elapsedMs = Math.max(now.getTime() - monthStart.getTime(), 60 * 60 * 1000);
  const elapsedDaysFractional = elapsedMs / MS_PER_DAY;
  const daysElapsed = Math.max(1, Math.min(totalDays, dayOfMonth));
  const daysRemaining = Math.max(0, totalDays - daysElapsed);

  // Bucket month-to-date costs into per-day totals (UTC).
  const perDay = new Map<number, number>();
  let monthToDate = 0;
  for (const p of points) {
    if (!(p.ts instanceof Date) || Number.isNaN(p.ts.getTime())) continue;
    if (p.ts < monthStart || p.ts >= monthEnd) continue;
    const dayKey = startOfDayUTC(p.ts);
    perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + p.cost);
    monthToDate += p.cost;
  }

  // Linear: extrapolate the average daily run-rate to the whole month.
  const avgDailySoFar = monthToDate / elapsedDaysFractional;
  const linearProjection = avgDailySoFar * totalDays;

  // EMA-blend: weight the most recent 7 days more heavily, project the
  // remaining days at that rate, add to cost-so-far.
  const EMA_WINDOW = 7;
  const EMA_ALPHA = 2 / (EMA_WINDOW + 1); // ~0.25
  const todayKey = startOfDayUTC(now);
  let ema = avgDailySoFar; // seed at the overall average
  for (let i = EMA_WINDOW - 1; i >= 0; i--) {
    const dayKey = todayKey - i * MS_PER_DAY;
    // Skip days before the month started — they don't belong in this projection.
    if (dayKey < monthStart.getTime()) continue;
    const cost = perDay.get(dayKey) ?? 0;
    ema = EMA_ALPHA * cost + (1 - EMA_ALPHA) * ema;
  }
  const emaBlendProjection = monthToDate + ema * daysRemaining;

  // Pick the larger of the two. The "method" reflects which one wins, which
  // is useful telemetry for UIs that want to explain the number.
  const useEma = emaBlendProjection > linearProjection;
  const projectedMonthEnd = useEma ? emaBlendProjection : linearProjection;
  const method: 'linear' | 'ema-blend' = useEma ? 'ema-blend' : 'linear';

  let confidence: Forecast['confidence'];
  if (daysElapsed > 14) confidence = 'high';
  else if (daysElapsed >= 5) confidence = 'medium';
  else confidence = 'low';

  return {
    monthToDate: round2(monthToDate),
    projectedMonthEnd: round2(projectedMonthEnd),
    daysElapsed,
    daysRemaining,
    confidence,
    method,
  };
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
