import type { ModelMismatchRow } from '@/lib/types';
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

export function ModelMismatchTable({ rows }: { rows: ModelMismatchRow[] }) {
  return (
    <div className="card fade-up-delay-3">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="label">Model mismatch</div>
          <div className="text-xs text-muted mt-1">
            Simple or moderate prompts running on a model with a cheaper same-family alternative
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-warn/15 border border-warn/30 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-warn" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">
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
                  <td className="font-mono text-xs">
                    <span className="text-muted" aria-hidden>→</span>{' '}
                    <span className="text-good font-semibold">{r.recommendedModel}</span>
                  </td>
                  <td>
                    <span className={`chip capitalize ${COMPLEXITY_CHIP[r.complexity]}`}>
                      {r.complexity}
                    </span>
                  </td>
                  <td>
                    <span className={`chip capitalize ${CATEGORY_CHIP[r.category]}`}>
                      {r.category}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatNum(r.calls)}</td>
                  <td className="text-right tabular-nums">{formatUSD(r.totalCost)}</td>
                  <td className="text-right tabular-nums text-good font-semibold">
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
