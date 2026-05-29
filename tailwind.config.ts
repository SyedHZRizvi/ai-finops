import type { Config } from 'tailwindcss';

// Tailwind colors map to CSS custom properties defined in src/app/globals.css.
// The same utility class (text-muted, bg-panel, etc.) automatically picks the
// dark or light value based on `<html data-theme="...">`.
//
// IMPORTANT: each color is stored in CSS as an RGB triplet (e.g. "139 92 246",
// no rgb() wrapper) so Tailwind's opacity-modifier syntax — `bg-brand/40`,
// `border-good/30`, etc. — keeps working. The wrapper here resolves to
// `rgb(139 92 246 / 0.4)` etc. at build time.
//
// The brand gradient keeps its literal hex values because the purple-to-cyan
// gradient is a brand fixture that reads well on both light and dark surfaces.

function v(name: string): string {
  return `rgb(var(--color-${name}) / <alpha-value>)`;
}

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base — flips between dark navy and warm off-white via CSS vars.
        bg: v('bg'),
        panel: v('panel'),
        panel2: v('panel2'),
        panel3: v('panel3'),
        border: v('border'),
        borderBright: v('border-bright'),
        ink: v('ink'),
        inkDim: v('ink-dim'),
        muted: v('muted'),
        // Brand — vivid purple-to-cyan; desaturated for light mode.
        brand: v('brand'),
        brandLight: v('brand-light'),
        brand2: v('brand2'),
        brand2Light: v('brand2-light'),
        // Status — tuned darker in light mode for AA contrast.
        good: v('good'),
        goodGlow: v('good-glow'),
        warn: v('warn'),
        warnGlow: v('warn-glow'),
        bad: v('bad'),
        badGlow: v('bad-glow'),
        // Accent — for category color coding.
        pink: v('pink'),
        blue: v('blue'),
        lime: v('lime'),
        amber: v('amber'),
        rose: v('rose'),
        teal: v('teal'),
        indigo: v('indigo'),
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
