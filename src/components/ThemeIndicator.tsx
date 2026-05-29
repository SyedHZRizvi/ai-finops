'use client';
import { useTheme } from './ThemeProvider';

// Tiny footer chip that surfaces the current resolved theme. Renders
// nothing on the server-side first render (theme is hydrated client-side)
// to avoid a hydration mismatch — once the ThemeProvider syncs from
// localStorage, the chip appears with the right value.
//
// Useful as a passive indicator in the footer or status row; it doesn't
// double as a toggle to keep concerns separate.

export function ThemeIndicator({ className }: { className?: string } = {}) {
  const { theme, resolved } = useTheme();

  const dot = resolved === 'light' ? 'bg-amber' : 'bg-indigo';
  const label = resolved === 'light' ? 'Light' : 'Dark';
  const detail = theme === 'system' ? ' · auto' : '';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-muted ${className ?? ''}`}
      aria-label={`Current theme: ${label}${detail}`}
      title={`Theme: ${theme}`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`}
        aria-hidden
      />
      <span>
        {label}
        {detail}
      </span>
    </span>
  );
}
