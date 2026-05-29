'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AutoRefreshProps {
  intervalSeconds?: number;
}

export function AutoRefresh({ intervalSeconds = 60 }: AutoRefreshProps) {
  const router = useRouter();
  // Track whether the page is currently visible. We pause the timer
  // when the tab is backgrounded — a hidden dashboard does not need to
  // be refreshed every minute, especially when the request pulls a few
  // expensive queries.
  const [visible, setVisible] = useState<boolean>(true);

  useEffect(() => {
    // Initialize visibility on mount (SSR-safe: this is a client component).
    setVisible(document.visibilityState === 'visible');

    function onVisibility() {
      setVisible(document.visibilityState === 'visible');
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const ms = Math.max(5, intervalSeconds) * 1000;
    const id = window.setInterval(() => {
      // Re-check visibility right before firing — a tab can become hidden
      // between ticks, and we don't want a stale interval to refresh anyway.
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    }, ms);
    return () => {
      window.clearInterval(id);
    };
  }, [router, intervalSeconds, visible]);

  // Subtle indicator. Kept dim so it doesn't compete with real content,
  // but visible enough that users can tell auto-refresh is on.
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-muted/70"
      aria-live="polite"
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          visible ? 'bg-good animate-pulse' : 'bg-muted'
        }`}
        aria-hidden="true"
      />
      <span>
        {visible ? `Auto-refresh: ${intervalSeconds}s` : 'Paused (tab hidden)'}
      </span>
    </span>
  );
}
