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
    <div className="card">
      <div className="px-5 py-3 border-b border-border">
        <div className="label">Redundancy clusters</div>
        <div className="text-xs text-muted mt-0.5">
          Repeated prompts (3+ calls) where caching the prefix would save ~80% on the input side
        </div>
      </div>
      {clusters.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted">
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
                    <div className="text-[10px] text-muted font-mono mt-0.5">
                      fingerprint: {c.fingerprint.slice(0, 40)}
                    </div>
                  </td>
                  <td className="text-right tabular-nums">{formatNum(c.calls)}</td>
                  <td className="text-right tabular-nums">{formatUSD(c.totalCost)}</td>
                  <td className="text-right tabular-nums">{formatNum(c.avgInputTokens)}</td>
                  <td className="text-right tabular-nums text-good font-medium">
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
