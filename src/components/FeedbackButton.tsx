'use client';

import { useState } from 'react';
import { FeedbackModal } from './FeedbackModal';

/**
 * Floating "Send feedback" launcher. Anchored to the bottom-right
 * corner of the viewport but offset vertically so it stacks ABOVE the
 * ScrollToTop button (which lives at bottom-6 right-6 with the same
 * width). The two buttons line up neatly along the right edge:
 *
 *   ┌──────────┐
 *   │ Feedback │   ← this button (bottom-20)
 *   └──────────┘
 *      ▲           ← ScrollToTop chevron (bottom-6, appears only on scroll)
 *      ▼
 *
 * Always visible — unlike ScrollToTop it's not gated on scroll position
 * because the friction signal we want is highest exactly when something
 * goes wrong, which can happen on the first viewport.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-20 right-6 z-30 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full border border-borderBright bg-panel2/90 backdrop-blur-md text-inkDim hover:text-ink hover:bg-panel3 hover:border-brand/40 shadow-card transition-all duration-200"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          {/* Speech bubble outline — instantly readable at icon-size. */}
          <path
            d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-xs font-medium hidden sm:inline">Feedback</span>
      </button>

      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}
