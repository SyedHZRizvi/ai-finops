'use client';

import { useEffect, useState } from 'react';

interface AnomalyResponse {
  items: { id: string }[];
  total?: number;
}

const POLL_INTERVAL_MS = 60_000;

export function AnomalyBadge() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function load() {
      try {
        const r = await fetch('/api/anomaly?severity=critical&unresolved=true', {
          cache: 'no-store',
        });
        if (!r.ok || cancelled) return;
        const json = (await r.json()) as AnomalyResponse;
        if (cancelled) return;
        const n = Array.isArray(json.items) ? json.items.length : 0;
        setCount(n);
      } catch {
        // Best-effort — a transient network hiccup must not crash the nav.
      }
    }

    function schedule() {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        await load();
        if (!cancelled) schedule();
      }, POLL_INTERVAL_MS);
    }

    load();
    schedule();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);

  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-bad text-white text-[10px] font-bold leading-none px-1.5 py-0.5 min-w-[18px] h-[18px] shadow-[0_0_12px_-2px_rgba(239,68,68,0.7)]"
      title={`${count} unresolved critical anomal${count === 1 ? 'y' : 'ies'}`}
      aria-label={`${count} unresolved critical anomalies`}
    >
      {label}
    </span>
  );
}
