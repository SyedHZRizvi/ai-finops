'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyTheme,
  getInitialTheme,
  resolveTheme,
  watchSystemTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type Theme,
} from '@/lib/theme';

// ThemeProvider — owns the user's theme choice and exposes it via context.
//
// Important: the FIRST paint is handled by the inline boot script in
// src/lib/themeBootScript.ts (injected into <head> by layout.tsx). That
// script writes data-theme on <html> before React hydrates. This provider
// then takes over for runtime updates.
//
// The provider:
//   1. Reads the stored choice on mount (defaulting to 'dark').
//   2. Watches the OS preference when the choice is 'system' so the page
//      re-resolves on dark/light flips.
//   3. Listens to the storage event so a change in another tab propagates.
//
// We deliberately render children regardless of hydration state — the
// inline boot script means the CSS variables are already correct on the
// very first paint, so there's no flash to hide.

interface ThemeContextValue {
  /** The user's choice. */
  theme: Theme;
  /** The currently-applied light/dark value (resolves 'system'). */
  resolved: ResolvedTheme;
  /** Set the user's choice and apply it. */
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default to 'dark' on first render to match the SSR-safe default. The
  // useEffect below corrects this from localStorage on hydration.
  const [theme, setThemeState] = useState<Theme>('dark');
  const [resolved, setResolved] = useState<ResolvedTheme>('dark');

  // Hydrate from storage on first client render. The inline boot script
  // already updated <html data-theme>; we just need to sync React state.
  useEffect(() => {
    const initial = getInitialTheme();
    setThemeState(initial);
    setResolved(resolveTheme(initial));
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setResolved(resolveTheme(next));
    applyTheme(next);
  }, []);

  // Re-resolve when the OS flips dark/light AND the user is on 'system'.
  useEffect(() => {
    if (theme !== 'system') return;
    const stop = watchSystemTheme((sys) => {
      setResolved(sys);
      // Re-apply so data-theme on <html> matches the OS, but don't change
      // the stored choice (it stays 'system').
      applyTheme('system');
    });
    return stop;
  }, [theme]);

  // Cross-tab sync — if the user toggles in another tab, mirror here.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next = (e.newValue as Theme | null) ?? 'dark';
      if (next === 'light' || next === 'dark' || next === 'system') {
        setThemeState(next);
        setResolved(resolveTheme(next));
        // Note: don't call applyTheme — the other tab already wrote
        // the data-theme attribute via its own applyTheme call, and we'd
        // create an event loop. Just update local React state.
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', resolveTheme(next));
        }
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Read the current theme + setter from context.
 *
 * Safe to call outside the provider — returns a default-dark snapshot with
 * a no-op setter. This keeps individual components from crashing in tests
 * or storybook contexts.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  return {
    theme: 'dark',
    resolved: 'dark',
    setTheme: () => undefined,
  };
}
