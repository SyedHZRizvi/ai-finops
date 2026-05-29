import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  constantTimeEqual,
  getAuthSecret,
  signSessionCookie,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';
// Use Node runtime — Web Crypto works there too, but this route also touches
// `process.env` and module-scope state for rate limiting, both of which are
// happier outside the edge sandbox.
export const runtime = 'nodejs';

interface LoginBody {
  password?: unknown;
}

/**
 * Per-IP failure counter. Module-scope so it survives between requests on
 * the same warm Node instance. On serverless this resets per cold start —
 * good enough for a single-tenant tool, not meant to stop a determined
 * attacker (use a real WAF for that).
 */
interface FailRecord {
  count: number;
  firstFailMs: number;
}
const failures = new Map<string, FailRecord>();
const WINDOW_MS = 60_000;
const MAX_FAILS = 5;

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    // First entry is the original client.
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = failures.get(ip);
  if (!rec) return false;
  if (now - rec.firstFailMs > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return rec.count >= MAX_FAILS;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const rec = failures.get(ip);
  if (!rec || now - rec.firstFailMs > WINDOW_MS) {
    failures.set(ip, { count: 1, firstFailMs: now });
  } else {
    rec.count += 1;
  }
}

function clearFailures(ip: string): void {
  failures.delete(ip);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = getAuthSecret();

  // SAFE DEFAULT: when auth is disabled, just no-op successfully. The
  // dashboard is fully open, so there's nothing to sign in to.
  if (!secret) {
    return NextResponse.json({ ok: true, authEnabled: false });
  }

  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many failed attempts. Try again in a minute.' },
      { status: 429 },
    );
  }

  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supplied = typeof body.password === 'string' ? body.password : '';
  if (!supplied) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 });
  }

  // Constant-time compare so an attacker can't probe one character at a
  // time via timing differences.
  if (!constantTimeEqual(supplied, secret)) {
    recordFailure(ip);
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  // Auth succeeded — clear any prior failures and mint a cookie.
  clearFailures(ip);
  const cookieValue = await signSessionCookie(secret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
