'use client';
//
// SaveFilterButton — saves the current URL (path + querystring) as a
// named view in localStorage. The button shows a "Saved!" confirmation
// chip briefly so the user gets feedback that the action succeeded.
//
// The prompt() approach is intentional: it's the smallest, most reliable
// UI for "give me a name", works without any modal infrastructure, and
// matches the no-dependencies brief. A future iteration could swap in a
// proper dialog.

import { useState, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { saveFilter } from '@/lib/savedFilters';

interface SaveFilterButtonProps {
  /**
   * Optional className override for layout — useful when callers want to
   * nest the button inside an existing row of controls.
   */
  className?: string;
  /**
   * Optional callback fired after a successful save. Lets the parent
   * trigger a refresh of any sibling SavedFiltersDropdown.
   */
  onSaved?: () => void;
}

export function SaveFilterButton({ className, onSaved }: SaveFilterButtonProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [confirming, setConfirming] = useState(false);

  const onClick = useCallback(() => {
    if (typeof window === 'undefined') return;

    const qs = searchParams.toString();
    // Default name = pathname + a hint that it's filtered, so the prompt is
    // pre-populated with something sensible.
    const suggested = qs.length > 0
      ? `${pathname} (${qs.length > 40 ? `${qs.slice(0, 37)}...` : qs})`
      : pathname;

    const raw = window.prompt('Name this view:', suggested);
    if (raw === null) return; // user cancelled
    const name = raw.trim();
    if (name.length === 0) return; // empty name — silently ignore

    saveFilter({
      name: name.slice(0, 120), // cap so a pathological name doesn't blow up the chip layout
      path: pathname,
      queryString: qs,
    });

    setConfirming(true);
    // Auto-dismiss after a short delay. We don't rely on the React effect
    // cleanup because the timer is harmless to leak (just sets state on
    // an unmounted component, which React tolerates with a warning).
    window.setTimeout(() => setConfirming(false), 1800);

    onSaved?.();
  }, [pathname, searchParams, onSaved]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={className ?? 'btn'}
      aria-label="Save current view"
      title="Save the current path and filters as a named view"
    >
      {confirming ? (
        <>
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 text-good"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-good">Saved!</span>
        </>
      ) : (
        <>
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Save view
        </>
      )}
    </button>
  );
}
