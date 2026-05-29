// Skeleton primitives — neutral, subtle, never jarring. They use the
// `.shimmer` utility already defined in globals.css, layered on top of
// muted `bg-panel2` blocks so the dark theme stays consistent.

export interface SkeletonTextProps {
  /** Width in tailwind classes, e.g. "w-32", "w-full". Default "w-full". */
  width?: string;
  /** Number of stacked lines. Default 1. */
  lines?: number;
  /** Optional extra classes (e.g. for margin). */
  className?: string;
}

/**
 * Inline shimmer line — good for placeholder text inside an existing card.
 */
export function SkeletonText({ width = 'w-full', lines = 1, className = '' }: SkeletonTextProps) {
  const items = Array.from({ length: Math.max(1, lines) });
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {items.map((_, i) => (
        <div
          key={i}
          className={`shimmer h-3.5 rounded bg-panel2/80 ${
            i === items.length - 1 && items.length > 1 ? 'w-3/4' : width
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Stat-card sized skeleton. Matches `StatsCards` layout — label, big
 * number, sub-line — so the swap to real data is visually settled.
 */
export function SkeletonCard() {
  return (
    <div className="card card-pad relative overflow-hidden" aria-hidden="true">
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-30"
        style={{ background: 'linear-gradient(90deg, transparent, #363b50, transparent)' }}
      />
      <div className="flex items-start justify-between mb-4">
        <div className="shimmer h-3 w-20 rounded bg-panel2/80" />
        <div className="shimmer w-9 h-9 rounded-xl bg-panel2/80" />
      </div>
      <div className="shimmer h-9 w-32 rounded-md bg-panel2/80" />
      <div className="shimmer h-3 w-24 rounded bg-panel2/60 mt-3" />
    </div>
  );
}

export interface SkeletonChartProps {
  /** Compact = narrower height for sidebar slots. Default false. */
  compact?: boolean;
}

/**
 * Chart-area skeleton. A header strip (label + sub) plus a roomy
 * placeholder for the chart body. Compact mode (sidebar) trims height.
 */
export function SkeletonChart({ compact = false }: SkeletonChartProps) {
  return (
    <div className="card" aria-hidden="true">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="space-y-2">
          <div className="shimmer h-3 w-24 rounded bg-panel2/80" />
          <div className="shimmer h-3 w-40 rounded bg-panel2/60" />
        </div>
        <div className="shimmer w-9 h-9 rounded-xl bg-panel2/80" />
      </div>
      <div className={`p-6 ${compact ? 'h-48' : 'h-72'} relative overflow-hidden`}>
        {/* Subtle gridlines for chart feel */}
        <div className="absolute inset-x-6 inset-y-6 flex flex-col justify-between pointer-events-none">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-px bg-border/50" />
          ))}
        </div>
        <div className="shimmer h-full w-full rounded-lg bg-panel2/40" />
      </div>
    </div>
  );
}
