// Theme management — small, framework-agnostic helpers.
//
// The user's choice is one of three values:
//   - 'light'  — always light, regardless of OS preference.
//   - 'dark'   — always dark, regardless of OS preference.
//   - 'system' — follows `prefers-color-scheme`.
//
// `applyTheme` resolves 'system' to the live media query result and writes
// the resolved value to `<html data-theme>`. The CSS variables in
// globals.css key off that attribute.

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'finops:theme';
export const THEME_CHANGE_EVENT = 'finops:theme-changed';

const VALID_THEMES: Theme[] = ['light', 'dark', 'system'];

/**
 * Read the persisted theme preference, falling back to 'dark' when nothing
 * is stored (or when storage is unavailable, e.g. private browsing).
 *
 * Returns 'dark' on the server, since localStorage is undefined there. The
 * inline boot script handles the very-first paint on the client; this
 * function exists for React-land reads after hydration.
 */
export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw && (VALID_THEMES as string[]).includes(raw)) {
      return raw as Theme;
    }
  } catch {
    // ignore — quota or disabled storage
  }
  return 'dark';
}

/**
 * Resolve 'system' to the live OS preference. 'light'/'dark' pass through.
 * Always returns 'dark' on the server (no media query available).
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'light' || theme === 'dark') return theme;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Apply the theme to the document — writes data-theme to <html> and
 * persists the choice. Dispatches a 'finops:theme-changed' window event
 * so other tabs / components can react.
 *
 * No-op on the server.
 */
export function applyTheme(theme: Theme): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute('data-theme', resolved);

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }

  // Notify listeners. CustomEvent is widely supported and gives us a
  // structured payload.
  try {
    window.dispatchEvent(
      new CustomEvent<{ theme: Theme; resolved: ResolvedTheme }>(THEME_CHANGE_EVENT, {
        detail: { theme, resolved },
      }),
    );
  } catch {
    // ignore — old browsers
  }
}

/**
 * Subscribe to OS theme changes. Useful when the user picks 'system' —
 * the page should re-resolve when the OS flips dark/light.
 *
 * Returns an unsubscribe function. No-op on the server.
 */
export function watchSystemTheme(
  handler: (theme: ResolvedTheme) => void,
): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const mql = window.matchMedia('(prefers-color-scheme: light)');
  function onChange(e: MediaQueryListEvent) {
    handler(e.matches ? 'light' : 'dark');
  }
  // addEventListener is standard; older Safari needs addListener. We feature-
  // detect rather than ship a polyfill.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }
  // Older Safari fallback.
  const legacy = mql as MediaQueryList & {
    addListener: (cb: (e: MediaQueryListEvent) => void) => void;
    removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
  };
  legacy.addListener(onChange);
  return () => legacy.removeListener(onChange);
}
