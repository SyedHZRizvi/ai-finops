// Glue helpers for existing route handlers to fire FinOps events without
// having to know the eventBus internals.
//
// USAGE
//
//   These helpers are intended to be called from EXISTING API routes
//   (e.g. /api/log/route.ts, /api/anomaly/check/route.ts) at the point
//   where a meaningful business event just happened (a prompt was just
//   persisted, an anomaly was just created). The orchestrator wires the
//   one-line call into each route — see the integration notes in the
//   project task brief.
//
//   import { notifyPromptLogged, notifyAnomalyDetected } from '@/lib/sseHook';
//
//   // inside /api/log POST, after prisma.promptLog.create(...):
//   notifyPromptLogged(created.id, {
//     model: body.model,
//     appName: body.appName ?? null,
//     category: created.category,
//     complexity: created.complexity,
//     totalCost: created.totalCost,
//     promptPreview: body.promptText.slice(0, 140),
//     timestamp: new Date().toISOString(),
//   });
//
// SAFETY
//
//   * Every helper is synchronous, non-throwing, and best-effort. A bus
//     failure must NEVER break an ingest path — losing a presence event
//     is fine, losing a logged prompt is not.
//   * Helpers do no I/O. They just call emit().
//
// hookExistingRoutes() is a NO-OP stub today — the actual emit() calls live
// in each route. The function exists as a registration hook for future
// startup-time wiring (e.g. attaching a cron-driven detector that emits
// without an HTTP entry point). Call it once from src/instrumentation.ts
// (Next.js' module-level startup hook) if/when that need arises.

import {
  emit,
  emitPromptLogged as busEmitPromptLogged,
  emitAnomalyDetected as busEmitAnomalyDetected,
  type FinOpsEvent,
} from './eventBus';

/**
 * Registration hook for future startup-time wiring. Currently a no-op:
 * all emit() calls live in their respective route handlers, which is the
 * simplest correct shape. Kept exported so the orchestrator has a single
 * place to add startup logic (e.g. periodic synthetic events for QA, or a
 * Redis subscriber to fan-in events from peer Vercel instances).
 */
export function hookExistingRoutes(): void {
  // intentionally empty
}

/**
 * Emit a 'prompt-logged' event. Safe to call from inside POST /api/log.
 * Failures are swallowed so a misbehaving bus cannot break ingest.
 */
export function notifyPromptLogged(
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
  try {
    busEmitPromptLogged(promptLogId, summary);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[sseHook] notifyPromptLogged failed:', err);
  }
}

/**
 * Emit a 'anomaly-detected' event. Safe to call from inside POST
 * /api/anomaly/check, once per newly persisted (deduped) anomaly row.
 */
export function notifyAnomalyDetected(
  anomalyId: string,
  summary: {
    kind: string;
    severity: string;
    title: string;
    detectedAt: string;
  },
): void {
  try {
    busEmitAnomalyDetected(anomalyId, summary);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[sseHook] notifyAnomalyDetected failed:', err);
  }
}

/**
 * Emit an 'import-completed' event. Safe to call from inside POST
 * /api/import (or the various provider-specific import routes). Payload
 * is loosely typed because import shapes vary by provider.
 */
export function notifyImportCompleted(
  summary: {
    provider: string;
    rowsImported: number;
    totalCost: number;
    timestamp: string;
  },
): void {
  try {
    const ev: FinOpsEvent = {
      kind: 'import-completed',
      timestamp: Date.now(),
      data: summary,
    };
    emit(ev);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[sseHook] notifyImportCompleted failed:', err);
  }
}

/**
 * Emit a 'budget-alert' event. Safe to call from inside the budget-check
 * path (whether that runs in /api/anomaly/check via the budget detector,
 * or in a dedicated future route).
 */
export function notifyBudgetAlert(
  summary: {
    budgetId: string;
    budgetName: string;
    threshold: 'warning' | 'exceeded';
    spent: number;
    limit: number;
    timestamp: string;
  },
): void {
  try {
    const ev: FinOpsEvent = {
      kind: 'budget-alert',
      timestamp: Date.now(),
      data: summary,
    };
    emit(ev);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[sseHook] notifyBudgetAlert failed:', err);
  }
}
