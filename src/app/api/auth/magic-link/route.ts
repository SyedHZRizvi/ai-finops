/**
 * Magic-link sign-in API.
 *
 * POST /api/auth/magic-link
 *   body: { email: string }
 *   response: { ok: true }   (always — see enumeration note below)
 *
 * Enumeration neutrality:
 *   The response shape and status code do not depend on whether the email is
 *   real, malformed, rate-limited, or successfully delivered. Otherwise an
 *   attacker can probe for which addresses are valid sign-in candidates.
 *   We always return 200 { ok: true } and a small fixed message.
 *
 * Middleware note:
 *   This route is the bootstrap of the auth flow — when the password gate is
 *   enabled, the user can't have a session cookie yet when they hit it.
 *   `src/middleware.ts` must allow `/api/auth/magic-link` unauthenticated.
 *   We don't modify the middleware here; see the project report.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requestMagicLink } from '@/lib/magicLink';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // node:crypto, prisma, fetch — Node only.

interface MagicLinkBody {
  email?: unknown;
}

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();
  return null;
}

function baseUrlFromRequest(req: NextRequest): string {
  // Prefer the explicitly-configured NEXT_PUBLIC_BASE_URL so links land at
  // the canonical origin (matters when running behind a CDN that exposes a
  // different request host). Fall back to deriving from the request URL.
  const env = (process.env.NEXT_PUBLIC_BASE_URL ?? '').trim();
  if (env.length > 0) return env.replace(/\/+$/, '');
  // req.nextUrl carries the request origin AS SEEN by Next — works behind
  // most proxies as long as they set X-Forwarded-Host.
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: MagicLinkBody;
  try {
    body = (await req.json()) as MagicLinkBody;
  } catch {
    // Even on a bad JSON body, return ok:true to keep the surface flat.
    // The client would have to be misconfigured to hit this.
    return NextResponse.json({ ok: true });
  }

  const email = typeof body.email === 'string' ? body.email : '';
  const ip = clientIp(req) ?? undefined;
  const userAgent = req.headers.get('user-agent')?.trim() || undefined;
  const baseUrl = baseUrlFromRequest(req);

  // Fire-and-forget enumeration-neutral: don't await failures into the
  // response shape. Errors are logged inside requestMagicLink.
  const opts: { ip?: string; userAgent?: string } = {};
  if (ip) opts.ip = ip;
  if (userAgent) opts.userAgent = userAgent;
  await requestMagicLink(email, baseUrl, opts);

  return NextResponse.json({ ok: true });
}
