'use client';
import { useCallback } from 'react';

// Imperative open/close bridge for the Cmd+K command palette.
//
// CommandPalette is mounted once at the root and listens for two custom
// events on `window`. Any client component can call `openPalette()` to
// surface it without importing CommandPalette directly — keeping the
// dependency graph one-way and avoiding circular imports.

export const PALETTE_OPEN_EVENT = 'finops:open-palette';
export const PALETTE_CLOSE_EVENT = 'finops:close-palette';

export interface UseCommandPalette {
  /** Open the palette from anywhere. */
  openPalette: () => void;
  /** Close the palette from anywhere. */
  closePalette: () => void;
}

export function useCommandPalette(): UseCommandPalette {
  const openPalette = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(PALETTE_OPEN_EVENT));
  }, []);

  const closePalette = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(PALETTE_CLOSE_EVENT));
  }, []);

  return { openPalette, closePalette };
}
