import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Clear the session cookie. Safe to call even when auth is disabled — in
 * that case there's nothing to clear and we just return ok.
 */
export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  // Setting maxAge: 0 with the same name+path is the most reliable way to
  // expire the cookie across browsers (vs. delete(), which some platforms
  // implement differently).
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
