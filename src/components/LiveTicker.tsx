'use client';

// Horizontally scrolling strip of the latest 10 FinOps events. Lives on the
// Dashboard. Visually communicates that the system is alive even when no
// new events have arrived in a while (pulsing dot + "Waiting for activity"
// empty state).
//
// Layout: a thin 64px-high card. Pulsing live-dot + label on the left,
// "N recent" counter on the right, scrolling item row in the middle.
//
// Animation strategy:
//   * Each new event mounts an item at the LEFT with the existing
//     `.fade-up` keyframe (defined in globals.css). Older items naturally
//     slide rightward as flex re-layouts the row — no JS animation needed.
//   * The middle column scrolls horizontally when overflow exceeds the
//     window (browser-native overflow-x-auto). On a typical Dashboard view
//     10 items fit; long titles trigger the truncate.
//   * Empty state: a pulsing muted dot + "Waiting for activity..." so the
//     card never looks broken or stuck.
//
// All animations are pure CSS using existing globals.css utilities.

import { useMemo } from 'react';
import { useStream } from '@/lib/useStream';
import type {
  AnomalyDetectedPayload,
  FinOpsEvent,
  PromptLoggedPayload,
} from '@/lib/eventBus';

const MAX_VISIBLE = 10;

interface TickerItem {
  id: string;
  kind: FinOpsEvent['kind'];
  timestamp: number;
  title: string;
  detail: string;
  chipClass: string;
  icon: JSX.Element;
}

function PromptIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function AnomalyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function BudgetIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function isPromptLoggedPayload(value: unknown): value is PromptLoggedPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.promptLogId === 'string' &&
    typeof v.model === 'string' &&
    typeof v.category === 'string'
  );
}

function isAnomalyDetectedPayload(value: unknown): value is AnomalyDetectedPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.anomalyId === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.severity === 'string' &&
    typeof v.title === 'string'
  );
}

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRelative(timestamp: number): string {
  const ageMs = Date.now() - timestamp;
  if (ageMs < 5_000) return 'just now';
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s ago`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function buildItem(event: FinOpsEvent, idx: number): TickerItem {
  const baseId = `${event.timestamp}-${event.kind}-${idx}`;
  switch (event.kind) {
    case 'prompt-logged': {
      if (isPromptLoggedPayload(event.data)) {
        const p = event.data;
        const appPart = p.appName ? `${p.appName} - ` : '';
        return {
          id: `${baseId}-${p.promptLogId}`,
          kind: event.kind,
          timestamp: event.timestamp,
          title: `${appPart}${p.model}`,
          detail: `${formatUSD(p.totalCost)} - ${p.category}`,
          chipClass: 'chip-brand',
          icon: <PromptIcon />,
        };
      }
      return {
        id: baseId,
        kind: event.kind,
        timestamp: event.timestamp,
        title: 'Prompt logged',
        detail: '',
        chipClass: 'chip-brand',
        icon: <PromptIcon />,
      };
    }
    case 'anomaly-detected': {
      if (isAnomalyDetectedPayload(event.data)) {
        const a = event.data;
        const severityClass =
          a.severity === 'critical' ? 'chip-bad' : a.severity === 'high' ? 'chip-warn' : 'chip-amber';
        return {
          id: `${baseId}-${a.anomalyId}`,
          kind: event.kind,
          timestamp: event.timestamp,
          title: a.title,
          detail: `${a.severity} - ${a.kind}`,
          chipClass: severityClass,
          icon: <AnomalyIcon />,
        };
      }
      return {
        id: baseId,
        kind: event.kind,
        timestamp: event.timestamp,
        title: 'Anomaly detected',
        detail: '',
        chipClass: 'chip-bad',
        icon: <AnomalyIcon />,
      };
    }
    case 'import-completed': {
      return {
        id: baseId,
        kind: event.kind,
        timestamp: event.timestamp,
        title: 'Import completed',
        detail: '',
        chipClass: 'chip-good',
        icon: <ImportIcon />,
      };
    }
    case 'budget-alert': {
      return {
        id: baseId,
        kind: event.kind,
        timestamp: event.timestamp,
        title: 'Budget alert',
        detail: '',
        chipClass: 'chip-warn',
        icon: <BudgetIcon />,
      };
    }
    default: {
      // Exhaustiveness sentinel — if a new FinOpsEventKind is added without
      // a case here, TypeScript will flag it.
      const _exhaustive: never = event.kind;
      return {
        id: baseId,
        kind: event.kind,
        timestamp: event.timestamp,
        title: _exhaustive,
        detail: '',
        chipClass: 'chip',
        icon: <PromptIcon />,
      };
    }
  }
}

interface LiveTickerProps {
  /** Override the strip's title. Defaults to "Live activity". */
  title?: string;
}

export function LiveTicker({ title = 'Live activity' }: LiveTickerProps) {
  const events = useStream();

  const items: TickerItem[] = useMemo(() => {
    const sliced = events.slice(0, MAX_VISIBLE);
    return sliced.map((e, i) => buildItem(e, i));
  }, [events]);

  const isEmpty = items.length === 0;

  return (
    <div
      className="card fade-up flex items-center gap-4 w-full"
      style={{ height: '64px', paddingLeft: '1.25rem', paddingRight: '1.25rem' }}
    >
      <div className="label flex items-center gap-2 shrink-0">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-good pulse-glow"
          aria-hidden
        />
        {title}
      </div>
      <div className="h-6 w-px bg-border shrink-0" aria-hidden />
      <div
        className="relative flex-1 min-w-0 overflow-hidden"
        aria-live="polite"
      >
        {isEmpty ? (
          <div className="absolute inset-0 flex items-center text-xs text-muted">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-muted/60 pulse-glow" aria-hidden />
              Waiting for activity...
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 h-full overflow-x-auto">
            {items.map((it) => (
              <div
                key={it.id}
                className="fade-up flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-full border border-border bg-panel2/60 text-xs"
                title={`${it.title} - ${formatRelative(it.timestamp)}`}
              >
                <span className={`chip ${it.chipClass} !py-0.5 !px-1.5`}>
                  {it.icon}
                </span>
                <span className="font-medium text-ink whitespace-nowrap max-w-[220px] truncate">
                  {it.title}
                </span>
                {it.detail && (
                  <span className="text-muted whitespace-nowrap">{it.detail}</span>
                )}
                <span className="text-muted/70 whitespace-nowrap text-[10px]">
                  {formatRelative(it.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <span className="text-[10px] text-muted shrink-0 tabular-nums">{items.length} recent</span>
    </div>
  );
}
