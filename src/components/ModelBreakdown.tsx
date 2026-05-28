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

export function ModelBreakdown({ data }: { data: StatsResponse['byModel'] }) {
  const sorted = [...data].sort((a, b) => b.cost - a.cost);

  return (
    <div className="card card-pad">
      <div className="label">Models</div>
      <div className="text-xs text-muted mt-0.5 mb-3">Spend by model</div>
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
              {sorted.map((m) => (
                <tr key={m.model}>
                  <td className="font-mono text-xs">{m.model}</td>
                  <td className="text-right tabular-nums">{formatNum(m.calls)}</td>
                  <td className="text-right tabular-nums">{formatNum(m.tokens)}</td>
                  <td className="text-right tabular-nums">{formatUSD(m.cost)}</td>
                  <td className="text-right tabular-nums text-muted">
                    {m.calls > 0 ? formatUSD(m.cost / m.calls) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
