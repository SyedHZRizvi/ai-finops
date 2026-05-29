/**
 * Magic-link verification endpoint.
 *
 * GET /magic?t=<raw-token>[&next=<relative-path>]
 *
 * Why this is a Route Handler (route.ts), not a Page (page.tsx):
 *   Next.js 14.2 forbids `cookies().set()` inside server components — it
 *   throws "Cookies can only be modified in a Server Action or Route
 *   Handler". The cookie mint is the whole point of this endpoint, so a
 *   Route Handler is the right primitive. The URL surface is identical
 *   from the user's perspective: they click `https://.../magic?t=...` and
 *   either get redirected to the dashboard (success) or shown a friendly
 *   failure page (HTML response).
 *
 * Flow:
 *   1. Pull token + optional `next` from the query string.
 *   2. Sanitize `next` to a relative path (open-redirect defence).
 *   3. Call verifyMagicLink(token) — single-use, expiry-checked.
 *   4. On success: mint the standard finops_session cookie (same scheme
 *      used by the password gate) and 302 → `next` (or `/`).
 *   5. On failure: render a self-contained HTML page with a "request new
 *      link" button. No client-side framework — just plain HTML so the
 *      response is identical whether or not JS is enabled.
 *   6. On first-time sign-in, fire-and-forget a welcomeEmail.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  getAuthSecret,
  signSessionCookie,
} from '@/lib/auth';
import { verifyMagicLink, hashMagicLinkToken, isFirstSignIn } from '@/lib/magicLink';
import { sendEmail, getMailerConfig } from '@/lib/mailer';
import { welcomeEmail } from '@/lib/emailTemplates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Compute the secret used to HMAC-sign the session cookie.
 *
 * When FINOPS_DASHBOARD_PASSWORD is set, use it — the same key the
 * password gate uses, so a cookie minted here verifies via the same path.
 *
 * When only magic-link auth is configured (no password set), derive a
 * stable secret from FINOPS_MAIL_FROM. Rotating that env var invalidates
 * every existing session — same one-line rotation story as the password.
 *
 * When NEITHER is configured, auth is fully disabled at the middleware
 * level; the cookie we mint never gets checked. Use a fixed sentinel so
 * the code path stays the same.
 */
function resolveSessionSecret(): string {
  const password = getAuthSecret();
  if (password) return password;
  const mailFrom = (process.env.FINOPS_MAIL_FROM ?? '').trim();
  if (mailFrom.length > 0) return `magic-link:${mailFrom}`;
  return 'magic-link:no-password';
}

function isSafeNext(next: string | undefined | null): string {
  if (!next) return '/';
  if (!next.startsWith('/')) return '/';
  // `//foo` would be a protocol-relative URL — treat as unsafe.
  if (next.startsWith('//')) return '/';
  return next;
}

function dashboardUrlFrom(req: NextRequest): string {
  const env = (process.env.NEXT_PUBLIC_BASE_URL ?? '').trim();
  if (env.length > 0) return env.replace(/\/+$/, '');
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';
  const next = isSafeNext(url.searchParams.get('next'));

  if (!token) {
    return renderFailure('invalid');
  }

  const result = await verifyMagicLink(token);
  if (!result.ok || !result.email) {
    return renderFailure(result.reason ?? 'invalid');
  }

  // Mint the session cookie + redirect.
  const secret = resolveSessionSecret();
  const cookieValue = await signSessionCookie(secret);

  // Absolute redirect URL — NextResponse.redirect requires a full URL in
  // some runtime contexts; building from the request origin works in all.
  const redirectTo = new URL(next, req.url);
  const res = NextResponse.redirect(redirectTo, { status: 302 });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  // First-time sign-in welcome email. We fire-and-forget but await briefly:
  // the redirect doesn't depend on it, but we want logs to land before the
  // process freezes on serverless. The mailer always returns within
  // ~hundreds of ms (success) or immediately (failure).
  try {
    const tokenHash = hashMagicLinkToken(token);
    const first = await isFirstSignIn(result.email, tokenHash);
    if (first) {
      const cfg = getMailerConfig();
      if (cfg) {
        const template = welcomeEmail(result.email, dashboardUrlFrom(req));
        // Don't bail on welcome-email failure — the user is still signed in.
        await sendEmail({
          to: result.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
      }
    }
  } catch {
    // Welcome failures are non-fatal.
  }

  return res;
}

/**
 * Render a self-contained HTML failure page. No tailwind, no client JS —
 * just enough markup that the user sees a friendly message + a link to
 * request a new magic link. We don't depend on the Next.js page renderer
 * because we're in a route handler.
 *
 * Status code: 200. Returning 4xx here would be technically more correct
 * but some browsers display a generic error page on 4xx HTML responses
 * (Safari does this for 404). The body itself communicates the failure.
 */
function renderFailure(reason: 'invalid' | 'expired' | 'used'): NextResponse {
  const heading =
    reason === 'expired'
      ? 'This link has expired'
      : reason === 'used'
        ? 'This link has already been used'
        : 'This link is invalid';
  const body =
    reason === 'expired'
      ? 'Magic-link sign-in tokens expire after 15 minutes. Request a fresh link and try again.'
      : reason === 'used'
        ? 'Each magic-link can be used only once. If you need to sign in again, request a new link.'
        : "We couldn't find a sign-in link matching this token. It may have been mistyped, expired, or already used.";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Sign-in link · AI FinOps</title>
<style>
  body { margin: 0; padding: 0; background: #0a0a0f; color: #e5e7eb;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; }
  .card { max-width: 420px; width: 100%; background: #14141a;
    border: 1px solid #27272f; border-radius: 14px; padding: 32px;
    box-shadow: 0 12px 40px -8px rgba(0,0,0,0.5); }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
  .brand-icon { width: 40px; height: 40px; border-radius: 12px;
    background: linear-gradient(135deg,#7c3aed 0%, #06b6d4 100%);
    display: flex; align-items: center; justify-content: center; }
  .brand-name { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
  .brand-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }
  h1 { margin: 0 0 12px; font-size: 18px; font-weight: 600; line-height: 1.3; }
  p { margin: 0 0 24px; font-size: 14px; color: #9ca3af; line-height: 1.6; }
  .btn { display: block; text-align: center; padding: 12px 20px;
    background: linear-gradient(135deg,#7c3aed 0%, #06b6d4 100%);
    color: #fff; font-size: 14px; font-weight: 600; text-decoration: none;
    border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);
    transition: transform 150ms ease, box-shadow 200ms ease; }
  .btn:hover { transform: translateY(-1px); box-shadow: 0 0 40px -10px rgba(139,92,246,0.5); }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="brand-icon">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>
        </svg>
      </div>
      <div>
        <div class="brand-name">AI FinOps</div>
        <div class="brand-sub">Sign-in link</div>
      </div>
    </div>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(body)}</p>
    <a href="/login" class="btn">Request a new link</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // Prevent embedding the failure page in an iframe; not strictly
      // necessary but it costs nothing.
      'X-Frame-Options': 'DENY',
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
