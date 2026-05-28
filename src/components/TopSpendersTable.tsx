import type { TopSpender } from '@/lib/types';
import { CATEGORY_CHIP, COMPLEXITY_CHIP } from './PromptTable';

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

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function TopSpendersTable({ rows }: { rows: TopSpender[] }) {
  const med = median(rows.map((r) => r.totalCost));

  return (
    <div className="card fade-up-delay-2">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="label">Top spenders</div>
          <div className="text-xs text-muted mt-1">Top 10 most expensive individual calls</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-bad/15 border border-bad/30 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-bad" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <polyline points="17 18 23 18 23 12" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M1 6l8 8 4-4 9 9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">No prompts in this period.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Time</th>
                <th>App</th>
                <th>Model</th>
                <th>Category</th>
                <th>Complexity</th>
                <th className="text-right">In</th>
                <th className="text-right">Out</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const expensive = r.totalCost > med * 1.5;
                const cheap = r.totalCost < med * 0.5;
                const costClass = expensive ? 'text-bad' : cheap ? 'text-good' : '';
                return (
                  <tr key={r.id}>
                    <td className="text-xs text-muted whitespace-nowrap">
                      {formatTime(r.timestamp)}
                    </td>
                    <td className="text-xs">
                      {r.appName ?? <span className="text-muted">unknown</span>}
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap">{r.model}</td>
                    <td>
                      <span className={`chip capitalize ${CATEGORY_CHIP[r.category]}`}>
                        {r.category}
                      </span>
                    </td>
                    <td>
                      <span className={`chip capitalize ${COMPLEXITY_CHIP[r.complexity]}`}>
                        {r.complexity}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{formatNum(r.inputTokens)}</td>
                    <td className="text-right tabular-nums">{formatNum(r.outputTokens)}</td>
                    <td className={`text-right tabular-nums font-semibold ${costClass}`}>
                      {formatUSD(r.totalCost)}
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
