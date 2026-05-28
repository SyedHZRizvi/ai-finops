import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0b0e',
        panel: '#12141a',
        panel2: '#181b23',
        border: '#262a36',
        ink: '#e5e7eb',
        muted: '#8b92a5',
        brand: '#7c5cff',
        brand2: '#22d3ee',
        good: '#22c55e',
        warn: '#f59e0b',
        bad: '#ef4444',
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
