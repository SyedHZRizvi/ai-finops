'use client';
//
// SavedFiltersDropdown — lists every saved view for the current page (path)
// in a small dropdown anchored to a "Saved views" trigger button. Each
// entry has a "Use" link that navigates to the saved path+query, plus a
// small × button to delete the entry.
//
// The list is filtered to only show entries with .path === current
// pathname, so the prompts page doesn't surface insights-page saves and
// vice versa. The dropdown is closed on outside click and on Escape.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  deleteSavedFilter,
  listSavedFilters,
  type SavedFilter,
} from '@/lib/savedFilters';

interface SavedFiltersDropdownProps {
  /**
   * When true, the list shows entries from ANY page, not just the current
   * pathname. Useful for a global "my saved views" surface; defaults to
   * false so per-page placement stays scoped.
   */
  showAllPages?: boolean;
}

export function SavedFiltersDropdown({ showAllPages = false }: SavedFiltersDropdownProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SavedFilter[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pull from localStorage on mount and whenever the dropdown opens. We
  // also listen to the cross-tab "storage" event so that if the user saves
  // a view in another tab, this dropdown reflects it without a reload.
  const refresh = useCallback(() => {
    setItems(listSavedFilters());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === null || e.key === 'finops:saved-filters') refresh();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = useMemo(() => {
    return showAllPages ? items : items.filter((f) => f.path === pathname);
  }, [items, pathname, showAllPages]);

  const onDelete = useCallback(
    (id: string) => {
      deleteSavedFilter(id);
      refresh();
    },
    [refresh],
  );

  function href(f: SavedFilter): string {
    return f.queryString.length > 0 ? `${f.path}?${f.queryString}` : f.path;
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Open saved views"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Saved views
        {visible.length > 0 && (
          <span className="chip chip-brand text-[10px] px-1.5 py-0">{visible.length}</span>
        )}
        <svg
          viewBox="0 0 24 24"
          className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-panel border border-borderBright rounded-2xl shadow-card z-30 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="label">Saved views</span>
            <span className="text-xs text-muted">
              {showAllPages ? 'all pages' : pathname}
            </span>
          </div>

          {visible.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted text-center">
              <div className="mx-auto w-10 h-10 rounded-xl bg-panel2 border border-border flex items-center justify-center mb-2">
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              No saved views yet.
              <div className="text-xs mt-1 text-muted">
                Use <span className="text-inkDim">Save view</span> to bookmark
                your current filters.
              </div>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {visible.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 px-4 py-2 hover:bg-panel2 border-b border-border/60 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-inkDim truncate">{f.name}</div>
                    <div className="text-[11px] text-muted truncate font-mono">
                      {f.queryString.length > 0 ? `?${f.queryString}` : '(no filters)'}
                    </div>
                  </div>
                  <Link
                    href={href(f)}
                    onClick={() => setOpen(false)}
                    className="text-xs px-2 py-1 rounded-lg border border-brand/40 bg-brand/10 text-brandLight hover:bg-brand/20 transition-colors"
                  >
                    Use
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDelete(f.id)}
                    aria-label={`Delete ${f.name}`}
                    className="w-7 h-7 rounded-lg border border-transparent text-muted hover:text-bad hover:border-bad/40 hover:bg-bad/10 flex items-center justify-center transition-colors"
                    title="Delete this saved view"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                      <line x1="6" y1="18" x2="18" y2="6" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
