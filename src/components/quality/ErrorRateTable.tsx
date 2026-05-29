import type { ErrorRate } from '@/lib/qualityMetrics';

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

// Empty-response rate is the proxy for failed responses (outputTokens === 0).
// Color thresholds: green <1%, amber 1–5%, red >5%. These match what most
// SRE teams call "acceptable / investigate / page" for a generative endpoint.
function rateChip(rate: number): string {
  if (rate < 1) return 'chip chip-good';
  if (rate <= 5) return 'chip chip-warn';
  return 'chip chip-bad';
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return '0%';
  if (n === 0) return '0%';
  if (n < 0.01) return '<0.01%';
  return `${n.toFixed(2)}%`;
}

export function ErrorRateTable({ rows }: { rows: ErrorRate[] }) {
  // Sort by empty rate desc so the worst-behaving models float to the top.
  const sorted = [...rows].sort((a, b) => b.emptyRate - a.emptyRate);

  return (
    <div className="card fade-up-delay-3">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="label">Empty response rate</div>
          <div className="text-xs text-muted mt-1">
            Calls that returned 0 output tokens — proxy for failures
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-rose/15 border border-rose/30 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 text-rose"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
            <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">
          No data for this period.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Model</th>
                <th className="text-right">Total Calls</th>
                <th className="text-right">Empty Responses</th>
                <th className="text-right">Empty Rate</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.model}>
                  <td className="font-mono text-xs whitespace-nowrap">{r.model}</td>
                  <td className="text-right tabular-nums text-inkDim">
                    {formatNum(r.totalCalls)}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatNum(r.emptyResponses)}
                  </td>
                  <td className="text-right tabular-nums">
                    <span className={rateChip(r.emptyRate)}>
                      {formatPct(r.emptyRate)}
                    </span>
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
