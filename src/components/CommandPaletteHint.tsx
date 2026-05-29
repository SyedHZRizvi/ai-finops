'use client';
import { useEffect, useState } from 'react';
import { useCommandPalette } from '@/lib/useCommandPalette';

// Subtle "press Cmd+K" chip that doubles as a click-to-open trigger.
//
// Two design jobs:
//   1. Teach first-time visitors that Cmd+K exists. The chip is small,
//      always visible, and shows the actual key glyphs the user will
//      press — which is the most legible form of pedagogy.
//   2. Provide a non-keyboard escape hatch. Tap/click anywhere and the
//      palette opens via the same custom event the keyboard binds to.
//
// We render `Ctrl` on non-macOS hosts so the hint stays accurate cross-OS.
// Detection runs once on mount to avoid SSR/hydration mismatch — server
// always renders the macOS glyph, the client patches it on hydration.
//
// The chip ships with `className` overridable so the parent layout can
// place it inside the nav, in a footer, or floating in a corner without
// re-styling the inner contents.

interface CommandPaletteHintProps {
  /** Replace the default classes; pass to control sizing/placement. */
  className?: string;
  /** Hide the "Search" label when there's no room for it. */
  compact?: boolean;
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return true;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

export function CommandPaletteHint({
  className,
  compact = false,
}: CommandPaletteHintProps = {}) {
  const { openPalette } = useCommandPalette();
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(detectMac());
  }, []);

  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label="Open command palette"
      title="Open command palette (Cmd+K)"
      className={
        className ??
        'inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-panel2/60 hover:bg-panel2 hover:border-borderBright text-muted hover:text-ink transition-colors duration-150 group'
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="w-3.5 h-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" strokeLinecap="round" />
        <line x1="20" y1="20" x2="16.65" y2="16.65" strokeLinecap="round" />
      </svg>
      {!compact ? (
        <span className="text-xs font-medium hidden sm:inline">Search</span>
      ) : null}
      <span className="flex items-center gap-1" aria-hidden>
        <kbd className="inline-flex items-center justify-center text-[10px] font-mono leading-none px-1.5 py-0.5 rounded-md border border-border bg-panel text-muted group-hover:text-ink transition-colors">
          {isMac ? '⌘' : 'Ctrl'}
        </kbd>
        <kbd className="inline-flex items-center justify-center text-[10px] font-mono leading-none px-1.5 py-0.5 rounded-md border border-border bg-panel text-muted group-hover:text-ink transition-colors">
          K
        </kbd>
      </span>
    </button>
  );
}
