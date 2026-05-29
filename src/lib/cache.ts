// Tiny in-memory cache for server-side fetches.
//
// IMPORTANT — serverless caveat:
//   The Map below is *per-process*. In a single long-running container
//   (Docker, Electron, `next start` on a VPS) this works fine — repeated
//   calls share the cache. On serverless (Vercel, Lambda, Cloud Run) each
//   cold start gets a fresh Map, and concurrent invocations get separate
//   caches. Use this for in-flight dedupe and hot-path memoization, NOT
//   as a persistent or shared layer. For that, use Redis or a CDN.
//
// Bypass rules:
//   - When NODE_ENV !== 'production', caching is disabled entirely so
//     local development always sees fresh data.
//   - When called from a request where the URL has `?nocache=1`, the
//     caller is responsible for short-circuiting (we expose a helper
//     `shouldBypass(url)` for that).

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // epoch ms
}

// Module-scope store. Using `unknown` here avoids leaking a generic
// type across module boundaries; each `cached<T>` call narrows it.
const store = new Map<string, CacheEntry<unknown>>();

/**
 * Returns true if the in-memory cache should be skipped for this call.
 * Always true in development. Also true when the request URL contains
 * the `nocache=1` query string, which is useful when manually testing.
 */
export function shouldBypass(requestUrl?: string | URL | null): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  if (!requestUrl) return false;
  try {
    const url = typeof requestUrl === 'string' ? new URL(requestUrl, 'http://localhost') : requestUrl;
    return url.searchParams.get('nocache') === '1';
  } catch {
    return false;
  }
}

/**
 * Memoize an async fetch by key for `ttlSeconds`. Subsequent calls
 * with the same key within the TTL return the cached value without
 * invoking the fetcher.
 *
 * Errors are NOT cached — a failed fetcher throws and the next call
 * will retry. This avoids the "stuck at error" failure mode where a
 * one-off DB hiccup poisons the cache for the whole TTL.
 *
 * @param key         Unique cache key.
 * @param ttlSeconds  How long a successful result remains valid.
 * @param fetcher     Async function to invoke on cache miss.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  // Hard bypass in non-production. Still call the fetcher so callers
  // experience the same shape (network, error semantics) as in prod.
  if (process.env.NODE_ENV !== 'production') {
    return fetcher();
  }

  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }

  const value = await fetcher();
  store.set(key, {
    value,
    expiresAt: now + Math.max(0, ttlSeconds) * 1000,
  });
  return value;
}

/**
 * Manually invalidate a key. Useful after a mutation so the next read
 * goes back to the source of truth. No-op if the key doesn't exist.
 */
export function invalidate(key: string): void {
  store.delete(key);
}

/**
 * Clear every entry. Intended for tests and for the rare case where
 * the schema/shape changes at runtime.
 */
export function clearCache(): void {
  store.clear();
}
