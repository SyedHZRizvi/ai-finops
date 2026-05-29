// Inline boot script — injected via `<script dangerouslySetInnerHTML>` in
// the root layout so it runs SYNCHRONOUSLY before React hydration.
//
// Why this exists:
//   The theme depends on localStorage, which is client-only. Without this
//   inline pass, the page first paints in whatever theme the SSR'd CSS
//   defaults to (dark) — and only after hydration does the React provider
//   correct it. That flash is jarring, especially for light-mode users.
//
// The string is hand-rolled vanilla JS (not TypeScript) because it has to
// be valid as raw <script> text. It's wrapped in IIFE + try/catch so a
// disabled-storage browser silently falls back to dark.
//
// Keep the storage key in sync with src/lib/theme.ts THEME_STORAGE_KEY.

export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('finops:theme')||'dark';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
