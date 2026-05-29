'use client';

import { useEffect, useState } from 'react';

// Floating "back to top" button. Appears once the user has scrolled
// beyond a threshold and fades back out near the top. Intentionally
// passive — does not require any prop wiring.

const THRESHOLD_PX = 600;

export interface ScrollToTopProps {
  /** Scroll distance (in px) at which the button appears. Default 600. */
  thresholdPx?: number;
}

export function ScrollToTop({ thresholdPx = THRESHOLD_PX }: ScrollToTopProps = {}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > thresholdPx);
    }

    // Set initial state correctly if mounted mid-scroll.
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [thresholdPx]);

  function handleClick() {
    // `behavior: 'smooth'` honors the user's `prefers-reduced-motion`
    // setting via the browser, so we don't need to gate it manually.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Scroll to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-6 right-6 z-30 w-11 h-11 rounded-full border border-borderBright bg-panel2/90 backdrop-blur-md text-inkDim hover:text-ink hover:bg-panel3 hover:border-brand/40 shadow-card transition-all duration-200 flex items-center justify-center ${
        visible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-2 pointer-events-none'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden
      >
        <polyline
          points="18 15 12 9 6 15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
