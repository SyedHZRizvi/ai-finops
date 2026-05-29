import type { Config } from 'tailwindcss';

// Tailwind colors map to CSS custom properties defined in src/app/globals.css.
// The same utility class (text-muted, bg-panel, etc.) automatically picks the
// dark or light value based on `<html data-theme="...">`.
//
// The brand gradient keeps its literal hex values because the purple-to-cyan
// gradient is a brand fixture that reads well on both light and dark surfaces.

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base — flips between dark navy and warm off-white via CSS vars.
        bg: 'var(--color-bg)',
        panel: 'var(--color-panel)',
        panel2: 'var(--color-panel2)',
        panel3: 'var(--color-panel3)',
        border: 'var(--color-border)',
        borderBright: 'var(--color-border-bright)',
        ink: 'var(--color-ink)',
        inkDim: 'var(--color-ink-dim)',
        muted: 'var(--color-muted)',
        // Brand — vivid purple-to-cyan; desaturated for light mode.
        brand: 'var(--color-brand)',
        brandLight: 'var(--color-brand-light)',
        brand2: 'var(--color-brand2)',
        brand2Light: 'var(--color-brand2-light)',
        // Status — tuned darker in light mode for AA contrast.
        good: 'var(--color-good)',
        goodGlow: 'var(--color-good-glow)',
        warn: 'var(--color-warn)',
        warnGlow: 'var(--color-warn-glow)',
        bad: 'var(--color-bad)',
        badGlow: 'var(--color-bad-glow)',
        // Accent — for category color coding.
        pink: 'var(--color-pink)',
        blue: 'var(--color-blue)',
        lime: 'var(--color-lime)',
        amber: 'var(--color-amber)',
        rose: 'var(--color-rose)',
        teal: 'var(--color-teal)',
        indigo: 'var(--color-indigo)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #8b5cf6 0%, #22d3ee 100%)',
        'brand-radial': 'radial-gradient(circle at 30% 30%, #8b5cf6 0%, transparent 60%)',
        'good-gradient': 'linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)',
        'warn-gradient': 'linear-gradient(135deg, #f59e0b 0%, #f43f5e 100%)',
        'bad-gradient': 'linear-gradient(135deg, #ef4444 0%, #ec4899 100%)',
        'panel-gradient': 'linear-gradient(180deg, #181a26 0%, #0f1018 100%)',
        mesh: 'radial-gradient(at 0% 0%, rgba(139,92,246,0.15) 0px, transparent 50%), radial-gradient(at 98% 0%, rgba(34,211,238,0.10) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(236,72,153,0.08) 0px, transparent 50%)',
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(139, 92, 246, 0.5)',
        'glow-cyan': '0 0 40px -10px rgba(34, 211, 238, 0.5)',
        'glow-green': '0 0 40px -10px rgba(34, 197, 94, 0.4)',
        'glow-amber': '0 0 40px -10px rgba(245, 158, 11, 0.4)',
        // card + card-hover read from CSS vars so light mode gets a softer shadow.
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
