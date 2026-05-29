/**
 * Bearer-token authentication for /api/log.
 *
 * Wraps two backwards-compatible auth sources:
 *
 *   1. The legacy `FINOPS_INGEST_TOKEN` env var (one shared secret).
 *   2. The `ApiKey` table (per-app tokens with scoping, revocation, and
 *      last-used tracking).
 *
 * Resolution order:
 *
 *   - No header AND no env token AND no active ApiKey rows → open
 *     (with a production warning, identical to the previous behavior).
 *   - Header matches the env token → ok, no `keyId`.
 *   - Header matches a row in `ApiKey` → ok, returns `keyId` for usage
 *     tracking via `recordUsage`.
 *   - Otherwise → not ok.
 *
 * The env-token compare uses a length-prefixed constant-time check, which
 * is consistent with the original `checkAuth` it replaces. The DB lookup
 * is constant-time because it uses a SHA-256 hash equality on a unique
 * index — no per-row iteration.
 */
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';
import { findApiKeyByRawToken } from '@/lib/apiKeys';

export interface IngestAuthResult {
  ok: boolean;
  /** ApiKey row id, set only when auth succeeded via the DB table. */
  keyId?: string;
  /** Human-readable reason when `ok` is false. Safe to surface to clients. */
  reason?: string;
}

/**
 * Extract the bearer token from an Authorization header. Accepts any
 * case for the scheme ("Bearer", "bearer", "BEARER").
 */
function extractBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Constant-time equality for two UTF-8 strings. Returns false on length
 * mismatch without leaking the actual lengths beyond the boolean.
 */
function constantTimeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Have we ever issued an API key, and at least one is still active? If yes,
 * the legacy "no token configured → open" fallback is disabled — the
 * presence of any active key means the operator has explicitly opted into
 * authenticated ingest.
 */
async function hasActiveApiKey(): Promise<boolean> {
  try {
    const count = await prisma.apiKey.count({ where: { isActive: true } });
    return count > 0;
  } catch {
    // If the DB is unreachable we can't be sure — fail closed by claiming
    // we DO have active keys, so the route will reject unauthenticated
    // requests instead of silently letting them through.
    return true;
  }
}

/**
 * Main entry point used by /api/log. The caller passes the raw header value
 * (e.g. `req.headers.get('authorization')`); we handle case-insensitivity,
 * scheme parsing, and both auth sources.
 *
 * IMPORTANT: When `ok` is true and `keyId` is set, the caller should invoke
 * `recordUsage(keyId)` after a successful ingest so the dashboard's
 * "last used" column stays accurate. Failure to track usage is not fatal
 * (it's already best-effort inside `recordUsage`).
 */
export async function verifyIngestToken(authHeader: string | null): Promise<IngestAuthResult> {
  const envToken = process.env.FINOPS_INGEST_TOKEN?.trim() ?? '';
  const supplied = extractBearer(authHeader);

  if (!supplied) {
    // No header at all. Whether we accept it depends on whether the operator
    // has configured ANY form of auth.
    const haveAnyAuth = envToken.length > 0 || (await hasActiveApiKey());
    if (!haveAnyAuth) {
      if (process.env.NODE_ENV === 'production') {
        console.warn(
          '[ai-finops] WARNING: /api/log accepting unauthenticated request — set FINOPS_INGEST_TOKEN or create an API key to require Bearer auth',
        );
      }
      return { ok: true };
    }
    return { ok: false, reason: 'unauthorized' };
  }

  // Legacy env-var auth. Backwards-compat for installations that haven't
  // migrated to per-app keys yet.
  if (envToken.length > 0 && constantTimeStringEqual(supplied, envToken)) {
    return { ok: true };
  }

  // Per-app DB auth. This also returns null for revoked or expired keys.
  const row = await findApiKeyByRawToken(supplied).catch(() => null);
  if (row) {
    return { ok: true, keyId: row.id };
  }

  return { ok: false, reason: 'unauthorized' };
}
