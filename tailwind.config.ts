import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base — deeper black with a subtle blue undertone
        bg: '#070810',
        panel: '#0f1018',
        panel2: '#181a26',
        panel3: '#1f2230',
        border: '#262a3a',
        borderBright: '#363b50',
        ink: '#f3f4f8',
        inkDim: '#c9cbd6',
        muted: '#7b829a',
        // Brand — vivid purple-to-cyan gradient pair
        brand: '#8b5cf6',
        brandLight: '#a78bfa',
        brand2: '#22d3ee',
        brand2Light: '#67e8f9',
        // Status — saturated, dark-mode-tuned
        good: '#22c55e',
        goodGlow: '#15803d',
        warn: '#f59e0b',
        warnGlow: '#b45309',
        bad: '#ef4444',
        badGlow: '#991b1b',
        // Accent — for category color coding
        pink: '#ec4899',
        blue: '#3b82f6',
        lime: '#84cc16',
        amber: '#f59e0b',
        rose: '#f43f5e',
        teal: '#14b8a6',
        indigo: '#6366f1',
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
        card: '0 2px 8px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.02) inset',
        'card-hover': '0 8px 24px rgba(139, 92, 246, 0.15), 0 0 0 1px rgba(139,92,246,0.2) inset',
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
