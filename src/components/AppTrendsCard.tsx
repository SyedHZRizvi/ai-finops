import type { AppTrend } from '@/lib/trends';
import { TrendChip } from './TrendChip';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

interface TrendsResponse {
  items: AppTrend[];
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

async function loadTrends(): Promise<AppTrend[] | null> {
  try {
    const r = await fetch(`${BASE_URL}/api/trends`, { cache: 'no-store' });
    if (!r.ok) return null;
    const json = (await r.json()) as TrendsResponse;
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    return null;
  }
}

export async function AppTrendsCard() {
  const items = await loadTrends();

  if (items === null) {
    return (
      <div className="card card-pad fade-up-delay-2">
        <div className="label">App cost trends</div>
        <div className="text-sm text-muted mt-3">Trends unavailable.</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card card-pad fade-up-delay-2">
        <div className="label">App cost trends</div>
        <div className="text-sm text-muted mt-3">
          Not enough data yet. Two weeks of per-app spend is needed before
          trends become meaningful.
        </div>
      </div>
    );
  }

  // Top 5 by daily-average cost — the list is already sorted in the API,
  // but we slice defensively in case that contract changes.
  const top = items.slice(0, 5);

  return (
    <div className="card fade-up-delay-2">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="label">App cost trends</div>
          <div className="text-xs text-muted mt-1">
            Last 7 days vs. prior 7. Sorted by daily spend.
          </div>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {top.map((t) => {
          const key = t.appName ?? '__null__';
          const changeAbs = Math.abs(t.changePercent);
          // Don't show a percentage for the synthetic 9999 sentinel — say
          // "new spend" instead, which is more honest about the divide-by-zero.
          const isNewSpend =
            t.prior7DaysCost === 0 && t.last7DaysCost > 0;
          return (
            <li
              key={key}
              className="px-6 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {t.appName ?? (
                    <span className="text-muted italic">unknown</span>
                  )}
                </div>
                <div className="text-xs text-muted tabular-nums mt-0.5">
                  {formatUSD(t.dailyAvgCost)}/day ·{' '}
                  {isNewSpend
                    ? 'new spend'
                    : `${t.changePercent >= 0 ? '+' : '-'}${changeAbs.toFixed(0)}%`}
                </div>
              </div>
              <TrendChip direction={t.direction} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
