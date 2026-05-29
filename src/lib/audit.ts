// Audit log infrastructure.
//
// `recordAudit` writes one append-only row per mutating dashboard action.
// It is intentionally fire-and-forget: never throws, never blocks the
// caller's response, and silently swallows DB failures so a degraded audit
// table can never break the rest of the app. The worst case is a missing
// row plus a `console.warn`.
//
// `listAudit` reads rows back with the filter set the /audit page (and any
// future programmatic consumer) needs. Payloads are stored as JSON strings
// in the DB column; we parse them back into structured `unknown` on read so
// callers don't all redo the same JSON.parse dance.

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

// Every dashboard mutation maps to one of these strings. Keeping the union
// closed (rather than `string`) gives us autocomplete + type-checking at
// every call-site, and lets the UI render a sane color chip per category.
export type AuditAction =
  | 'budget.create'
  | 'budget.update'
  | 'budget.delete'
  | 'credential.create'
  | 'credential.delete'
  | 'anomaly.resolve'
  | 'anomaly.create'
  | 'allocation.create'
  | 'allocation.update'
  | 'allocation.delete'
  | 'apikey.create'
  | 'apikey.revoke'
  | 'apikey.update'
  | 'pricing.update'
  | 'demo.seed'
  | 'demo.clear'
  | 'import.run'
  | 'annotation.upsert'
  | 'annotation.delete'
  | 'snapshot.capture'
  | 'snapshot.delete'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.failed';

export type AuditTargetKind =
  | 'budget'
  | 'credential'
  | 'anomaly'
  | 'allocation'
  | 'apikey'
  | 'pricing'
  | 'demo'
  | 'import'
  | 'annotation'
  | 'snapshot'
  | 'auth';

/**
 * Shape returned by `listAudit`. `payload` is the parsed JSON (or null when
 * the column was empty / invalid JSON — never throws on bad data).
 */
export interface AuditEntry {
  id: string;
  actor: string | null;
  action: AuditAction;
  targetId: string | null;
  targetKind: AuditTargetKind | null;
  payload: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/** 8 KB cap on payload after JSON.stringify — anything larger is truncated. */
const MAX_PAYLOAD_BYTES = 8 * 1024;

/**
 * Type guard for the `Request | NextRequest` union — both expose `.headers`,
 * but only `NextRequest` exposes `.cookies` as an object. We feature-detect
 * rather than `instanceof` because middleware-style code can pass either.
 */
function hasCookies(
  req: Request | NextRequest,
): req is NextRequest {
  return (
    typeof (req as NextRequest).cookies === 'object' &&
    (req as NextRequest).cookies !== null &&
    typeof (req as NextRequest).cookies.get === 'function'
  );
}

/**
 * Extract the originating client IP from the standard forwarding headers.
 *
 * `x-forwarded-for` is a comma-delimited list of IPs; the first entry is
 * the original client (subsequent entries are intermediate proxies). When
 * that header is missing we fall back to `x-real-ip` (set by some
 * reverse proxies). Returns null when nothing usable is present — the DB
 * column is nullable on purpose.
 */
function extractIp(req: Request | NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();
  return null;
}

function extractUserAgent(req: Request | NextRequest): string | null {
  const ua = req.headers.get('user-agent');
  if (!ua) return null;
  const trimmed = ua.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Derive an actor string from the request. When auth is enabled we can
 * tell *that* the user was signed in (their cookie was valid earlier or
 * the middleware would have rejected the request) but we don't have a
 * per-user identity — the auth model is a single shared password. So we
 * emit a generic "session" actor when a session cookie is present, and
 * null otherwise.
 *
 * Explicit `opts.actor` always wins (cron jobs, SDK keys, etc. pass their
 * own identity).
 */
function extractActor(req: Request | NextRequest | undefined, explicit?: string): string | null {
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  if (!req) return null;
  if (hasCookies(req)) {
    const sess = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sess && sess.length > 0) return 'session';
  }
  return null;
}

/**
 * Serialize the payload to a JSON string, capped at MAX_PAYLOAD_BYTES. If
 * the encoded size exceeds the cap we replace the body with a truncation
 * marker that records the original size — keeping the row small without
 * losing the fact that something was elided.
 *
 * Bad inputs (circular refs, BigInts, …) get caught and represented as a
 * `_serializeError` marker rather than throwing.
 */
function encodePayload(payload: unknown): string | null {
  if (payload === undefined) return null;
  let encoded: string;
  try {
    encoded = JSON.stringify(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return JSON.stringify({ _serializeError: message });
  }
  if (typeof encoded !== 'string') {
    // JSON.stringify returns undefined for things like a bare `undefined`
    // or a function — store nothing rather than a literal "undefined".
    return null;
  }
  // Use TextEncoder so the cap is in bytes (matches the schema's 8KB doc),
  // not UTF-16 code units. UTF-8 may expand multibyte characters.
  const enc = new TextEncoder();
  const bytes = enc.encode(encoded);
  if (bytes.length <= MAX_PAYLOAD_BYTES) return encoded;
  return JSON.stringify({ _truncated: true, _originalSize: bytes.length });
}

/**
 * Append a single audit row. Fire-and-forget — never throws. A DB outage
 * must not break the calling mutation, so all failures are swallowed and
 * surface via `console.warn` only.
 */
export async function recordAudit(opts: {
  req?: Request | NextRequest;
  action: AuditAction;
  targetKind?: AuditTargetKind;
  targetId?: string;
  payload?: unknown;
  actor?: string;
}): Promise<void> {
  try {
    const { req, action, targetKind, targetId, payload, actor } = opts;
    const ip = req ? extractIp(req) : null;
    const userAgent = req ? extractUserAgent(req) : null;
    const resolvedActor = extractActor(req, actor);
    const encoded = encodePayload(payload);

    await prisma.auditLogEntry.create({
      data: {
        actor: resolvedActor,
        action,
        targetId: targetId ?? null,
        targetKind: targetKind ?? null,
        payload: encoded,
        ip,
        userAgent,
      },
    });
  } catch (err) {
    // Never let an audit failure cascade. Log at warn so it's visible in
    // production without polluting error pipelines.
    const message = err instanceof Error ? err.message : 'unknown error';
    // eslint-disable-next-line no-console
    console.warn(`[audit] failed to record action=${opts.action}: ${message}`);
  }
}

/**
 * Read entries back, newest-first, with the filter set the /audit UI needs.
 * Returns a count of matching rows alongside the page slice so the UI can
 * render pagination correctly.
 */
export async function listAudit(opts?: {
  limit?: number;
  offset?: number;
  action?: AuditAction;
  targetKind?: AuditTargetKind;
  since?: Date;
  actor?: string;
}): Promise<{ items: AuditEntry[]; total: number }> {
  const limit = clampLimit(opts?.limit);
  const offset = Math.max(0, opts?.offset ?? 0);

  // Build the Prisma where clause from whatever subset of filters was
  // provided. All filters AND together.
  const where: {
    action?: string;
    targetKind?: string;
    actor?: string;
    createdAt?: { gte: Date };
  } = {};
  if (opts?.action) where.action = opts.action;
  if (opts?.targetKind) where.targetKind = opts.targetKind;
  if (opts?.actor) where.actor = opts.actor;
  if (opts?.since instanceof Date && !Number.isNaN(opts.since.getTime())) {
    where.createdAt = { gte: opts.since };
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.auditLogEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.auditLogEntry.count({ where }),
    ]);
    const items = rows.map(toEntry);
    return { items, total };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // eslint-disable-next-line no-console
    console.warn(`[audit] listAudit failed: ${message}`);
    return { items: [], total: 0 };
  }
}

/** Pagination bounds — `limit` is hard-capped at 500 to keep responses sane. */
function clampLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  const rounded = Math.floor(value);
  if (rounded < 1) return 1;
  if (rounded > 500) return 500;
  return rounded;
}

/**
 * Lift a raw Prisma row into the public `AuditEntry` shape. `action` /
 * `targetKind` are stored as free strings in the DB; we cast them through
 * the union types since the writers only ever produce valid values.
 */
function toEntry(row: {
  id: string;
  actor: string | null;
  action: string;
  targetId: string | null;
  targetKind: string | null;
  payload: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}): AuditEntry {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action as AuditAction,
    targetId: row.targetId,
    targetKind: row.targetKind as AuditTargetKind | null,
    payload: parsePayload(row.payload),
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

function parsePayload(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // The column stored something that wasn't JSON — return the raw string
    // rather than null so a debug operator can at least see it in the UI.
    return raw;
  }
}
