'use client';
import { useTheme } from './ThemeProvider';
import type { Theme } from '@/lib/theme';

// 3-button segmented control: Light / System / Dark.
//
// Accessibility:
//   - `role="radiogroup"` + per-button `role="radio"` + `aria-checked` is
//     the WAI-ARIA pattern for an exclusive segmented selector.
//   - Each button carries a visible icon plus an `aria-label` describing
//     the option in words ("Light theme", etc.).
//   - The whole group is labelled by an offscreen <legend>-style span so
//     screen readers announce "Theme" before the options.
//   - Keyboard: clicking is enough because we render real <button>s; the
//     parent <fieldset> handles tab order.

interface Option {
  value: Theme;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
}

const OPTIONS: Option[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
];

interface ThemeToggleProps {
  /** Optional label rendered above the control (purely decorative — the
   *  radiogroup is also `aria-labelledby` via the same id). */
  label?: string;
  className?: string;
}

export function ThemeToggle({ label = 'Appearance', className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={className}>
      {label ? (
        <div id="theme-toggle-label" className="label mb-2">
          {label}
        </div>
      ) : null}
      <div
        role="radiogroup"
        aria-labelledby={label ? 'theme-toggle-label' : undefined}
        aria-label={label ? undefined : 'Theme'}
        className="inline-flex items-center gap-1 p-1 rounded-xl border border-border bg-panel2"
      >
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${opt.label} theme`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTheme(opt.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 focus-ring ${
                active
                  ? 'bg-brand/15 text-brandLight border border-brand/30 shadow-glow'
                  : 'text-muted hover:text-ink hover:bg-panel3 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -- Icons --
// Inline strokes; keep them dependency-free and themable via currentColor.

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
