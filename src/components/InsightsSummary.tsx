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
  high: 'chip-bad',
  medium: 'chip-warn',
  low: 'chip',
};

export function InsightsSummary({ data }: { data: InsightsResponse }) {
  const { totals, projectedSavings, rootCauses } = data;
  const topCauses = rootCauses.slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="hero fade-up">
        <div
          className="absolute -bottom-24 -left-16 w-80 h-80 rounded-full opacity-20 blur-3xl pointer-events-none drift"
          style={{ background: 'radial-gradient(circle, #22c55e 0%, transparent 70%)' }}
          aria-hidden
        />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="chip chip-good">
                <span className="w-1.5 h-1.5 rounded-full bg-good pulse-glow" />
                Projected savings if all actions applied
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <div className="stat-num-xl gradient-text-good">
                {formatUSD(projectedSavings.monthly)}
              </div>
              <span className="text-base text-inkDim font-medium">/mo</span>
            </div>
            <div className="text-sm text-inkDim mt-3 tabular-nums leading-relaxed">
              <span className="text-good font-semibold">{formatUSD(projectedSavings.annual)}/yr</span>
              {' '}<span className="text-muted">·</span>{' '}
              <span className="text-good font-semibold">
                {projectedSavings.percentReduction.toFixed(1)}%
              </span>{' '}
              reduction vs current burn
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 md:min-w-[28rem]">
            <div className="card card-pad">
              <div className="label">Total calls</div>
              <div className="stat-num-sm mt-2">{formatNum(totals.calls)}</div>
            </div>
            <div className="card card-pad">
              <div className="label">Total cost</div>
              <div className="stat-num-sm mt-2">{formatUSD(totals.cost)}</div>
            </div>
            <div className="card card-pad">
              <div className="label">Avg / call</div>
              <div className="stat-num-sm mt-2">{formatUSD(totals.avgCostPerCall)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-pad fade-up-delay-1">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label">Why your AI cost is what it is</div>
            <div className="text-xs text-muted mt-1">
              Top {topCauses.length} root cause{topCauses.length === 1 ? '' : 's'} of spend in this period
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-warn/15 border border-warn/30 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-warn" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
              <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
            </svg>
          </div>
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
                className={`border-l-4 ${SEVERITY_BORDER[c.severity]} bg-panel2/70 rounded-r-xl px-4 py-3 transition-all duration-150 hover:bg-panel2`}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <div className="font-semibold text-sm">{c.title}</div>
                  <span className={`chip capitalize ${SEVERITY_LABEL[c.severity]}`}>
                    {c.severity}
                  </span>
                </div>
                <div className="text-xs text-inkDim mt-1.5 leading-relaxed">{c.description}</div>
                {c.estimatedAnnualWaste > 0 && (
                  <div className="text-xs text-muted mt-2 tabular-nums">
                    Estimated annual waste:{' '}
                    <span className="text-bad font-semibold">{formatUSD(c.estimatedAnnualWaste)}</span>
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
