import type { Recommendation } from '@/lib/types';

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CATEGORY_CHIP: Record<Recommendation['category'], string> = {
  'model-routing': 'bg-brand/10 text-brand border-brand/30',
  'prompt-rewrite': 'bg-brand2/10 text-brand2 border-brand2/30',
  caching: 'bg-good/10 text-good border-good/30',
  'output-cap': 'bg-warn/10 text-warn border-warn/30',
  consolidation: 'bg-violet-500/10 text-violet-300 border-violet-400/30',
  governance: 'bg-pink-500/10 text-pink-300 border-pink-400/30',
};

const CONFIDENCE_CHIP: Record<Recommendation['confidence'], string> = {
  high: 'bg-good/10 text-good border-good/30',
  medium: 'bg-warn/10 text-warn border-warn/30',
  low: 'bg-muted/10 text-muted border-border',
};

function RecCard({ rec }: { rec: Recommendation }) {
  return (
    <div className="card card-pad">
      <div className="flex flex-col md:flex-row gap-4 md:items-start">
        <div className="md:w-40 shrink-0">
          <div className="label">Est. savings</div>
          <div className="text-2xl font-semibold tabular-nums text-good mt-1">
            {formatUSD(rec.estimatedMonthlySavings)}
            <span className="text-xs text-muted font-normal">/mo</span>
          </div>
          <div className="text-xs text-muted tabular-nums">
            {formatUSD(rec.estimatedAnnualSavings)}/yr
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{rec.title}</div>
          <div className="text-xs text-muted mt-1">{rec.rationale}</div>
          <div className="mt-2 text-xs bg-panel2 border border-border rounded-md px-3 py-2">
            <span className="text-muted">Action: </span>
            <span>{rec.action}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="chip text-muted">
              {rec.affectedCalls} call{rec.affectedCalls === 1 ? '' : 's'} affected
            </span>
            <span className={`chip border capitalize ${CATEGORY_CHIP[rec.category]}`}>
              {rec.category.replace('-', ' ')}
            </span>
            <span className={`chip border capitalize ${CONFIDENCE_CHIP[rec.confidence]}`}>
              {rec.confidence} confidence
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecommendationsList({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) {
    return (
      <div className="card card-pad">
        <div className="label">Recommendations</div>
        <div className="text-sm text-muted py-6 text-center">
          No dollar-impact recommendations yet. Once more data is collected, ranked actions will appear here.
        </div>
      </div>
    );
  }

  const expanded = recommendations.slice(0, 5);
  const collapsed = recommendations.slice(5);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Recommendations</h2>
        <div className="text-xs text-muted">Ranked by dollar impact per month</div>
      </div>

      <div className="space-y-3">
        {expanded.map((r) => (
          <RecCard key={r.id} rec={r} />
        ))}
      </div>

      {collapsed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-brand hover:text-brand/80 list-none">
            <span className="group-open:hidden">Show {collapsed.length} more</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <div className="space-y-3 mt-3">
            {collapsed.map((r) => (
              <RecCard key={r.id} rec={r} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
