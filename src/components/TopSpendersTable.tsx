import type { Category, Complexity, TopSpender } from '@/lib/types';

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

const CATEGORY_CHIP: Record<Category, string> = {
  factual: 'bg-brand2/10 text-brand2 border-brand2/30',
  reasoning: 'bg-brand/10 text-brand border-brand/30',
  creative: 'bg-pink-500/10 text-pink-300 border-pink-400/30',
  code: 'bg-good/10 text-good border-good/30',
  analytical: 'bg-warn/10 text-warn border-warn/30',
  conversational: 'bg-blue-500/10 text-blue-300 border-blue-400/30',
  instructional: 'bg-violet-500/10 text-violet-300 border-violet-400/30',
  other: 'bg-panel2 text-muted border-border',
};

const COMPLEXITY_CHIP: Record<Complexity, string> = {
  simple: 'bg-good/10 text-good border-good/30',
  moderate: 'bg-brand2/10 text-brand2 border-brand2/30',
  complex: 'bg-warn/10 text-warn border-warn/30',
  multidimensional: 'bg-bad/10 text-bad border-bad/30',
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function TopSpendersTable({ rows }: { rows: TopSpender[] }) {
  const med = median(rows.map((r) => r.totalCost));

  return (
    <div className="card">
      <div className="px-5 py-3 border-b border-border">
        <div className="label">Top spenders</div>
        <div className="text-xs text-muted mt-0.5">Top 10 most expensive individual calls</div>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted">No prompts in this period.</div>
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
                    <td className="text-xs">{r.appName ?? <span className="text-muted">unknown</span>}</td>
                    <td className="font-mono text-xs whitespace-nowrap">{r.model}</td>
                    <td>
                      <span className={`chip border capitalize ${CATEGORY_CHIP[r.category]}`}>
                        {r.category}
                      </span>
                    </td>
                    <td>
                      <span className={`chip border capitalize ${COMPLEXITY_CHIP[r.complexity]}`}>
                        {r.complexity}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{formatNum(r.inputTokens)}</td>
                    <td className="text-right tabular-nums">{formatNum(r.outputTokens)}</td>
                    <td className={`text-right tabular-nums font-medium ${costClass}`}>
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
