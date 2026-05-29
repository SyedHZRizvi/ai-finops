/**
 * Tiny client-side helpers for the auth flow. Kept separate from
 * `src/lib/auth.ts` so that module (which lives in the bundle that
 * middleware uses) doesn't accidentally pull in client-only code.
 */

/**
 * POST to /api/auth/logout and best-effort navigate to /login. Network
 * errors are silently swallowed — at worst the user clicks again. We never
 * throw because callers (button click handlers) shouldn't need try/catch.
 */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    // Ignore — we still want to navigate.
  }
  // Hard navigation so the middleware sees the now-missing cookie on the
  // very next request. Using window.location instead of next/navigation's
  // router avoids any client-side caching surprises.
  if (typeof window !== 'undefined') {
    window.location.assign('/login');
  }
}
