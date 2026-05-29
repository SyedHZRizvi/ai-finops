'use client';
import { useEffect, useRef } from 'react';

// Generic keyboard shortcut hook.
//
// Accepts a string like:
//   - "cmd+k"   — Cmd on macOS, Ctrl elsewhere. Same callback for both.
//   - "ctrl+k"  — strictly Ctrl.
//   - "meta+k"  — strictly Cmd/Win key.
//   - "shift+/" — modifier + literal key.
//   - "g d"     — two-key sequence (press g, then d within 1.2s).
//   - "/"       — single literal key.
//
// Inputs / textareas / contenteditable elements are ignored by default so
// typing inside a search field doesn't trigger global shortcuts. Pass
// `allowInInput: true` to override (we use this for Cmd+K so the palette
// reachable even while focused on the search input that, ironically,
// lives inside the palette itself).
//
// Sequences are matched via a 1.2s window: after the first key matches we
// arm a short timeout; if the second key arrives within the window we
// fire. Pressing any other key cancels the pending sequence.

const SEQUENCE_WINDOW_MS = 1200;

interface ParsedShortcut {
  /** "single", "combo" (modifiers + one key), or "sequence" (two keys). */
  kind: 'single' | 'combo' | 'sequence';
  /** For combo / single. Lowercase. */
  key?: string;
  /** For sequence. Lowercase. */
  first?: string;
  second?: string;
  /** For combo only. */
  cmdOrCtrl?: boolean; // "cmd+x" — Cmd on macOS, Ctrl elsewhere
  meta?: boolean;      // strictly Cmd / Win key
  ctrl?: boolean;      // strictly Ctrl
  shift?: boolean;
  alt?: boolean;
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

function parse(shortcut: string): ParsedShortcut {
  const trimmed = shortcut.trim().toLowerCase();
  // Sequence: two tokens separated by a space, no modifier syntax.
  if (/\s/.test(trimmed) && !trimmed.includes('+')) {
    const parts = trimmed.split(/\s+/);
    return { kind: 'sequence', first: parts[0], second: parts[1] };
  }
  // Combo: tokens joined by `+`. Last token is the key.
  if (trimmed.includes('+')) {
    const parts = trimmed.split('+').map((p) => p.trim());
    const key = parts.pop() ?? '';
    const mods = new Set(parts);
    return {
      kind: 'combo',
      key,
      cmdOrCtrl: mods.has('cmd') || mods.has('mod'),
      meta: mods.has('meta'),
      ctrl: mods.has('ctrl'),
      shift: mods.has('shift'),
      alt: mods.has('alt') || mods.has('option'),
    };
  }
  return { kind: 'single', key: trimmed };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function matchesCombo(e: KeyboardEvent, p: ParsedShortcut): boolean {
  if (p.key === undefined) return false;
  if (e.key.toLowerCase() !== p.key) return false;
  // cmdOrCtrl: Cmd (meta) on Mac, Ctrl elsewhere.
  if (p.cmdOrCtrl) {
    const ok = isMac() ? e.metaKey : e.ctrlKey;
    if (!ok) return false;
  }
  if (p.meta && !e.metaKey) return false;
  if (p.ctrl && !e.ctrlKey) return false;
  if (p.shift && !e.shiftKey) return false;
  if (p.alt && !e.altKey) return false;
  return true;
}

export interface UseShortcutOptions {
  /** Allow the shortcut to fire while focused inside an input/textarea. */
  allowInInput?: boolean;
  /** Disable the hook without unmounting. */
  enabled?: boolean;
  /** Prevent the browser default when the shortcut fires. Default true. */
  preventDefault?: boolean;
}

export function useShortcut(
  shortcut: string,
  handler: (e: KeyboardEvent) => void,
  options: UseShortcutOptions = {},
): void {
  const { allowInInput = false, enabled = true, preventDefault = true } = options;
  // Hold handler in a ref so callers don't need to memoize.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const parsed = parse(shortcut);

    // For sequences we hold the timeout id between events so we can clear it.
    let pendingSequence = false;
    let timeoutHandle: number | null = null;

    function cancelSequence() {
      pendingSequence = false;
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    }

    function onKey(e: KeyboardEvent) {
      // Ignore key repeats — they confuse sequence matching.
      if (e.repeat) return;
      if (!allowInInput && isTypingTarget(e.target)) return;

      if (parsed.kind === 'combo') {
        if (matchesCombo(e, parsed)) {
          if (preventDefault) e.preventDefault();
          handlerRef.current(e);
        }
        return;
      }

      if (parsed.kind === 'single') {
        // Reject any modifier press for a "bare" shortcut.
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key.toLowerCase() === parsed.key) {
          if (preventDefault) e.preventDefault();
          handlerRef.current(e);
        }
        return;
      }

      // Sequence.
      if (e.metaKey || e.ctrlKey || e.altKey) {
        cancelSequence();
        return;
      }
      const k = e.key.toLowerCase();
      if (!pendingSequence) {
        if (k === parsed.first) {
          pendingSequence = true;
          timeoutHandle = window.setTimeout(cancelSequence, SEQUENCE_WINDOW_MS);
        }
        return;
      }
      // Pending: this key MUST be the second key or we cancel.
      if (k === parsed.second) {
        if (preventDefault) e.preventDefault();
        cancelSequence();
        handlerRef.current(e);
      } else {
        cancelSequence();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      cancelSequence();
    };
  }, [shortcut, allowInInput, enabled, preventDefault]);
}
