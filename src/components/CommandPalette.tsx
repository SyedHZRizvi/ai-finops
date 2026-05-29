'use client';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  COMMANDS,
  type CommandItem,
  type CommandIcon,
  type CommandSection,
} from '@/lib/commands';
import { fuzzyMatch, type FuzzyResult } from '@/lib/fuzzy';
import { PALETTE_CLOSE_EVENT, PALETTE_OPEN_EVENT } from '@/lib/useCommandPalette';
import { useShortcut } from '@/lib/useShortcut';

// Cmd+K command palette.
//
// Mounting model:
//   - Rendered once at the root layout level.
//   - Listens on `window` for `finops:open-palette` / `finops:close-palette`
//     so anywhere in the app can open it without importing this component.
//   - Also binds Cmd+K (Ctrl+K elsewhere) and `/` directly.
//
// State:
//   - `open` — visibility flag.
//   - `query` — current search input.
//   - `selectedIndex` — keyboard cursor into the FLATTENED visible list.
//     We rebuild the flat order whenever the filtered list changes so the
//     cursor never falls off the end.
//   - `recent` — id list persisted to localStorage, capped at 5.
//
// We deliberately keep the modal simple — no portal, just a top-level fixed
// container at z-[120] so it sits above Nav (z-20) and Tour (z-[100]).

const RECENT_KEY = 'finops:recent-commands';
const RECENT_MAX = 5;
const RESULT_LIMIT = 60;

interface VisibleEntry {
  command: CommandItem;
  fuzzy: FuzzyResult;
}

type GroupedSection = {
  section: CommandSection | 'Recent';
  entries: VisibleEntry[];
};

// Stable display order of sections — must contain every section used by
// COMMANDS. "Recent" only appears when the query is empty.
const SECTION_ORDER: CommandSection[] = [
  'Navigate',
  'Actions',
  'Connectors',
  'Documentation',
  'Help',
];

function readRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function writeRecent(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, RECENT_MAX)));
  } catch {
    // ignore quota / disabled storage
  }
}

/**
 * Build the visible list grouped by section, with "Recent" prepended when
 * the query is empty. Filtering uses the union of title + subtitle +
 * keywords; we run fuzzyMatch once against that concatenated haystack so
 * a single character can match into any of those fields.
 */
function buildVisible(query: string, recent: string[]): GroupedSection[] {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    // No query: show Recent first, then every command grouped by section.
    const sections: GroupedSection[] = [];

    if (recent.length > 0) {
      const byId = new Map(COMMANDS.map((c) => [c.id, c]));
      const recentCommands = recent
        .map((id) => byId.get(id))
        .filter((c): c is CommandItem => c !== undefined);
      if (recentCommands.length > 0) {
        sections.push({
          section: 'Recent',
          entries: recentCommands.map((c) => ({
            command: c,
            fuzzy: { score: 0, matched: true, indices: [] },
          })),
        });
      }
    }

    for (const section of SECTION_ORDER) {
      const entries = COMMANDS.filter((c) => c.section === section).map((c) => ({
        command: c,
        fuzzy: { score: 0, matched: true, indices: [] },
      }));
      if (entries.length > 0) sections.push({ section, entries });
    }
    return sections;
  }

  // With a query: fuzzy match everything, sort by score descending, group.
  const matches: VisibleEntry[] = [];
  for (const command of COMMANDS) {
    const haystack = [command.title, command.subtitle ?? '', command.keywords ?? '']
      .filter((s) => s.length > 0)
      .join(' · ');
    const fuzzy = fuzzyMatch(trimmed, haystack);
    if (!fuzzy.matched) continue;
    // Also try matching the title alone — if it scores higher, prefer those
    // indices for highlighting because they're the visible text.
    const titleMatch = fuzzyMatch(trimmed, command.title);
    const best = titleMatch.matched && titleMatch.score >= fuzzy.score - 0.1
      ? titleMatch
      : fuzzy;
    matches.push({ command, fuzzy: best });
  }

  matches.sort((a, b) => b.fuzzy.score - a.fuzzy.score);
  const capped = matches.slice(0, RESULT_LIMIT);

  const sections: GroupedSection[] = [];
  for (const section of SECTION_ORDER) {
    const entries = capped.filter((m) => m.command.section === section);
    if (entries.length > 0) sections.push({ section, entries });
  }
  return sections;
}

/** Flatten grouped sections into a single ordered list for keyboard navigation. */
function flatten(grouped: GroupedSection[]): VisibleEntry[] {
  return grouped.flatMap((g) => g.entries);
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Hydrate recent once on mount. We intentionally don't read on every open
  // — the in-memory copy is the source of truth after first hydration.
  useEffect(() => {
    setRecent(readRecent());
  }, []);

  // Listen for external open/close events.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    function onClose() {
      setOpen(false);
    }
    window.addEventListener(PALETTE_OPEN_EVENT, onOpen);
    window.addEventListener(PALETTE_CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(PALETTE_OPEN_EVENT, onOpen);
      window.removeEventListener(PALETTE_CLOSE_EVENT, onClose);
    };
  }, []);

  // Cmd+K / Ctrl+K from anywhere — including inputs. The whole point is
  // instant access; users routinely hit it from form fields.
  useShortcut('cmd+k', () => setOpen((v) => !v), { allowInInput: true });

  // `/` from anywhere EXCEPT typing targets. Native browser quick-find on
  // Firefox uses `/`, but our intent is to mimic Slack/Linear/Notion which
  // all override it for in-app search. We still respect typing targets so
  // the slash key stays usable inside the palette and other inputs.
  useShortcut('/', () => setOpen(true), { allowInInput: false });

  // Reset transient state every time the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    // Focus the input on the next frame — focusing during the render of an
    // animated modal can race with the browser's focus-trap fallback.
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const grouped = useMemo(() => buildVisible(query, recent), [query, recent]);
  const flat = useMemo(() => flatten(grouped), [grouped]);

  // Clamp the cursor whenever the visible list shrinks.
  useEffect(() => {
    if (selectedIndex >= flat.length) {
      setSelectedIndex(flat.length === 0 ? 0 : flat.length - 1);
    }
  }, [flat.length, selectedIndex]);

  // Keep the highlighted item in view as the cursor moves with the keyboard.
  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [open, selectedIndex]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const runEntry = useCallback(
    async (entry: VisibleEntry) => {
      const cmd = entry.command;
      // Record into recent BEFORE running so navigation/page changes
      // don't beat the persistence.
      setRecent((prev) => {
        const next = [cmd.id, ...prev.filter((id) => id !== cmd.id)].slice(0, RECENT_MAX);
        writeRecent(next);
        return next;
      });
      close();
      try {
        await cmd.run(router);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CommandPalette] command threw:', err);
      }
    },
    [close, router],
  );

  // Local keyboard handler — runs only while the palette is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) =>
          flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length,
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const entry = flat[selectedIndex];
        if (entry) void runEntry(entry);
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, flat, selectedIndex, runEntry, close]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      aria-labelledby="command-palette-title"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-start justify-center pt-[12vh] px-4"
    >
      {/* Visually hidden title — gives `aria-labelledby` something to point at
          while keeping the visible UI dedicated to the search input. */}
      <h2 id="command-palette-title" className="sr-only">
        Command palette
      </h2>
      {/* Backdrop — click to close. */}
      <button
        type="button"
        aria-label="Close command palette"
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 bg-bg/70 backdrop-blur-sm transition-opacity duration-200 cursor-default"
      />

      {/* Modal. */}
      <div
        className="relative w-full max-w-[600px] max-h-[70vh] flex flex-col rounded-2xl border border-borderBright bg-panel/95 backdrop-blur-xl shadow-card-hover fade-up overflow-hidden"
      >
        {/* Gradient accent strip along the top edge — matches Tour. */}
        <div
          className="absolute top-0 left-4 right-4 h-px pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.6) 30%, rgba(34,211,238,0.6) 70%, transparent 100%)',
          }}
          aria-hidden
        />

        {/* Search input row. */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <IconSearch className="w-4 h-4 text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search…"
            aria-label="Search commands"
            className="flex-1 bg-transparent outline-none border-0 text-sm placeholder:text-muted text-ink"
          />
          <kbd className="hidden sm:inline-flex items-center justify-center text-[10px] font-mono px-1.5 py-0.5 rounded-md border border-border bg-panel2 text-muted">
            esc
          </kbd>
        </div>

        {/* Results list. */}
        <div className="flex-1 overflow-y-auto py-2">
          {flat.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-sm text-inkDim mb-1">No matches.</div>
              <div className="text-xs text-muted">Try a different keyword.</div>
            </div>
          ) : (
            grouped.map((group, gi) => {
              // Compute the starting flat-index for this group so each
              // button knows its own absolute index for keyboard nav.
              const startIndex = grouped
                .slice(0, gi)
                .reduce((acc, g) => acc + g.entries.length, 0);
              return (
                <div key={group.section} className="px-2 pb-2">
                  <div className="label px-3 pt-3 pb-1.5">{group.section}</div>
                  <div className="flex flex-col">
                    {group.entries.map((entry, ei) => {
                      const flatIdx = startIndex + ei;
                      const isSelected = flatIdx === selectedIndex;
                      return (
                        <ResultRow
                          key={entry.command.id}
                          ref={(el) => {
                            itemRefs.current[flatIdx] = el;
                          }}
                          entry={entry}
                          query={query}
                          selected={isSelected}
                          onHover={() => setSelectedIndex(flatIdx)}
                          onRun={() => void runEntry(entry)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer hints. */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-panel2/40 text-[11px] text-muted">
          <div className="flex items-center gap-3">
            <HintKey label="↑↓" /> <span>Navigate</span>
            <HintKey label="↵" /> <span>Select</span>
            <HintKey label="Esc" /> <span>Close</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand pulse-glow" aria-hidden />
            <span className="tracking-wide">AI FinOps</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ResultRowProps {
  entry: VisibleEntry;
  query: string;
  selected: boolean;
  onHover: () => void;
  onRun: () => void;
}

// Forwarded ref so the parent can scroll the active item into view.
const ResultRow = forwardRef<HTMLButtonElement, ResultRowProps>(function ResultRow(
  { entry, query, selected, onHover, onRun },
  ref,
) {
  const { command, fuzzy } = entry;
  return (
    <button
      ref={ref}
      type="button"
      onMouseEnter={onHover}
      onClick={onRun}
      className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-100 ${
        selected
          ? 'bg-brand/15 text-ink border border-brand/30'
          : 'border border-transparent hover:bg-panel2 text-inkDim'
      }`}
    >
      <span
        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
          selected
            ? 'bg-brand-gradient text-white shadow-glow'
            : 'bg-panel2 text-muted group-hover:text-ink'
        }`}
        aria-hidden
      >
        <IconForName name={command.icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">
          <Highlight text={command.title} indices={query ? fuzzy.indices : []} />
        </span>
        {command.subtitle ? (
          <span className="block text-xs text-muted truncate mt-0.5">
            {command.subtitle}
          </span>
        ) : null}
      </span>
      {command.shortcut && command.shortcut.length > 0 ? (
        <span className="hidden sm:flex items-center gap-1 shrink-0">
          {command.shortcut.map((k, i) => (
            <kbd
              key={i}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${
                selected
                  ? 'border-brand/40 bg-brand/10 text-brandLight'
                  : 'border-border bg-panel2 text-muted'
              }`}
            >
              {k}
            </kbd>
          ))}
        </span>
      ) : null}
    </button>
  );
});

interface HighlightProps {
  text: string;
  indices: number[];
}

/**
 * Render `text` with highlighted characters at `indices`. Indices that
 * fall beyond the visible string (e.g. the match landed in `subtitle` or
 * `keywords`) are silently dropped — the result is unhighlighted but
 * still rendered.
 */
function Highlight({ text, indices }: HighlightProps) {
  if (indices.length === 0) return <>{text}</>;
  const set = new Set(indices.filter((i) => i < text.length));
  if (set.size === 0) return <>{text}</>;
  return (
    <>
      {text.split('').map((ch, i) =>
        set.has(i) ? (
          <span key={i} className="text-brandLight font-semibold bg-brand/15 rounded px-px">
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

function HintKey({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center justify-center text-[10px] font-mono px-1.5 py-0.5 rounded-md border border-border bg-panel2 text-muted">
      {label}
    </kbd>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" strokeLinecap="round" />
      <line x1="20" y1="20" x2="16.65" y2="16.65" strokeLinecap="round" />
    </svg>
  );
}

// A tiny icon library — small monochrome strokes that read well in the
// 32px circle. Keeping these inline avoids any new dependency and gives
// us total control over the visual rhythm.
function IconForName({ name }: { name: CommandIcon }) {
  const common = 'w-4 h-4';
  switch (name) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'chart':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 3v18h18" strokeLinecap="round" />
          <path d="M7 14l4-4 4 4 5-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'list':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" />
          <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" />
          <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="4" cy="18" r="1" />
        </svg>
      );
    case 'wand':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M15 4l5 5L9 20l-5-5z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 7l3 3" strokeLinecap="round" />
          <path d="M5 3v2M3 4h2M19 14v2M18 15h2" strokeLinecap="round" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" strokeLinejoin="round" />
          <path d="M19 16l.7 1.9L21.6 19l-1.9.7L19 21.6l-.7-1.9L16.4 19l1.9-.7z" strokeLinejoin="round" />
        </svg>
      );
    case 'compare':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="5" width="7" height="14" rx="1.5" />
          <rect x="14" y="5" width="7" height="14" rx="1.5" />
          <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 3" strokeLinecap="round" />
        </svg>
      );
    case 'bell':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2.5h-15z" strokeLinejoin="round" />
          <path d="M10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
      );
    case 'budget':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'mail':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'gear':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinejoin="round" />
        </svg>
      );
    case 'plug':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 2v6M15 2v6" strokeLinecap="round" />
          <path d="M7 8h10v3a5 5 0 0 1-10 0z" strokeLinejoin="round" />
          <path d="M12 16v6" strokeLinecap="round" />
        </svg>
      );
    case 'docs':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
          <path d="M14 2v6h6M9 13h6M9 17h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'play':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 4v16l14-8z" strokeLinejoin="round" />
        </svg>
      );
    case 'search':
      return <IconSearch className={common} />;
    case 'add':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
          <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
        </svg>
      );
    case 'open':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'help':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" strokeLinecap="round" />
          <circle cx="12" cy="17" r="0.8" fill="currentColor" />
        </svg>
      );
    case 'logout':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'tour':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" strokeLinejoin="round" />
          <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" strokeLinejoin="round" />
        </svg>
      );
    case 'database':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
      );
    case 'lightning':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}
