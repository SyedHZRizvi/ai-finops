import type { Category, Complexity, OutputBloatRow } from '@/lib/types';

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

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n).trimEnd()}…`;
}

export function OutputBloatTable({ rows }: { rows: OutputBloatRow[] }) {
  return (
    <div className="card">
      <div className="px-5 py-3 border-b border-border">
        <div className="label">Output bloat</div>
        <div className="text-xs text-muted mt-0.5">
          Simple/moderate prompts whose answers are at least 3x longer than the question
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted">
          No verbose answers detected on short prompts.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Model</th>
                <th>Category</th>
                <th>Complexity</th>
                <th className="text-right">In / Out (ratio)</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Est. cap savings</th>
                <th>Prompt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
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
                  <td className="text-right tabular-nums whitespace-nowrap">
                    {formatNum(r.inputTokens)} / {formatNum(r.outputTokens)}{' '}
                    <span className="text-warn">({r.ratio.toFixed(1)}x)</span>
                  </td>
                  <td className="text-right tabular-nums">{formatUSD(r.totalCost)}</td>
                  <td className="text-right tabular-nums text-good font-medium">
                    −{formatUSD(r.estimatedCapSavings)}
                  </td>
                  <td className="max-w-xs">
                    <div className="text-xs text-muted truncate" title={r.promptPreview}>
                      {truncate(r.promptPreview.replace(/\s+/g, ' ').trim(), 80)}
                    </div>
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
