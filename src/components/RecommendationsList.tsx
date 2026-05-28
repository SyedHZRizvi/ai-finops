import type { Recommendation } from '@/lib/types';

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CATEGORY_CHIP: Record<Recommendation['category'], string> = {
  'model-routing': 'chip-brand',
  'prompt-rewrite': 'chip-teal',
  caching: 'chip-good',
  'output-cap': 'chip-warn',
  consolidation: 'chip-indigo',
  governance: 'chip-pink',
};

const CONFIDENCE_CHIP: Record<Recommendation['confidence'], string> = {
  high: 'chip-good',
  medium: 'chip-warn',
  low: 'chip',
};

function CategoryIcon({ category }: { category: Recommendation['category'] }) {
  switch (category) {
    case 'model-routing':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <polyline points="16 3 21 3 21 8" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="4" y1="20" x2="21" y2="3" strokeLinecap="round" />
          <polyline points="21 16 21 21 16 21" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="15" y1="15" x2="21" y2="21" strokeLinecap="round" />
          <line x1="4" y1="4" x2="9" y2="9" strokeLinecap="round" />
        </svg>
      );
    case 'prompt-rewrite':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'caching':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      );
    case 'output-cap':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
          <polyline points="12 5 19 12 12 19" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'consolidation':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'governance':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function RecCard({ rec, index }: { rec: Recommendation; index: number }) {
  const delayClass =
    index === 0 ? 'fade-up' : index === 1 ? 'fade-up-delay-1' : index === 2 ? 'fade-up-delay-2' : 'fade-up-delay-3';
  return (
    <div className={`card card-pad card-grad ${delayClass}`}>
      <div className="flex flex-col md:flex-row gap-5 md:items-start">
        <div className="md:w-44 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-good-gradient flex items-center justify-center shadow-glow-green">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="label text-good">Est. savings</div>
          </div>
          <div className="text-3xl font-bold tabular-nums gradient-text-good">
            {formatUSD(rec.estimatedMonthlySavings)}
          </div>
          <div className="text-xs text-muted font-medium">per month</div>
          <div className="text-xs text-inkDim tabular-nums mt-1">
            {formatUSD(rec.estimatedAnnualSavings)}/yr
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{rec.title}</div>
          <div className="text-xs text-inkDim mt-1.5 leading-relaxed">{rec.rationale}</div>
          <div className="mt-3 text-xs bg-panel2 border border-border rounded-xl px-3 py-2.5">
            <span className="text-muted font-medium">Action: </span>
            <span className="text-ink">{rec.action}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="chip">
              {rec.affectedCalls} call{rec.affectedCalls === 1 ? '' : 's'} affected
            </span>
            <span className={`chip capitalize ${CATEGORY_CHIP[rec.category]}`}>
              <span className="inline-flex items-center"><CategoryIcon category={rec.category} /></span>
              {rec.category.replace('-', ' ')}
            </span>
            <span className={`chip capitalize ${CONFIDENCE_CHIP[rec.confidence]}`}>
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
        <h2 className="text-xl font-bold tracking-tight">Recommendations</h2>
        <div className="text-xs text-muted">Ranked by dollar impact per month</div>
      </div>

      <div className="space-y-3">
        {expanded.map((r, i) => (
          <RecCard key={r.id} rec={r} index={i} />
        ))}
      </div>

      {collapsed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-brandLight hover:text-brand2Light list-none transition-colors duration-150 inline-flex items-center gap-1">
            <span className="group-open:hidden">Show {collapsed.length} more →</span>
            <span className="hidden group-open:inline">Show fewer ↑</span>
          </summary>
          <div className="space-y-3 mt-3">
            {collapsed.map((r, i) => (
              <RecCard key={r.id} rec={r} index={i + 5} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
