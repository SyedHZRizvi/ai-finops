import type { RedundancyCluster } from '@/lib/types';

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n).trimEnd()}…`;
}

export function RedundancyClusters({ clusters }: { clusters: RedundancyCluster[] }) {
  return (
    <div className="card fade-up-delay-3">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="label">Redundancy clusters</div>
          <div className="text-xs text-muted mt-1">
            Repeated prompts (3+ calls) where caching the prefix would save ~80% on the input side
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-teal/15 border border-teal/30 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-teal" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        </div>
      </div>
      {clusters.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">
          No repeated prompts detected — every call looks unique.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Sample prompt</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Total cost</th>
                <th className="text-right">Avg input tokens</th>
                <th className="text-right">Est. caching savings</th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((c) => (
                <tr key={c.fingerprint}>
                  <td className="max-w-md">
                    <div className="text-xs text-ink truncate" title={c.samplePrompt}>
                      {truncate(c.samplePrompt.replace(/\s+/g, ' ').trim(), 80)}
                    </div>
                    <div className="text-[10px] text-muted font-mono mt-1">
                      fingerprint: {c.fingerprint.slice(0, 40)}
                    </div>
                  </td>
                  <td className="text-right tabular-nums font-semibold">{formatNum(c.calls)}</td>
                  <td className="text-right tabular-nums">{formatUSD(c.totalCost)}</td>
                  <td className="text-right tabular-nums">{formatNum(c.avgInputTokens)}</td>
                  <td className="text-right tabular-nums text-good font-semibold">
                    −{formatUSD(c.estimatedCachingSavings)}
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
