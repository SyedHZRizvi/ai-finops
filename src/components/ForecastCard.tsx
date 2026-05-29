import type { Forecast } from '@/lib/forecasting';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function loadForecast(): Promise<Forecast | null> {
  try {
    const r = await fetch(`${BASE_URL}/api/forecast`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as Forecast;
  } catch {
    return null;
  }
}

export async function ForecastCard() {
  const f = await loadForecast();
  if (!f) {
    return (
      <div className="hero fade-up">
        <div className="label">Month-end projection</div>
        <div className="stat-num-xl mt-2 text-muted">—</div>
        <div className="text-sm text-muted mt-2">Forecast unavailable.</div>
      </div>
    );
  }

  return (
    <div className="hero fade-up">
      <div className="label">Projected month-end spend</div>
      <div className="stat-num-xl mt-2 gradient-text">
        {formatUSD(f.projectedMonthEnd)}
      </div>
      <div className="text-sm text-inkDim mt-2">
        {formatUSD(f.monthToDate)} so far · {f.daysRemaining} day
        {f.daysRemaining === 1 ? '' : 's'} left
      </div>
      {f.confidence === 'low' && (
        <div className="text-xs text-warn mt-3">
          Limited data — confidence: low
        </div>
      )}
    </div>
  );
}
