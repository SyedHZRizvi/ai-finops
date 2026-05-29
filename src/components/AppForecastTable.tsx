import type { AppForecast } from '@/lib/perAppForecast';
import { TrendChip } from './TrendChip';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

interface ForecastPerAppResponse {
  items: AppForecast[];
  error?: string;
}

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs === 0) return '$0.00';
  if (abs < 0.01) return `$${n.toFixed(4)}`;
  if (abs < 1) return `$${n.toFixed(3)}`;
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Color the % bar based on how deep into budget we are. Mirrors the
// thresholds BudgetTable uses so the two read consistently.
function barColor(pct: number | null): string {
  if (pct === null) return 'bg-panel3';
  if (pct >= 90) return 'bg-bad';
  if (pct >= 75) return 'bg-warn';
  return 'bg-good';
}

// Days-until-breach chip colors per the brief:
//   <= 0   → red "breached"
//   1-7    → red
//   8-14   → amber
//   15+    → green
//   null   → muted "—"
function breachChip(days: number | null) {
  if (days === null) {
    return <span className="text-muted text-xs">—</span>;
  }
  if (days <= 0) {
    return (
      <span className="chip chip-bad" title="Budget already breached">
        Breached
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="chip chip-bad" title="Less than a week to breach">
        {days}d
      </span>
    );
  }
  if (days <= 14) {
    return (
      <span className="chip chip-warn" title="Within two weeks of breach">
        {days}d
      </span>
    );
  }
  return (
    <span className="chip chip-good" title="More than two weeks of runway">
      {days}d
    </span>
  );
}

async function loadForecasts(): Promise<{
  items: AppForecast[] | null;
  error: string | null;
}> {
  try {
    const r = await fetch(`${BASE_URL}/api/forecast/per-app`, { cache: 'no-store' });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return { items: null, error: j.error ?? `Status ${r.status}` };
    }
    const json = (await r.json()) as ForecastPerAppResponse;
    return { items: Array.isArray(json.items) ? json.items : [], error: null };
  } catch (err) {
    return {
      items: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function AppForecastTable() {
  const { items, error } = await loadForecasts();

  if (error) {
    return (
      <div className="card card-pad border-warn/40 bg-warn/5 text-sm text-warn fade-up-delay-2">
        Couldn&apos;t load per-app forecasts: {error}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="card card-pad text-sm text-muted fade-up-delay-2">
        No per-app spend yet this month. Per-app projections appear once apps
        start logging cost.
      </div>
    );
  }

  return (
    <div className="card fade-up-delay-2">
      <div className="px-6 py-4 border-b border-border">
        <div className="label">Per-app forecasts</div>
        <div className="text-xs text-muted mt-1">
          Projected month-end spend per app, with budget runway and current
          cost trend.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>App</th>
              <th className="text-right">Month-to-date</th>
              <th className="text-right">Projected month-end</th>
              <th className="min-w-[180px]">% of budget</th>
              <th>Days until breach</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const key = row.appName ?? '__null__';
              const pct = row.pctOfBudget;
              const pctClamped = pct === null ? 0 : Math.max(0, Math.min(100, pct));
              return (
                <tr key={key}>
                  <td className="font-medium text-sm">
                    {row.appName ?? (
                      <span className="text-muted italic">unknown</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatUSD(row.monthToDate)}
                  </td>
                  <td className="text-right tabular-nums font-semibold">
                    {formatUSD(row.projectedMonthEnd)}
                  </td>
                  <td className="min-w-[180px]">
                    {pct === null ? (
                      <span className="text-xs text-muted">no budget</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-panel3 overflow-hidden">
                          <div
                            className={`h-full ${barColor(pct)} transition-all`}
                            style={{ width: `${pctClamped}%` }}
                          />
                        </div>
                        <div className="text-xs tabular-nums text-muted w-16 text-right">
                          {pct.toFixed(0)}%
                        </div>
                      </div>
                    )}
                  </td>
                  <td>{breachChip(row.daysUntilBudgetBreach)}</td>
                  <td>
                    <TrendChip direction={row.trend} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
