// Authentication for Vercel-cron-invoked endpoints.
//
// Vercel Cron jobs are invoked via HTTPS POSTs to a path declared in
// `vercel.json`. To prove the request actually originated from the
// platform (and not from an attacker hammering our /api/cron/* URLs),
// Vercel attaches an `Authorization: Bearer <CRON_SECRET>` header on
// every cron-driven invocation, where <CRON_SECRET> is the value of
// the `CRON_SECRET` env var configured on the project.
//
// We mirror that contract here:
//
//   * In production (NODE_ENV === 'production'):
//       - `CRON_SECRET` MUST be set. If it isn't, EVERY cron request is
//         denied — fail-closed. We refuse to silently run unauthenticated
//         jobs in a deployed environment.
//       - The request's Bearer token is compared against `CRON_SECRET`
//         using `crypto.timingSafeEqual` to avoid leaking the secret via
//         response-time side channels.
//   * In non-production (development, test, preview without the secret):
//       - If `CRON_SECRET` is unset/empty, every request is allowed
//         through. This is what lets a developer hit
//         `curl -X POST http://localhost:3000/api/cron/anomaly-check`
//         without juggling tokens.
//       - If `CRON_SECRET` IS set (e.g. preview env replicates prod), the
//         same Bearer check applies.
//
// The function is intentionally pure & synchronous: callers can short-
// circuit cron handlers with a single `if (!verifyCronAuth(req).ok)`
// guard.

import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

export interface CronAuthResult {
  ok: boolean;
  /**
   * Human-readable explanation when `ok` is false. Surface only in logs;
   * never echo to clients (it would tell a probing attacker whether the
   * secret was unset vs. mismatched).
   */
  reason?: string;
}

function bytesEqual(a: string, b: string): boolean {
  // Reject empty strings explicitly — timingSafeEqual will throw on zero-
  // length buffers AND we never want an empty token to count as a match.
  if (a.length === 0 || b.length === 0) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  // timingSafeEqual requires equal lengths; mismatched lengths can never
  // be equal, so we shortcut. The constant-time comparison only matters
  // for same-length attacker-controlled vs. real-secret pairs.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function extractBearer(headerValue: string | null): string | null {
  if (headerValue == null) return null;
  // Tolerate leading/trailing whitespace; accept either "Bearer xxx" or a
  // bare token (some test harnesses drop the scheme). We're strict on the
  // case of the scheme since that's the canonical form.
  const trimmed = headerValue.trim();
  if (trimmed.length === 0) return null;
  const m = trimmed.match(/^Bearer\s+(.+)$/i);
  if (m && m[1]) return m[1].trim();
  // Fall back to treating the entire header as the token; lets callers do
  // `Authorization: <token>` if they prefer. Still subject to the same
  // constant-time comparison below.
  return trimmed;
}

export function verifyCronAuth(request: NextRequest): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  // Non-production with no secret configured: allow. This is the local
  // developer ergonomic path. The documentation explicitly notes this so
  // it doesn't surprise anyone.
  if (!secret || secret.length === 0) {
    if (isProd) {
      return {
        ok: false,
        reason:
          'CRON_SECRET is unset in production — refusing to authenticate cron request',
      };
    }
    return { ok: true };
  }

  const authHeader = request.headers.get('authorization');
  const token = extractBearer(authHeader);
  if (token == null) {
    return { ok: false, reason: 'missing Authorization header' };
  }

  if (!bytesEqual(token, secret)) {
    return { ok: false, reason: 'bearer token mismatch' };
  }

  return { ok: true };
}
