import type { ModelLatency } from '@/lib/qualityMetrics';

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${formatNum(Math.round(ms))} ms`;
}

// Color buckets used by every latency cell. Tuned so:
//   - green   <   500 ms (snappy: Haiku-class, gpt-4o-mini, etc.)
//   - amber   500–2000 ms (typical Sonnet / 4o reasoning calls)
//   - red     >  2000 ms (Opus, long-form, or degraded providers)
// Returns the chip-variant utility name from globals.css.
function latencyChip(ms: number): string {
  if (ms < 500) return 'chip chip-good';
  if (ms <= 2000) return 'chip chip-warn';
  return 'chip chip-bad';
}

export function LatencyTable({ rows }: { rows: ModelLatency[] }) {
  // Defensive copy + sort so the caller doesn't need to. p95 desc surfaces
  // the slowest tail latencies first, which is what engineers want to act on.
  const sorted = [...rows].sort((a, b) => b.p95 - a.p95);

  return (
    <div className="card fade-up-delay-1">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="label">Latency by model</div>
          <div className="text-xs text-muted mt-1">
            p50 / p95 / p99 — sorted by slowest tail
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-teal/15 border border-teal/30 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 text-teal"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <polyline
              points="12 6 12 12 16 14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">
          No latency data for this period.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Model</th>
                <th className="text-right">Calls</th>
                <th className="text-right">p50</th>
                <th className="text-right">p95</th>
                <th className="text-right">p99</th>
                <th className="text-right">Mean</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.model}>
                  <td className="font-mono text-xs whitespace-nowrap">{r.model}</td>
                  <td className="text-right tabular-nums text-inkDim">
                    {formatNum(r.n)}
                  </td>
                  <td className="text-right tabular-nums">
                    <span className={latencyChip(r.p50)}>{formatMs(r.p50)}</span>
                  </td>
                  <td className="text-right tabular-nums">
                    <span className={latencyChip(r.p95)}>{formatMs(r.p95)}</span>
                  </td>
                  <td className="text-right tabular-nums">
                    <span className={latencyChip(r.p99)}>{formatMs(r.p99)}</span>
                  </td>
                  <td className="text-right tabular-nums text-muted">
                    {formatMs(r.mean)}
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
