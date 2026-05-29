'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface DemoStatus {
  active: boolean;
  demoRowCount: number;
  realRowCount: number;
}

const POLL_INTERVAL_MS = 30_000;
const CLOSED_KEY = 'finops:demo-banner-closed';

function isClosed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(CLOSED_KEY) === '1';
  } catch {
    return false;
  }
}

function setClosed(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CLOSED_KEY, '1');
  } catch {
    // sessionStorage can be unavailable in sandboxed contexts — silently ignore.
  }
}

export function DemoBanner() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [closed, setClosedState] = useState<boolean>(false);

  // Initialize closed-state from sessionStorage once on the client. Doing
  // this in useEffect (rather than initial state) avoids hydration mismatch.
  useEffect(() => {
    setClosedState(isClosed());
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/demo', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as DemoStatus;
      setStatus(json);
    } catch {
      // Network/route failures shouldn't surface a banner — silently skip.
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const id = setInterval(() => {
      void fetchStatus();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const shouldShow =
    !closed &&
    status !== null &&
    status.demoRowCount > 0 &&
    status.realRowCount === 0;

  if (!shouldShow) return null;

  return (
    <div
      role="status"
      className="sticky top-16 z-10 border-b border-brand/30 bg-brand/10 backdrop-blur-xl"
    >
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs min-w-0">
          <span className="chip chip-brand shrink-0">Demo mode</span>
          <span className="text-inkDim truncate">
            This dashboard is showing demo data —{' '}
            <Link
              href="/import"
              className="text-brandLight underline underline-offset-2 hover:text-ink"
            >
              connect a provider in /import
            </Link>{' '}
            to see your real numbers.
          </span>
        </div>
        <button
          type="button"
          aria-label="Dismiss demo banner"
          className="btn-ghost shrink-0 px-2 py-1 text-base leading-none"
          onClick={() => {
            setClosed();
            setClosedState(true);
          }}
        >
          <span aria-hidden>×</span>
        </button>
      </div>
    </div>
  );
}
