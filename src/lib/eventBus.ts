// In-memory pub/sub bus for cross-route FinOps event emission. Powers the
// real-time SSE feed at /api/stream.
//
// Constraint: this is an in-process bus only. Subscribers and emitters must
// live in the SAME Node process for events to flow.
//
//   * In local `next dev` and `next start` this is trivially true — there is
//     one process, one module instance, one Set of subscribers.
//   * On Vercel serverless each invocation may land on a *different* lambda
//     instance. An emit() in instance A is invisible to a subscriber held
//     open in instance B. For multi-instance fan-out, swap this module for
//     a Redis pub/sub adapter (or Upstash QStash, Ably, Pusher, etc.) —
//     the rest of the codebase only depends on `emit` / `subscribe`, so
//     the substitution is contained.
//   * The SSE route pins itself to a single instance for the lifetime of
//     the connection, so a single-client demo works end-to-end even on
//     Vercel; cross-client visibility is what suffers without Redis.
//
// No persistence: events are fire-and-forget. A subscriber that connects
// after an event was emitted will not see it. This is by design — the
// Dashboard already has REST endpoints for historical state; the bus is
// purely for "the data is alive" presence signaling.

export type FinOpsEventKind =
  | 'prompt-logged'
  | 'anomaly-detected'
  | 'import-completed'
  | 'budget-alert';

export interface FinOpsEvent {
  kind: FinOpsEventKind;
  timestamp: number;
  data: unknown;
}

export interface PromptLoggedPayload {
  promptLogId: string;
  model: string;
  appName: string | null;
  category: string;
  complexity: string;
  totalCost: number;
  promptPreview: string;
  timestamp: string;
}

export interface AnomalyDetectedPayload {
  anomalyId: string;
  kind: string;
  severity: string;
  title: string;
  detectedAt: string;
}

type Handler = (e: FinOpsEvent) => void;

// Module-scope subscriber set. One Set per module instance. The Next.js
// dev server hot-reloads cleanly because each new module instance gets a
// fresh Set; old SSE connections are torn down by the dev server before
// reload, so we don't leak across HMR boundaries.
const subscribers: Set<Handler> = new Set();

/**
 * Publish an event to every active subscriber. Synchronous and best-effort:
 * a single subscriber that throws does NOT prevent later subscribers from
 * receiving the event. Failures are logged at warn level so a noisy handler
 * surfaces in dev without crashing ingest.
 */
export function emit(event: FinOpsEvent): void {
  for (const handler of subscribers) {
    try {
      handler(event);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[eventBus] subscriber threw, continuing:', err);
    }
  }
}

/**
 * Subscribe to all FinOps events. Returns an unsubscribe function that
 * MUST be called when the subscriber goes away (e.g. on SSE client
 * disconnect) — otherwise the Set grows unbounded and we leak closures.
 */
export function subscribe(handler: Handler): () => void {
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
  };
}

/**
 * Number of active subscribers — exported for /api/health style introspection
 * and for the Dashboard's StreamingPulse latency display. Not load-bearing
 * for any business logic.
 */
export function subscriberCount(): number {
  return subscribers.size;
}

/**
 * Convenience emitter for the most common event: a single prompt was just
 * logged via /api/log. The payload is intentionally small — the SSE stream
 * is a presence signal, not a full mirror of the row. Consumers that want
 * full detail should fetch /api/prompts/[id] on click.
 */
export function emitPromptLogged(
  promptLogId: string,
  summary: {
    model: string;
    appName: string | null;
    category: string;
    complexity: string;
    totalCost: number;
    promptPreview: string;
    timestamp: string;
  },
): void {
  const payload: PromptLoggedPayload = {
    promptLogId,
    ...summary,
  };
  emit({
    kind: 'prompt-logged',
    timestamp: Date.now(),
    data: payload,
  });
}

/**
 * Convenience emitter for /api/anomaly/check. Fires once per *newly persisted*
 * anomaly (not per detector hit) — i.e. after the dedup step. Callers should
 * iterate justPersisted and emit one event per row.
 */
export function emitAnomalyDetected(
  anomalyId: string,
  summary: {
    kind: string;
    severity: string;
    title: string;
    detectedAt: string;
  },
): void {
  const payload: AnomalyDetectedPayload = {
    anomalyId,
    ...summary,
  };
  emit({
    kind: 'anomaly-detected',
    timestamp: Date.now(),
    data: payload,
  });
}
