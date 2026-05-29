'use client';

// React hook for consuming the /api/stream SSE feed.
//
// Behavior:
//   * Opens an EventSource on mount, closes on unmount.
//   * Accumulates received FinOpsEvents into a state array (newest first),
//     hard-capped at MAX_EVENTS so a long-running tab can't OOM.
//   * Reconnects with exponential backoff (1s, 2s, 4s, ..., capped at 30s)
//     when the connection drops. The browser's EventSource auto-reconnect
//     also exists, but we don't fully trust it across mobile/captive-portal
//     environments — explicit close+reopen is more predictable.
//   * Exposes connection status + last-event-latency for the StreamingPulse
//     component via useStreamStatus().
//
// Filtering: if `kind` is passed, only events of that kind are kept in the
// returned array. The status hook is unaffected — it tracks all connection
// state regardless of filter.

import { useEffect, useState } from 'react';
import type { FinOpsEvent, FinOpsEventKind } from './eventBus';

const MAX_EVENTS = 200;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_CAP_MS = 30_000;
const STREAM_URL = '/api/stream';

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface StreamStatusSnapshot {
  status: StreamStatus;
  /** ms since last event (any kind, including 'connected'). null if never seen. */
  msSinceLastEvent: number | null;
  /** Total events received this session, all kinds. */
  eventCount: number;
}

// Status is hoisted to a module-scope singleton so multiple components can
// share one EventSource. Without this, mounting both LiveTicker and
// StreamingPulse would open two SSE connections — wasteful and confusing
// when the two indicators disagree.
interface SharedConnection {
  source: EventSource | null;
  status: StreamStatus;
  listeners: Set<(e: FinOpsEvent) => void>;
  statusListeners: Set<(s: StreamStatusSnapshot) => void>;
  reconnectAttempt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  lastEventAt: number | null;
  eventCount: number;
  refCount: number;
}

const conn: SharedConnection = {
  source: null,
  status: 'closed',
  listeners: new Set(),
  statusListeners: new Set(),
  reconnectAttempt: 0,
  reconnectTimer: null,
  lastEventAt: null,
  eventCount: 0,
  refCount: 0,
};

function snapshot(): StreamStatusSnapshot {
  return {
    status: conn.status,
    msSinceLastEvent: conn.lastEventAt === null ? null : Date.now() - conn.lastEventAt,
    eventCount: conn.eventCount,
  };
}

function setStatus(s: StreamStatus): void {
  if (conn.status === s) return;
  conn.status = s;
  const snap = snapshot();
  for (const listener of conn.statusListeners) {
    try {
      listener(snap);
    } catch {
      // A throwing listener must not break the others.
    }
  }
}

function dispatchFinOpsEvent(event: FinOpsEvent): void {
  conn.lastEventAt = Date.now();
  conn.eventCount += 1;
  for (const listener of conn.listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors — same rationale as above.
    }
  }
  // Status didn't change but msSinceLastEvent did; notify status listeners
  // so the pulse latency display stays current.
  const snap = snapshot();
  for (const listener of conn.statusListeners) {
    try {
      listener(snap);
    } catch {
      // Ignore.
    }
  }
}

function open(): void {
  if (typeof window === 'undefined') return;
  if (conn.source !== null) return;

  setStatus(conn.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

  let source: EventSource;
  try {
    source = new EventSource(STREAM_URL);
  } catch {
    // Browser refused (no SSE support, or constructor throws on bad URL).
    // Schedule a retry — maybe the network comes back.
    scheduleReconnect();
    return;
  }
  conn.source = source;

  source.addEventListener('open', () => {
    conn.reconnectAttempt = 0;
    setStatus('open');
  });

  // The server emits typed events (event: prompt-logged, etc.). EventSource
  // only fires the default 'message' handler for events without a custom
  // name, so we register one listener per known kind PLUS one for the
  // initial 'connected' handshake.
  const KNOWN_KINDS: ReadonlyArray<FinOpsEventKind | 'connected'> = [
    'prompt-logged',
    'anomaly-detected',
    'import-completed',
    'budget-alert',
    'connected',
  ];
  for (const name of KNOWN_KINDS) {
    source.addEventListener(name, (ev) => {
      // 'connected' is a handshake, not a FinOpsEvent — only update lastEventAt.
      if (name === 'connected') {
        conn.lastEventAt = Date.now();
        const snap = snapshot();
        for (const listener of conn.statusListeners) {
          try {
            listener(snap);
          } catch {
            // Ignore.
          }
        }
        return;
      }
      try {
        const me = ev as MessageEvent<string>;
        const parsed: unknown = JSON.parse(me.data);
        if (isFinOpsEvent(parsed)) {
          dispatchFinOpsEvent(parsed);
        }
      } catch {
        // Bad payload — ignore. We don't trust ourselves enough to crash
        // the consumer over a malformed JSON frame.
      }
    });
  }

  source.addEventListener('error', () => {
    // EventSource error fires for any disconnect (server gone, network
    // dropped, response not 200). We close and schedule a manual reconnect
    // instead of relying on EventSource's built-in retry, which can stall
    // indefinitely on some browsers.
    closeSource();
    scheduleReconnect();
  });
}

function closeSource(): void {
  if (conn.source !== null) {
    try {
      conn.source.close();
    } catch {
      // close() shouldn't throw, but guard anyway.
    }
    conn.source = null;
  }
}

function scheduleReconnect(): void {
  if (conn.reconnectTimer !== null) return;
  // refCount === 0 means no live subscribers; don't reopen for nobody.
  if (conn.refCount === 0) {
    setStatus('closed');
    return;
  }
  setStatus('reconnecting');
  const delay = Math.min(
    RECONNECT_CAP_MS,
    RECONNECT_BASE_MS * Math.pow(2, conn.reconnectAttempt),
  );
  conn.reconnectAttempt += 1;
  conn.reconnectTimer = setTimeout(() => {
    conn.reconnectTimer = null;
    open();
  }, delay);
}

function teardown(): void {
  if (conn.reconnectTimer !== null) {
    clearTimeout(conn.reconnectTimer);
    conn.reconnectTimer = null;
  }
  closeSource();
  setStatus('closed');
}

function acquire(): void {
  conn.refCount += 1;
  if (conn.refCount === 1) {
    conn.reconnectAttempt = 0;
    open();
  }
}

function release(): void {
  conn.refCount = Math.max(0, conn.refCount - 1);
  if (conn.refCount === 0) {
    teardown();
  }
}

function isFinOpsEvent(value: unknown): value is FinOpsEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.kind !== 'string') return false;
  if (typeof v.timestamp !== 'number') return false;
  // 'data' can be anything; we don't enforce shape here. Consumers narrow.
  return true;
}

/**
 * Subscribe to the SSE feed and accumulate received events into local state.
 * Pass `kind` to keep only events of that kind in the returned array
 * (others are still received and counted by the shared connection, but
 * filtered out of this hook's array).
 *
 * Returned array is newest-first and capped at 200 items.
 */
export function useStream(kind?: FinOpsEventKind): FinOpsEvent[] {
  const [events, setEvents] = useState<FinOpsEvent[]>([]);

  // Re-subscribe on `kind` change so we both clear stale events AND apply
  // the new filter cleanly. Cheap — adding/removing a Set entry on a single
  // shared EventSource.
  useEffect(() => {
    // Reset accumulator on filter change so we don't mix kinds.
    setEvents([]);
    function handler(event: FinOpsEvent): void {
      if (kind !== undefined && event.kind !== kind) return;
      setEvents((prev) => {
        const next = [event, ...prev];
        if (next.length > MAX_EVENTS) next.length = MAX_EVENTS;
        return next;
      });
    }
    conn.listeners.add(handler);
    acquire();
    return () => {
      conn.listeners.delete(handler);
      release();
    };
  }, [kind]);

  return events;
}

/**
 * Subscribe to connection status changes without accumulating events. Used
 * by StreamingPulse for the green/amber/red indicator and latency tooltip.
 */
export function useStreamStatus(): StreamStatusSnapshot {
  const [snap, setSnap] = useState<StreamStatusSnapshot>(() => ({
    status: 'connecting',
    msSinceLastEvent: null,
    eventCount: 0,
  }));

  useEffect(() => {
    function handler(s: StreamStatusSnapshot): void {
      setSnap(s);
    }
    conn.statusListeners.add(handler);
    // Seed with current snapshot in case the connection is already open
    // when this hook mounts (common when LiveTicker mounts first).
    setSnap(snapshot());
    acquire();

    // Tick the latency display once per second so msSinceLastEvent stays
    // current even when no new events arrive. Cheap — a single setState
    // per second.
    const tick = setInterval(() => {
      setSnap(snapshot());
    }, 1_000);

    return () => {
      clearInterval(tick);
      conn.statusListeners.delete(handler);
      release();
    };
  }, []);

  return snap;
}
