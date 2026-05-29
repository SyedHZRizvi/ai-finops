import type { Recommendation } from '@/lib/types';
import type { SnapshotDiff } from '@/lib/snapshots';

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1 && abs > 0) return `${n < 0 ? '-' : ''}$${abs.toFixed(4)}`;
  return `${n < 0 ? '-' : ''}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPercent(n: number, signed = true): string {
  if (!Number.isFinite(n)) return '0%';
  const abs = Math.abs(n);
  const prefix = signed ? (n < 0 ? '−' : n > 0 ? '+' : '') : '';
  return `${prefix}${abs.toFixed(1)}%`;
}

const VERDICT_CHIP: Record<SnapshotDiff['overall'], string> = {
  improved: 'chip-good',
  regressed: 'chip-bad',
  similar: 'chip-blue',
};

const VERDICT_LABEL: Record<SnapshotDiff['overall'], string> = {
  improved: 'Improved',
  regressed: 'Regressed',
  similar: 'Similar',
};

const VERDICT_BLURB: Record<SnapshotDiff['overall'], string> = {
  improved: 'Costs are down or optimization opportunities have shrunk.',
  regressed: 'Costs are up or new optimization opportunities have appeared.',
  similar: 'No meaningful change between these two snapshots.',
};

const PERIOD_CHIP: Record<'24h' | '7d' | '30d' | 'all', string> = {
  '24h': 'chip-amber',
  '7d': 'chip-teal',
  '30d': 'chip-brand',
  all: 'chip-indigo',
};

/**
 * Direction-aware delta cell: down = green (savings), up = red (cost up).
 * Pass `invert` for metrics where up is good (e.g. projected savings).
 */
function DeltaPill({
  value,
  percent,
  invert = false,
  format = 'usd',
}: {
  value: number;
  percent?: number;
  invert?: boolean;
  format?: 'usd' | 'num';
}) {
  const isUp = value > 0;
  const isDown = value < 0;
  // A "good" direction is down for cost (default), up for savings (invert).
  const isGood = invert ? isUp : isDown;
  const isBad = invert ? isDown : isUp;
  const color = isGood ? 'text-good' : isBad ? 'text-bad' : 'text-muted';
  const arrow = isUp ? '↑' : isDown ? '↓' : '·';
  const formatted = format === 'usd' ? formatUSD(value) : formatNum(value);
  const absFormatted = formatted.replace(/^-/, '');
  const prefix = value > 0 ? '+' : value < 0 ? '−' : '';

  return (
    <div className={`inline-flex items-baseline gap-2 ${color} tabular-nums font-semibold`}>
      <span aria-hidden className="text-base">{arrow}</span>
      <span>
        {prefix}
        {absFormatted}
      </span>
      {typeof percent === 'number' && Number.isFinite(percent) && (
        <span className="text-xs opacity-80">({formatPercent(percent)})</span>
      )}
    </div>
  );
}

function SnapshotChip({ label, period, role }: { label: string; period: '24h' | '7d' | '30d' | 'all'; role: 'A' | 'B' }) {
  return (
    <div className="inline-flex items-center gap-2 bg-panel2 border border-border rounded-xl px-3 py-2">
      <span
        className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
          role === 'A' ? 'bg-panel3 text-inkDim' : 'bg-brand-gradient text-white'
        }`}
      >
        {role}
      </span>
      <span className="text-sm font-semibold text-ink truncate max-w-[200px]">{label}</span>
      <span className={`chip ${PERIOD_CHIP[period]} capitalize text-[10px]`}>{period}</span>
    </div>
  );
}

const REC_CATEGORY_CHIP: Record<Recommendation['category'], string> = {
  'model-routing': 'chip-brand',
  'prompt-rewrite': 'chip-teal',
  caching: 'chip-good',
  'output-cap': 'chip-warn',
  consolidation: 'chip-indigo',
  governance: 'chip-pink',
};

function RecRow({ rec, sigil }: { rec: Recommendation; sigil?: 'new' | 'resolved' }) {
  return (
    <div className="border border-border rounded-xl p-4 bg-panel2/50 hover:bg-panel2 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {sigil === 'new' && (
              <span className="chip chip-warn text-[10px] uppercase tracking-wider">
                New
              </span>
            )}
            {sigil === 'resolved' && (
              <span className="chip chip-good text-[10px] uppercase tracking-wider">
                Resolved
              </span>
            )}
            <span className={`chip capitalize text-[10px] ${REC_CATEGORY_CHIP[rec.category]}`}>
              {rec.category.replace('-', ' ')}
            </span>
          </div>
          <div className="font-semibold text-sm">{rec.title}</div>
          <div className="text-xs text-inkDim mt-1 leading-relaxed">{rec.rationale}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="label">
            {sigil === 'resolved' ? 'Was worth' : 'Est. savings'}
          </div>
          <div className="text-lg font-bold tabular-nums gradient-text-good">
            {formatUSD(rec.estimatedMonthlySavings)}
          </div>
          <div className="text-xs text-muted">/mo</div>
        </div>
      </div>
    </div>
  );
}

function StableRecRow({
  a,
  b,
  delta,
}: {
  a: Recommendation;
  b: Recommendation;
  delta: number;
}) {
  // For stable recs, "improvement" means the savings opportunity shrank
  // (delta < 0). A shrinking estimated-savings figure means the underlying
  // waste pattern is also shrinking, which is good.
  const meaningful = Math.abs(delta) > 0.001;
  return (
    <div className="border border-border rounded-xl p-4 bg-panel2/30">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={`chip capitalize text-[10px] ${REC_CATEGORY_CHIP[b.category]}`}>
              {b.category.replace('-', ' ')}
            </span>
            <span className="chip text-[10px]">Still open</span>
          </div>
          <div className="font-semibold text-sm">{b.title}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-muted tabular-nums">
            {formatUSD(a.estimatedMonthlySavings)} →{' '}
            <span className="font-semibold text-ink">
              {formatUSD(b.estimatedMonthlySavings)}/mo
            </span>
          </div>
          {meaningful ? (
            <div className="mt-1">
              <DeltaPill value={delta} invert={false} format="usd" />
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted">No change</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SnapshotDiffView({ diff }: { diff: SnapshotDiff }) {
  const { a, b, totals, projectedSavings, recommendationsByCategory } = diff;

  return (
    <div className="space-y-5">
      {/* Hero row */}
      <div className="hero fade-up">
        <div className="relative">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 flex-wrap">
            <div>
              <div className="flex items-center gap-3 flex-wrap mb-4">
                <SnapshotChip label={a.label} period={a.period} role="A" />
                <span className="text-muted text-xl" aria-hidden>→</span>
                <SnapshotChip label={b.label} period={b.period} role="B" />
              </div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className={`chip ${VERDICT_CHIP[diff.overall]} text-sm font-bold capitalize`}>
                  {VERDICT_LABEL[diff.overall]}
                </span>
                <span className="text-sm text-inkDim">{VERDICT_BLURB[diff.overall]}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-right">
              <div>
                <div className="label">A captured</div>
                <div className="text-xs text-inkDim mt-1 tabular-nums">
                  {formatDateTime(a.capturedAt)}
                </div>
              </div>
              <div>
                <div className="label">B captured</div>
                <div className="text-xs text-inkDim mt-1 tabular-nums">
                  {formatDateTime(b.capturedAt)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3-card row of headline deltas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card card-pad fade-up-delay-1">
          <div className="flex items-center justify-between">
            <div className="label">Total cost</div>
            <span className={`chip text-[10px] ${PERIOD_CHIP[b.period]} capitalize`}>{b.period}</span>
          </div>
          <div className="mt-3 text-xs text-muted tabular-nums">
            {formatUSD(totals.a.cost)} → {formatUSD(totals.b.cost)}
          </div>
          <div className="mt-2">
            <DeltaPill value={totals.deltaCost} percent={totals.deltaCostPercent} />
          </div>
        </div>

        <div className="card card-pad fade-up-delay-2">
          <div className="flex items-center justify-between">
            <div className="label">Total calls</div>
            <div className="text-xs text-muted">volume</div>
          </div>
          <div className="mt-3 text-xs text-muted tabular-nums">
            {formatNum(totals.a.calls)} → {formatNum(totals.b.calls)}
          </div>
          <div className="mt-2">
            <DeltaPill
              value={totals.deltaCalls}
              percent={totals.deltaCallsPercent}
              format="num"
            />
          </div>
        </div>

        <div className="card card-pad fade-up-delay-3">
          <div className="flex items-center justify-between">
            <div className="label">Projected savings</div>
            <div className="text-xs text-muted">/mo if all applied</div>
          </div>
          <div className="mt-3 text-xs text-muted tabular-nums">
            {formatUSD(projectedSavings.a.monthly)} → {formatUSD(projectedSavings.b.monthly)}
          </div>
          <div className="mt-2">
            <DeltaPill value={projectedSavings.deltaMonthly} invert />
          </div>
        </div>
      </div>

      {/* Resolved recommendations — celebrate closures */}
      {diff.resolvedRecommendations.length > 0 && (
        <div className="card card-pad fade-up-delay-1">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-good-gradient flex items-center justify-center shadow-glow-green">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-base">
                  {diff.resolvedRecommendations.length} recommendation
                  {diff.resolvedRecommendations.length === 1 ? '' : 's'} resolved
                </div>
                <div className="text-xs text-muted">
                  In A but no longer in B — these waste patterns are gone.
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="label">Reclaimed</div>
              <div className="text-lg font-bold gradient-text-good tabular-nums">
                {formatUSD(
                  diff.resolvedRecommendations.reduce(
                    (s, r) => s + r.estimatedMonthlySavings,
                    0,
                  ),
                )}
                /mo
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {diff.resolvedRecommendations.map((r) => (
              <RecRow key={`resolved-${r.id}`} rec={r} sigil="resolved" />
            ))}
          </div>
        </div>
      )}

      {/* New recommendations */}
      {diff.newRecommendations.length > 0 && (
        <div className="card card-pad fade-up-delay-2">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-warn/15 border border-warn/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-warn" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
                  <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-base">
                  {diff.newRecommendations.length} new recommendation
                  {diff.newRecommendations.length === 1 ? '' : 's'}
                </div>
                <div className="text-xs text-muted">
                  In B but not in A — investigate before the next reporting cycle.
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="label">Worth</div>
              <div className="text-lg font-bold text-warn tabular-nums">
                {formatUSD(
                  diff.newRecommendations.reduce(
                    (s, r) => s + r.estimatedMonthlySavings,
                    0,
                  ),
                )}
                /mo
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {diff.newRecommendations.map((r) => (
              <RecRow key={`new-${r.id}`} rec={r} sigil="new" />
            ))}
          </div>
        </div>
      )}

      {/* Stable recommendations — same item present in both */}
      {diff.stableRecommendations.length > 0 && (
        <div className="card card-pad fade-up-delay-3">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue/15 border border-blue/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-blue" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <line x1="12" y1="7" x2="12" y2="13" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="0.6" fill="currentColor" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-base">
                  {diff.stableRecommendations.length} unchanged recommendation
                  {diff.stableRecommendations.length === 1 ? '' : 's'}
                </div>
                <div className="text-xs text-muted">
                  Present in both — the savings figure may have shifted.
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {diff.stableRecommendations.map((p) => (
              <StableRecRow
                key={`stable-${p.b.id}`}
                a={p.a}
                b={p.b}
                delta={p.deltaMonthlySavings}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recommendations grouped by category — a quick balance sheet */}
      {recommendationsByCategory.length > 0 && (
        <div className="card fade-up-delay-3">
          <div className="px-6 py-4 border-b border-border">
            <div className="label">Recommendations by category</div>
            <div className="text-xs text-muted mt-1">
              Count and total monthly savings per category in each snapshot
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="text-right">A count</th>
                  <th className="text-right">B count</th>
                  <th className="text-right">A savings/mo</th>
                  <th className="text-right">B savings/mo</th>
                  <th className="text-right">Δ savings/mo</th>
                </tr>
              </thead>
              <tbody>
                {recommendationsByCategory.map((row) => {
                  const delta = row.bSavings - row.aSavings;
                  return (
                    <tr key={row.category}>
                      <td className="capitalize">{row.category.replace('-', ' ')}</td>
                      <td className="text-right tabular-nums">{row.aCount}</td>
                      <td className="text-right tabular-nums">{row.bCount}</td>
                      <td className="text-right tabular-nums text-inkDim">
                        {formatUSD(row.aSavings)}
                      </td>
                      <td className="text-right tabular-nums">{formatUSD(row.bSavings)}</td>
                      <td className="text-right tabular-nums">
                        <DeltaPill value={delta} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state when nothing moved */}
      {diff.resolvedRecommendations.length === 0 &&
        diff.newRecommendations.length === 0 &&
        diff.stableRecommendations.length === 0 && (
          <div className="card card-pad text-center text-sm text-muted py-10">
            Neither snapshot has any recommendations — nothing to compare on
            the action side. The totals above still show how the bill moved.
          </div>
        )}
    </div>
  );
}
