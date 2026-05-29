'use client';
import { useEffect, useState } from 'react';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  database: { reachable: boolean; latencyMs: number };
  lastLog: { timestamp: string | null; ageSeconds: number | null };
  lastImport: {
    provider: string | null;
    timestamp: string | null;
    ageSeconds: number | null;
  };
  version: string;
  env: 'development' | 'production';
}

const POLL_MS = 60_000;

const STATUS_META: Record<
  HealthResponse['status'],
  { dot: string; label: string; text: string }
> = {
  ok: { dot: 'bg-good', label: 'Healthy', text: 'text-good' },
  degraded: { dot: 'bg-warn', label: 'Degraded', text: 'text-warn' },
  down: { dot: 'bg-bad', label: 'Down', text: 'text-bad' },
};

export function HealthIndicator() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchOnce() {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!alive) return;
        if (!res.ok) {
          setErrored(true);
          setData(null);
        } else {
          const json = (await res.json()) as HealthResponse;
          setErrored(false);
          setData(json);
        }
      } catch {
        if (!alive) return;
        setErrored(true);
        setData(null);
      } finally {
        if (alive) timer = setTimeout(fetchOnce, POLL_MS);
      }
    }

    fetchOnce();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const status: HealthResponse['status'] = errored ? 'down' : data?.status ?? 'degraded';
  const meta = STATUS_META[status];
  const label = errored ? 'Down' : data ? meta.label : 'Checking...';

  return (
    <span
      className="relative inline-flex items-center gap-2 text-xs cursor-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-label={`System health: ${label}`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${meta.dot} ${
          status === 'ok' ? 'pulse-glow' : ''
        }`}
        aria-hidden
      />
      <span className={meta.text}>{label}</span>
      {open && data && (
        <span
          role="tooltip"
          className="absolute bottom-full right-0 mb-2 z-30 min-w-[260px] max-w-[360px] p-3 rounded-xl border border-border bg-panel2 shadow-card text-left"
        >
          <pre className="text-[10px] leading-snug text-inkDim whitespace-pre-wrap break-all font-mono">
            {JSON.stringify(data, null, 2)}
          </pre>
        </span>
      )}
    </span>
  );
}
