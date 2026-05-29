/**
 * Optional password authentication helpers.
 *
 * Implements an HMAC-signed cookie for a single shared password. The cookie
 * payload is constant (`SESSION_PAYLOAD`); the signature is derived from the
 * configured password. Rotating the password instantly invalidates every old
 * cookie. There is no per-user state, no user list, no database — just a
 * gate.
 *
 * We use the Web Crypto API (`crypto.subtle`) so this module works in the
 * Vercel Edge runtime that Next.js middleware runs on. Constant-time
 * comparison is implemented manually because `crypto.timingSafeEqual` is a
 * Node built-in and unavailable in the edge runtime.
 */
export const SESSION_COOKIE_NAME = 'finops_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

// A fixed payload signed with the password as the HMAC key. Versioned so we
// can change the scheme later without ambiguity.
const SESSION_PAYLOAD = 'finops-session-v1';

/**
 * Encode a Uint8Array as base64url (no padding). Both Node 18+ and the
 * Vercel Edge runtime expose `btoa` on the global scope, so we lean on
 * that instead of `Buffer` to keep this module edge-compatible.
 */
function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Constant-time string comparison. Bails early only on length mismatch — for
 * equal-length inputs every byte is read. This is the standard pattern for
 * comparing secrets when `crypto.timingSafeEqual` isn't available.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Sign the constant session payload with the password as HMAC key. The
 * returned string is what we put in the cookie; verification re-derives the
 * expected signature and compares constant-time.
 */
export async function signSessionCookie(secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(SESSION_PAYLOAD));
  return toBase64Url(new Uint8Array(sig));
}

/**
 * Verify a cookie value against the current secret. Returns false on any
 * error — never throws. Constant-time compare to avoid leaking byte
 * positions through timing.
 */
export async function verifySessionCookie(cookie: string, secret: string): Promise<boolean> {
  if (!cookie || !secret) return false;
  try {
    const expected = await signSessionCookie(secret);
    return constantTimeEqual(cookie, expected);
  } catch {
    return false;
  }
}

/**
 * Single source of truth: is auth currently enabled? Empty / missing env
 * var means "fully open" (the safe default). We trim so a stray space
 * doesn't accidentally enable the gate with an effectively-empty password.
 */
export function isAuthEnabled(): boolean {
  const pwd = process.env.FINOPS_DASHBOARD_PASSWORD;
  return typeof pwd === 'string' && pwd.trim().length > 0;
}

/**
 * Read the currently configured password, or null if none is set.
 */
export function getAuthSecret(): string | null {
  const pwd = process.env.FINOPS_DASHBOARD_PASSWORD;
  if (typeof pwd !== 'string') return null;
  const trimmed = pwd.trim();
  return trimmed.length > 0 ? trimmed : null;
}
