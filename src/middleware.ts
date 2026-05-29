import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  getAuthSecret,
  verifySessionCookie,
} from '@/lib/auth';

/**
 * Optional password gate. When no password is configured, this middleware is
 * a no-op — every request flows through untouched. When a password IS
 * configured, it gates pages (redirect to /login) and API routes (401 JSON)
 * except for a small allowlist below.
 *
 * The default-off behavior is critical: read the very first lines of the
 * matcher below. If `getAuthSecret()` returns null we bail BEFORE touching
 * cookies, paths, or anything else.
 */

// Public paths that stay open even when auth is enabled. SDK ingest needs to
// keep working without browser session cookies; health probes need to be
// reachable by uptime monitors; static assets are pointless to protect.
const PUBLIC_PATH_PREFIXES = [
  '/api/log', // SDK ingest — clients use their own bearer token
  '/api/stream', // SSE live ticker; harmless metadata, monitors may need it
  '/_next', // Next.js build assets
];

const PUBLIC_PATH_EXACT = new Set<string>([
  '/api/health', // uptime probes
  '/favicon.svg',
  '/og-default.svg',
  '/robots.txt',
  '/sitemap.xml',
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATH_EXACT.has(pathname)) return true;
  for (const prefix of PUBLIC_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // SAFE DEFAULT: auth is opt-in. If no password is configured, every
  // request flows through untouched. This branch MUST come first.
  const secret = getAuthSecret();
  if (!secret) return NextResponse.next();

  const { pathname, search } = req.nextUrl;

  // The login page and its API endpoint must always be reachable, otherwise
  // there's no way to acquire a cookie. Logout also bypasses (no-op when
  // already signed out).
  if (
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout'
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const ok = cookie ? await verifySessionCookie(cookie, secret) : false;
  if (ok) return NextResponse.next();

  // Unauthenticated. API requests get JSON 401 so SDKs/fetch callers don't
  // accidentally parse an HTML login page. Page requests get redirected to
  // /login with a `next` param so we can bounce them back after sign-in.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  // Preserve the original path (and query) so the login form can bounce
  // them back. Skip the bounce for the root path — it's the default anyway.
  if (pathname !== '/') {
    loginUrl.searchParams.set('next', pathname + (search || ''));
  }
  return NextResponse.redirect(loginUrl);
}

/**
 * Run on everything except the Next.js internals and static files. We do the
 * public-path filtering inside `middleware()` because the matcher can't
 * express "everything except this small list" cleanly across both pages and
 * API routes.
 *
 * The matcher excludes: _next/static, _next/image, favicon, and a few common
 * static extensions — these never need an auth check and skipping them in
 * the matcher avoids invoking the function unnecessarily.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf)$).*)',
  ],
};
