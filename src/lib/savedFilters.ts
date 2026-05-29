// localStorage-backed store for "saved views" — bookmark-style snapshots
// of a page's path + filter querystring. Each saved view captures the
// URL state at the moment of saving so the user can jump back to a
// specific filtered slice with one click.
//
// Storage shape (JSON):
//   localStorage['finops:saved-filters'] = '[{...}, {...}, ...]'
//
// SSR-safe: every function silently no-ops on the server (typeof window
// === 'undefined') so callers can render the same component on the server
// and client without guards everywhere.
//
// Limits: at most MAX_ENTRIES saved views in total. When the user saves a
// new view beyond the limit, the oldest is dropped (FIFO). This avoids
// runaway localStorage growth on workstations that have been used for
// months.

export interface SavedFilter {
  id: string;
  name: string;
  /** Page path, e.g. "/prompts". Excludes querystring. */
  path: string;
  /** Filter querystring, e.g. "category=code&period=30d". May be empty. */
  queryString: string;
  /** Epoch millis. Used for ordering and FIFO eviction. */
  createdAt: number;
}

const STORAGE_KEY = 'finops:saved-filters';
const MAX_ENTRIES = 50;

// Single source of truth for SSR vs browser detection — we read this in
// every public function so a wrong-side caller short-circuits cleanly.
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeRead(): SavedFilter[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: only keep entries that look like our shape. A corrupted
    // localStorage entry (e.g. from a different version of the app) should
    // not crash the UI — drop bad rows and keep going.
    const valid: SavedFilter[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (
        typeof obj.id === 'string'
        && typeof obj.name === 'string'
        && typeof obj.path === 'string'
        && typeof obj.queryString === 'string'
        && typeof obj.createdAt === 'number'
      ) {
        valid.push({
          id: obj.id,
          name: obj.name,
          path: obj.path,
          queryString: obj.queryString,
          createdAt: obj.createdAt,
        });
      }
    }
    return valid;
  } catch {
    // Quota exceeded reads can't happen, but parsing a non-JSON value can.
    return [];
  }
}

function safeWrite(list: SavedFilter[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage quota exceeded, private-mode iOS, etc. We don't have a
    // recovery path; treat it as a silent no-op. The in-memory list is
    // unaffected and the next save attempt will retry.
  }
}

function genId(): string {
  // Lightweight unique id — crypto.randomUUID() isn't universally available in
  // older browsers, and a hash of (path|name|now) is sufficient for our use.
  const rand = Math.random().toString(36).slice(2, 10);
  return `sf_${Date.now().toString(36)}_${rand}`;
}

export function listSavedFilters(): SavedFilter[] {
  // Sort newest first so the dropdown shows the most-recently-saved view
  // at the top, which matches user expectation.
  return safeRead().sort((a, b) => b.createdAt - a.createdAt);
}

export function saveFilter(input: Omit<SavedFilter, 'id' | 'createdAt'>): SavedFilter {
  const all = safeRead();
  const created: SavedFilter = {
    id: genId(),
    name: input.name,
    path: input.path,
    queryString: input.queryString,
    createdAt: Date.now(),
  };

  // If a saved filter with the exact same path + queryString + name already
  // exists, update its createdAt timestamp instead of duplicating. Otherwise
  // the user gets noisy duplicates when they re-save without noticing.
  const dupeIdx = all.findIndex(
    (f) => f.path === created.path && f.queryString === created.queryString && f.name === created.name,
  );
  if (dupeIdx >= 0) {
    all[dupeIdx] = { ...all[dupeIdx], createdAt: created.createdAt };
    safeWrite(all);
    return all[dupeIdx];
  }

  all.push(created);

  // Enforce the size cap with FIFO eviction (sort by createdAt asc and trim).
  if (all.length > MAX_ENTRIES) {
    all.sort((a, b) => a.createdAt - b.createdAt);
    all.splice(0, all.length - MAX_ENTRIES);
  }

  safeWrite(all);
  return created;
}

export function deleteSavedFilter(id: string): void {
  const all = safeRead();
  const next = all.filter((f) => f.id !== id);
  if (next.length !== all.length) safeWrite(next);
}
