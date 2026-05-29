'use client';

// Tiny connection-status indicator for the SSE stream.
//
// Colour key:
//   green  = open (server is streaming)
//   amber  = reconnecting (transient — backoff in progress)
//   red    = closed (gave up, or never opened — e.g. SSE blocked)
//
// On hover the indicator shows a tooltip with latency-since-last-event and
// the total event count for the session. The dot itself is meant to live
// next to other footer indicators like HealthIndicator, so it's intentionally
// small and quiet.

import { useState } from 'react';
import { useStreamStatus, type StreamStatus } from '@/lib/useStream';

const STATUS_META: Record<
  StreamStatus,
  { dot: string; label: string; text: string; pulse: boolean }
> = {
  connecting: { dot: 'bg-warn', label: 'Connecting...', text: 'text-warn', pulse: true },
  open: { dot: 'bg-good', label: 'Live', text: 'text-good', pulse: true },
  reconnecting: { dot: 'bg-warn', label: 'Reconnecting...', text: 'text-warn', pulse: true },
  closed: { dot: 'bg-bad', label: 'Offline', text: 'text-bad', pulse: false },
};

function formatLatency(ms: number | null): string {
  if (ms === null) return 'no events yet';
  if (ms < 1_500) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1_000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

interface StreamingPulseProps {
  /** Show the status word next to the dot. Defaults to false (dot only). */
  showLabel?: boolean;
}

export function StreamingPulse({ showLabel = false }: StreamingPulseProps) {
  const snap = useStreamStatus();
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[snap.status];

  return (
    <span
      className="relative inline-flex items-center gap-2 text-xs cursor-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-label={`Stream status: ${meta.label}`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${meta.dot} ${meta.pulse ? 'pulse-glow' : ''}`}
        aria-hidden
      />
      {showLabel && <span className={meta.text}>{meta.label}</span>}
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full right-0 mb-2 z-30 min-w-[180px] p-2.5 rounded-xl border border-border bg-panel2 shadow-card text-left block"
        >
          <span className="flex items-center justify-between gap-3 mb-1">
            <span className="label">Stream</span>
            <span className={`text-[11px] font-semibold ${meta.text}`}>{meta.label}</span>
          </span>
          <span className="text-[11px] text-muted flex items-center justify-between gap-3">
            <span>Last event</span>
            <span className="text-inkDim tabular-nums">{formatLatency(snap.msSinceLastEvent)}</span>
          </span>
          <span className="text-[11px] text-muted flex items-center justify-between gap-3">
            <span>Events seen</span>
            <span className="text-inkDim tabular-nums">{snap.eventCount}</span>
          </span>
        </span>
      )}
    </span>
  );
}
