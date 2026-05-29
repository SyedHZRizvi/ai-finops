/**
 * Magic-link auth orchestration.
 *
 *   1. requestMagicLink(email, baseUrl, opts)
 *      Generate a single-use token, persist its SHA-256 hash in
 *      MagicLinkToken with a 15-minute expiry, build the user-facing URL,
 *      and dispatch the email.
 *
 *   2. verifyMagicLink(token)
 *      Look up the row by hashedToken, reject if expired or already used,
 *      mark usedAt = now() inside a single update that also reads the row
 *      back, and return the email.
 *
 * Security notes:
 *   - We store SHA-256 hashes, never the raw token. If the DB leaks, the
 *     captured rows are not usable to sign in (raw token is needed; the
 *     hash is one-way).
 *   - 32 random bytes is overkill for an OTP, but hex strings are easy to
 *     paste and the overkill is essentially free.
 *   - Rate-limit by email at 1 link / 60s. This prevents:
 *       (a) email-flood abuse (an attacker mailbombing a known user)
 *       (b) parallel-attack patterns where the attacker generates many tokens
 *           hoping to brute-force one of them
 *   - The /api/auth/magic-link route ALWAYS returns ok:true, regardless of
 *     whether the email is real or made up. This prevents email
 *     enumeration: a probe can't tell which addresses are in our DB.
 *
 * Important: there is NO users table. The MagicLinkToken row carries the
 * email, but nothing else gates which emails can sign in. If you want to
 * lock this down to a known allowlist, add an env check (FINOPS_ALLOWED_EMAILS)
 * or a per-domain rule before calling sendEmail.
 */

import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/mailer';
import { magicLinkEmail } from '@/lib/emailTemplates';

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const COOLDOWN_SECONDS = 60;

export interface RequestMagicLinkResult {
  ok: boolean;
  /**
   * When the request was rate-limited, how many seconds the caller should
   * wait. Undefined on success. NOTE: the API route does not surface this
   * to the client (would enable enumeration); it's only useful in tests /
   * internal callers.
   */
  cooldownSeconds?: number;
}

export interface VerifyMagicLinkResult {
  ok: boolean;
  email?: string;
  /**
   * Why it failed. Surface only on the verify endpoint where the user has
   * just clicked their own link — there's nothing to enumerate at that point.
   * Possible values:
   *   - 'invalid'  malformed token, no matching row
   *   - 'expired'  token row exists but expiresAt < now
   *   - 'used'     token already redeemed
   */
  reason?: 'invalid' | 'expired' | 'used';
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Light validation. We don't try to enforce RFC 5322; just block the
 * obvious "this is not even an email" cases that would waste the rate
 * limiter's bucket. Anything past this still flows through to the mailer
 * (which may itself reject it).
 */
function isPlausibleEmail(s: string): boolean {
  if (typeof s !== 'string') return false;
  const trimmed = s.trim();
  if (trimmed.length < 3 || trimmed.length > 320) return false;
  // Single @, non-empty parts on each side, no internal whitespace.
  const at = trimmed.indexOf('@');
  if (at < 1 || at !== trimmed.lastIndexOf('@')) return false;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (local.length === 0 || domain.length < 3) return false;
  if (!domain.includes('.')) return false;
  if (/\s/.test(trimmed)) return false;
  return true;
}

/**
 * Has THIS email requested a magic link within the cooldown window?
 *
 * We check by looking at the most recent token row's createdAt — that
 * survives serverless cold starts (unlike in-process counters). If the
 * row's createdAt is within COOLDOWN_SECONDS, we refuse.
 */
async function emailIsCoolingDown(email: string): Promise<number | null> {
  const cutoff = new Date(Date.now() - COOLDOWN_SECONDS * 1000);
  const recent = await prisma.magicLinkToken.findFirst({
    where: {
      email: email.toLowerCase(),
      createdAt: { gt: cutoff },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!recent) return null;
  const elapsed = Math.floor((Date.now() - recent.createdAt.getTime()) / 1000);
  const remaining = Math.max(1, COOLDOWN_SECONDS - elapsed);
  return remaining;
}

/**
 * Generate a raw token + return both the raw (for the email URL) and the
 * SHA-256 hash (for the DB row). The raw value is never persisted.
 */
function mintToken(): { raw: string; hashed: string } {
  const raw = randomBytes(TOKEN_BYTES).toString('hex');
  const hashed = hashToken(raw);
  return { raw, hashed };
}

/**
 * Issue a magic-link email for the supplied address.
 *
 * Always returns a result object — never throws. Callers always behave as
 * though the request "succeeded" for enumeration reasons (the API route
 * shouldn't differentiate the rate-limited / invalid-email / mailer-failed
 * cases when responding to the client).
 *
 * @param email     Address that will receive the link.
 * @param baseUrl   Origin to embed in the link (e.g. https://finops.example.com).
 *                  Must NOT have a trailing slash; we append `/magic?t=…`.
 * @param opts.ip   Optional source IP, stored on the token row for audit.
 * @param opts.userAgent  Optional UA string, also stored.
 */
export async function requestMagicLink(
  email: string,
  baseUrl: string,
  opts?: { ip?: string; userAgent?: string },
): Promise<RequestMagicLinkResult> {
  const normalized = (typeof email === 'string' ? email.trim().toLowerCase() : '');
  if (!isPlausibleEmail(normalized)) {
    // Behave as if we sent — the API route can't distinguish anyway.
    return { ok: true };
  }

  try {
    const cooldown = await emailIsCoolingDown(normalized);
    if (cooldown != null) {
      return { ok: true, cooldownSeconds: cooldown };
    }

    const { raw, hashed } = mintToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await prisma.magicLinkToken.create({
      data: {
        email: normalized,
        hashedToken: hashed,
        expiresAt,
        ip: opts?.ip ?? null,
        userAgent: opts?.userAgent ?? null,
      },
    });

    // baseUrl normalization. Tolerate a trailing slash to be forgiving of
    // operators that pass NEXT_PUBLIC_BASE_URL with one.
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const link = `${cleanBase}/magic?t=${encodeURIComponent(raw)}`;

    const template = magicLinkEmail(normalized, link);
    const sendResult = await sendEmail({
      to: normalized,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (!sendResult.ok) {
      // Surface to logs (operators can investigate) but DO NOT reveal to the
      // caller — the API contract is "always returns ok" to defeat
      // enumeration.
      // eslint-disable-next-line no-console
      console.warn(`[magicLink] failed to send to ${normalized}: ${sendResult.error ?? 'unknown'}`);
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // eslint-disable-next-line no-console
    console.warn(`[magicLink] requestMagicLink failed: ${message}`);
    // Still return ok:true — enumeration neutrality.
    return { ok: true };
  }
}

/**
 * Verify a token from the user's URL. On success returns the email and
 * marks the row used so a second click is rejected.
 *
 * Single-use enforcement: we update with `usedAt: null` in the where clause
 * so two concurrent verifications can't both succeed (the second one
 * matches zero rows). The Prisma `updateMany` returns `{ count }`; we check
 * that count to detect the race-loser.
 */
export async function verifyMagicLink(token: string): Promise<VerifyMagicLinkResult> {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'invalid' };
  }
  // Tokens are 32 random bytes hex-encoded = 64 hex chars. Reject anything
  // outside a reasonable bound up-front so we don't hash arbitrary strings.
  if (token.length < 16 || token.length > 256) {
    return { ok: false, reason: 'invalid' };
  }

  const hashed = hashToken(token);
  try {
    const row = await prisma.magicLinkToken.findUnique({
      where: { hashedToken: hashed },
    });
    if (!row) return { ok: false, reason: 'invalid' };
    if (row.usedAt != null) return { ok: false, reason: 'used' };
    if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };

    // Atomic claim: only mark used if it's still unused. If two concurrent
    // verifications race here, exactly one will get count === 1 and the
    // other will see count === 0 and we treat it as 'used'.
    const claimed = await prisma.magicLinkToken.updateMany({
      where: { hashedToken: hashed, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return { ok: false, reason: 'used' };
    }

    return { ok: true, email: row.email };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // eslint-disable-next-line no-console
    console.warn(`[magicLink] verifyMagicLink failed: ${message}`);
    return { ok: false, reason: 'invalid' };
  }
}

/**
 * Whether this email row has any successful prior sign-in. Used by the
 * /magic page to decide whether to send the welcomeEmail or not.
 *
 * Implementation note: we don't have a User table, so "first sign-in" means
 * "no prior MagicLinkToken row with usedAt set for this email (besides the
 * one we just used)". The /magic page calls this with the current token's
 * id to exclude it from the count.
 */
export async function isFirstSignIn(email: string, excludeTokenHash?: string): Promise<boolean> {
  try {
    const count = await prisma.magicLinkToken.count({
      where: {
        email: email.toLowerCase(),
        usedAt: { not: null },
        ...(excludeTokenHash ? { hashedToken: { not: excludeTokenHash } } : {}),
      },
    });
    return count === 0;
  } catch {
    // If the count fails, fall back to "not first" — better to skip the
    // welcome email than to spam someone twice.
    return false;
  }
}

/** Re-export for callers that want to compute a hash without re-importing crypto. */
export function hashMagicLinkToken(raw: string): string {
  return hashToken(raw);
}
