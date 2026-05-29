'use client';
import { useTour } from '@/lib/useTour';

// "Take the tour" trigger. Drop this anywhere — settings page, help menu,
// onboarding card — and clicking it re-launches the guided product tour
// from step 0 via the global `finops:start-tour` custom event. The hook
// handles the dispatch; this component is only the UI surface.
//
// The tooltip is a plain CSS `title` attribute (kept dependency-free).

export function TourButton({ className }: { className?: string } = {}) {
  const { startTour } = useTour();

  return (
    <button
      type="button"
      onClick={startTour}
      title="Restart the guided tour from the beginning"
      aria-label="Restart the guided tour from the beginning"
      className={
        className ??
        'btn inline-flex items-center gap-2 group'
      }
    >
      <span
        className="w-6 h-6 rounded-lg bg-brand-gradient flex items-center justify-center shadow-glow group-hover:scale-110 transition-transform duration-200"
        aria-hidden
      >
        {/* Rocket icon — same stroke style used elsewhere in the app. */}
        <svg
          viewBox="0 0 24 24"
          className="w-3.5 h-3.5 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      </span>
      <span className="font-medium">Take the tour</span>
      <span aria-hidden className="text-muted group-hover:text-brandLight transition-colors">↗</span>
    </button>
  );
}
