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

  // Status indicator. Sized + colored to match HealthIndicator and
  // StreamingPulse — same text-xs, same gap-2, same w-2 h-2 dot, same
  // pulse-glow animation, same text-good green when active. font-medium
  // matches the visual weight of the other two indicators in the footer.
  return (
    <span
      className="inline-flex items-center gap-2 text-xs"
      aria-live="polite"
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          visible ? 'bg-good pulse-glow' : 'bg-muted'
        }`}
        aria-hidden="true"
      />
      <span className={visible ? 'text-good font-medium' : 'text-muted'}>
        {visible ? `Auto-refresh: ${intervalSeconds}s` : 'Paused (tab hidden)'}
      </span>
    </span>
  );
}
