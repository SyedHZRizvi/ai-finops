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
          className="absolute bottom-full right-0 mb-2 z-30 min-w-[260px] max-w-[320px] p-3 rounded-xl border border-border bg-panel2 shadow-card text-left normal-case"
        >
          <span className="flex items-center justify-between gap-3 pb-2 mb-2 border-b border-border">
            <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
              System status
            </span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.text}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden />
              {meta.label}
            </span>
          </span>
          <span className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <span className="text-muted">Database</span>
            <span className="text-inkDim text-right">
              {data.database.reachable
                ? `Reachable · ${data.database.latencyMs}ms`
                : 'Unreachable'}
            </span>
            <span className="text-muted">Last log</span>
            <span className="text-inkDim text-right">{formatAge(data.lastLog.ageSeconds)}</span>
            <span className="text-muted">Last import</span>
            <span className="text-inkDim text-right">
              {data.lastImport.timestamp
                ? `${data.lastImport.provider ?? '—'} · ${formatAge(data.lastImport.ageSeconds)}`
                : 'Never'}
            </span>
            <span className="text-muted">Version</span>
            <span className="text-inkDim text-right font-mono">{data.version}</span>
            <span className="text-muted">Environment</span>
            <span className="text-inkDim text-right">{data.env}</span>
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * Format a "seconds ago" age into something a person reads at a glance.
 * `null` → "Never" (no row yet); otherwise rounds to the largest sensible unit.
 */
function formatAge(seconds: number | null): string {
  if (seconds === null) return 'Never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
