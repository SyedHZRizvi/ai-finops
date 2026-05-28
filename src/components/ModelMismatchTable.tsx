import type { Category, Complexity, ModelMismatchRow } from '@/lib/types';

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

export function ModelMismatchTable({ rows }: { rows: ModelMismatchRow[] }) {
  return (
    <div className="card">
      <div className="px-5 py-3 border-b border-border">
        <div className="label">Model mismatch</div>
        <div className="text-xs text-muted mt-0.5">
          Simple or moderate prompts running on a model with a cheaper same-family alternative
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted">
          No model mismatches detected — work is appropriately sized for chosen models.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Current model</th>
                <th>Recommended</th>
                <th>Complexity</th>
                <th>Category</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Current cost</th>
                <th className="text-right">Est. savings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.model}-${r.complexity}-${r.category}-${i}`}>
                  <td className="font-mono text-xs">{r.model}</td>
                  <td className="font-mono text-xs text-good">→ {r.recommendedModel}</td>
                  <td>
                    <span className={`chip border capitalize ${COMPLEXITY_CHIP[r.complexity]}`}>
                      {r.complexity}
                    </span>
                  </td>
                  <td>
                    <span className={`chip border capitalize ${CATEGORY_CHIP[r.category]}`}>
                      {r.category}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatNum(r.calls)}</td>
                  <td className="text-right tabular-nums">{formatUSD(r.totalCost)}</td>
                  <td className="text-right tabular-nums text-good font-medium">
                    −{formatUSD(r.estimatedSavings)}
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
