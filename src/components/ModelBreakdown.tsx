import type { StatsResponse } from '@/lib/types';

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

const BAR_COLORS = ['#8b5cf6', '#22d3ee', '#ec4899', '#84cc16', '#f59e0b', '#3b82f6', '#14b8a6', '#f43f5e'];

export function ModelBreakdown({ data }: { data: StatsResponse['byModel'] }) {
  const sorted = [...data].sort((a, b) => b.cost - a.cost);
  const maxCost = sorted[0]?.cost ?? 0;

  return (
    <div className="card card-pad fade-up-delay-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label">Models</div>
          <div className="text-xs text-muted mt-1">Spend by model</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-brand2/15 border border-brand2/30 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 text-brand2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="text-sm text-muted py-6 text-center">No model usage yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Model</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Tokens</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Avg/call</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => {
                const color = BAR_COLORS[i % BAR_COLORS.length] ?? '#8b5cf6';
                const pct = maxCost > 0 ? (m.cost / maxCost) * 100 : 0;
                return (
                  <tr key={m.model}>
                    <td className="font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                        <span>{m.model}</span>
                      </div>
                      <div className="mt-1 h-1 bg-panel2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${color}99 0%, ${color} 100%)`,
                          }}
                        />
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{formatNum(m.calls)}</td>
                    <td className="text-right tabular-nums text-inkDim">{formatNum(m.tokens)}</td>
                    <td className="text-right tabular-nums font-semibold">{formatUSD(m.cost)}</td>
                    <td className="text-right tabular-nums text-muted">
                      {m.calls > 0 ? formatUSD(m.cost / m.calls) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
