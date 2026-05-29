import { SkeletonCard, SkeletonChart } from '@/components/Skeleton';

// Root loading UI. Shown during route transitions on the App Router.
// We mirror the dashboard layout (4 stat cards + chart + breakdown row)
// so the transition feels like content arriving in place rather than
// the page disappearing and reappearing.

export default function RootLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Header placeholder — heading + subtitle */}
      <div className="flex items-center justify-between">
        <div className="space-y-2.5">
          <div className="shimmer h-7 w-64 rounded-md bg-panel2/80" />
          <div className="shimmer h-3.5 w-96 max-w-full rounded bg-panel2/60" />
        </div>
        <div className="shimmer h-9 w-32 rounded-xl bg-panel2/70" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Chart + sidebar split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SkeletonChart />
        </div>
        <div>
          <SkeletonChart compact />
        </div>
      </div>

      {/* Breakdown row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    </div>
  );
}
