import type { OutputBloatRow } from '@/lib/types';
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

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n).trimEnd()}…`;
}

export function OutputBloatTable({ rows }: { rows: OutputBloatRow[] }) {
  return (
    <div className="card fade-up-delay-3">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="label">Output bloat</div>
          <div className="text-xs text-muted mt-1">
            Simple/moderate prompts whose answers are at least 3x longer than the question
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-amber/15 border border-amber/30 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">
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
                    <span className={`chip capitalize ${CATEGORY_CHIP[r.category]}`}>
                      {r.category}
                    </span>
                  </td>
                  <td>
                    <span className={`chip capitalize ${COMPLEXITY_CHIP[r.complexity]}`}>
                      {r.complexity}
                    </span>
                  </td>
                  <td className="text-right tabular-nums whitespace-nowrap">
                    {formatNum(r.inputTokens)} / {formatNum(r.outputTokens)}{' '}
                    <span className="text-warn font-semibold">({r.ratio.toFixed(1)}x)</span>
                  </td>
                  <td className="text-right tabular-nums">{formatUSD(r.totalCost)}</td>
                  <td className="text-right tabular-nums text-good font-semibold">
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
