import type { InsightsResponse, RootCause } from '@/lib/types';

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

const SEVERITY_BORDER: Record<RootCause['severity'], string> = {
  high: 'border-l-bad',
  medium: 'border-l-warn',
  low: 'border-l-muted',
};

const SEVERITY_LABEL: Record<RootCause['severity'], string> = {
  high: 'text-bad',
  medium: 'text-warn',
  low: 'text-muted',
};

export function InsightsSummary({ data }: { data: InsightsResponse }) {
  const { totals, projectedSavings, rootCauses } = data;
  const topCauses = rootCauses.slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="card card-pad border-good/40 bg-good/5">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="label text-good/90">Projected savings if all actions applied</div>
            <div className="mt-1 flex items-baseline gap-3">
              <div className="text-4xl font-semibold tabular-nums text-good">
                {formatUSD(projectedSavings.monthly)}
                <span className="text-base text-muted font-normal">/mo</span>
              </div>
            </div>
            <div className="text-sm text-muted mt-1 tabular-nums">
              <span className="text-good">{formatUSD(projectedSavings.annual)}/yr</span>
              {' · '}
              <span className="text-good">{projectedSavings.percentReduction.toFixed(1)}%</span>{' '}
              reduction vs current burn
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 md:w-1/2">
            <div className="card card-pad">
              <div className="label">Total calls</div>
              <div className="stat-num mt-1">{formatNum(totals.calls)}</div>
            </div>
            <div className="card card-pad">
              <div className="label">Total cost</div>
              <div className="stat-num mt-1">{formatUSD(totals.cost)}</div>
            </div>
            <div className="card card-pad">
              <div className="label">Avg / call</div>
              <div className="stat-num mt-1">{formatUSD(totals.avgCostPerCall)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="label">Why your AI cost is what it is</div>
        <div className="text-xs text-muted mt-0.5 mb-3">
          Top {topCauses.length} root cause{topCauses.length === 1 ? '' : 's'} of spend in this period
        </div>
        {topCauses.length === 0 ? (
          <div className="text-sm text-muted py-6 text-center">
            No clear root causes detected — spending looks balanced.
          </div>
        ) : (
          <ul className="space-y-3">
            {topCauses.map((c) => (
              <li
                key={c.kind}
                className={`border-l-4 ${SEVERITY_BORDER[c.severity]} bg-panel2 rounded-md px-4 py-3`}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <div className="font-medium text-sm">{c.title}</div>
                  <div className={`text-xs uppercase tracking-wide ${SEVERITY_LABEL[c.severity]}`}>
                    {c.severity}
                  </div>
                </div>
                <div className="text-xs text-muted mt-1">{c.description}</div>
                {c.estimatedAnnualWaste > 0 && (
                  <div className="text-xs text-muted mt-1 tabular-nums">
                    Estimated annual waste:{' '}
                    <span className="text-bad">{formatUSD(c.estimatedAnnualWaste)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
