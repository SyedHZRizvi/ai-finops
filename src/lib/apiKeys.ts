/**
 * Server-side helpers for the per-app ingest token system.
 *
 * Tokens are formatted as `ftk_<32 hex chars>` (ftk = "FinOps Token Key"). The
 * raw token is shown exactly once at creation; only a SHA-256 hash is
 * persisted, alongside a short prefix used for visual identification in lists.
 *
 * The verification path hashes the supplied raw token and queries by the
 * `hashedKey` unique index. That means an attacker with read access to the
 * database cannot recover the tokens or use them to authenticate.
 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';

/** Length of the random hex section after the `ftk_` prefix. */
const TOKEN_HEX_CHARS = 32;
/** Visual prefix length used to identify a key in lists (e.g. `ftk_abcd1234`). */
const PREFIX_LENGTH = 12;

export interface GeneratedToken {
  /** Shown to the user exactly once at creation, then unrecoverable. */
  raw: string;
  /** First 12 chars (`ftk_<8 hex>`), safe to display in lists. */
  prefix: string;
  /** SHA-256 hex hash of the raw token. This is what we store. */
  hashed: string;
}

export interface ApiKeyMetadata {
  id: string;
  scopeApps: string[] | null;
  isActive: boolean;
  expiresAt: Date | null;
}

/**
 * Hash a raw token. Single source of truth so creation and lookup always
 * produce identical digests.
 */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Produce a new token. `raw` is what the user copies; `prefix` and `hashed`
 * are what the route persists. Random bytes come from `crypto.randomBytes`,
 * which is a CSPRNG on every supported Node platform.
 */
export function generateToken(): GeneratedToken {
  const hex = randomBytes(TOKEN_HEX_CHARS / 2).toString('hex');
  const raw = `ftk_${hex}`;
  const prefix = raw.slice(0, PREFIX_LENGTH);
  const hashed = hashToken(raw);
  return { raw, prefix, hashed };
}

/**
 * Parse the `scopeApps` JSON column. Returns null for no scope (any app) and
 * a string array for an explicit scope list. Bad JSON or non-string entries
 * are coerced to null (treat as "any app") rather than throwing — the worst
 * case is the key matches more than it should, which is caught by the next
 * layer of validation in `/api/log`.
 */
function parseScopeApps(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const apps = parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
    return apps.length > 0 ? apps : null;
  } catch {
    return null;
  }
}

/**
 * Look up a key by its raw token. Returns null when:
 *   - the input doesn't match any row
 *   - the matched row is inactive (revoked)
 *   - the matched row is past its `expiresAt`
 *
 * The hash lookup is constant-time at the database layer: we never iterate
 * rows or compare raw strings, so there's no timing leak on the row count.
 */
export async function findApiKeyByRawToken(raw: string): Promise<ApiKeyMetadata | null> {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const hashed = hashToken(raw);
  const row = await prisma.apiKey.findUnique({
    where: { hashedKey: hashed },
    select: {
      id: true,
      scopeApps: true,
      isActive: true,
      expiresAt: true,
    },
  });
  if (!row) return null;
  if (!row.isActive) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  return {
    id: row.id,
    scopeApps: parseScopeApps(row.scopeApps),
    isActive: row.isActive,
    expiresAt: row.expiresAt,
  };
}

/**
 * Best-effort `lastUsedAt` bump. Swallows errors so a transient DB failure
 * during usage tracking never blocks an ingest call — the actual auth check
 * has already passed by the time we get here.
 */
export async function recordUsage(keyId: string): Promise<void> {
  try {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: new Date() },
    });
  } catch {
    // Intentionally swallowed — usage tracking is non-critical.
  }
}
