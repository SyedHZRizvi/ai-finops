'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

interface TagAgg {
  tag: string;
  count: number;
  totalCost: number;
}

interface TagsResponse {
  items: TagAgg[];
}

interface TagInputProps {
  value: string;
  onChange: (next: string) => void;
}

function parseTags(value: string): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

function joinTags(tags: string[]): string {
  return tags.join(',');
}

function normalizeTag(input: string): string {
  return input.trim().replace(/\s+/g, '-').replace(/,/g, '').toLowerCase();
}

export function TagInput({ value, onChange }: TagInputProps) {
  const tags = useMemo(() => parseTags(value), [value]);
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<TagAgg[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Fetch tag suggestions once on mount. Tag space is small enough that
  // we cache the full set in memory and filter client-side.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/tags', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((json: TagsResponse) => {
        if (!cancelled) setSuggestions(json.items ?? []);
      })
      .catch(() => {
        // Suggestions are a nice-to-have; failure shouldn't break the input.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Click-outside closes the suggestions dropdown.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const draftNormalized = normalizeTag(draft);
  const filteredSuggestions = useMemo(() => {
    const existing = new Set(tags);
    return suggestions
      .filter((s) => !existing.has(s.tag))
      .filter((s) => (draftNormalized ? s.tag.toLowerCase().includes(draftNormalized) : true))
      .slice(0, 8);
  }, [suggestions, tags, draftNormalized]);

  function commitDraft(raw?: string) {
    const text = raw ?? draft;
    const tag = normalizeTag(text);
    if (!tag) return;
    if (tags.includes(tag)) {
      setDraft('');
      return;
    }
    onChange(joinTags([...tags, tag]));
    setDraft('');
  }

  function removeTag(t: string) {
    onChange(joinTags(tags.filter((x) => x !== t)));
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitDraft();
      return;
    }
    if (e.key === 'Tab' && draft.trim()) {
      // Commit on Tab so users can keep flowing.
      e.preventDefault();
      commitDraft();
      return;
    }
    if (e.key === 'Backspace' && !draft && tags.length > 0) {
      removeTag(tags[tags.length - 1]!);
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="input flex flex-wrap items-center gap-1.5 min-h-[44px] cursor-text"
        onClick={() => inputRef.current?.focus()}
        role="presentation"
      >
        {tags.map((t) => (
          <span key={t} className="chip chip-brand pl-2.5 pr-1 py-1">
            <span>{t}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(t);
              }}
              className="hover:text-ink text-brandLight/80 px-1 -mr-0.5"
              aria-label={`Remove ${t}`}
            >
              <span aria-hidden>×</span>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Commit on blur so unsubmitted text doesn't silently disappear.
            if (draft.trim()) commitDraft();
          }}
          placeholder={tags.length === 0 ? 'Add tags (e.g. prod, team-x)…' : ''}
          className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-sm placeholder:text-muted py-0.5"
        />
      </div>

      {open && filteredSuggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-panel border border-borderBright rounded-xl shadow-card max-h-64 overflow-y-auto z-20">
          <ul className="py-1">
            {filteredSuggestions.map((s) => (
              <li key={s.tag}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // onMouseDown fires before onBlur, so the click registers.
                    e.preventDefault();
                    commitDraft(s.tag);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-panel2 text-sm flex items-center justify-between gap-3"
                >
                  <span>{s.tag}</span>
                  <span className="text-[10px] text-muted tabular-nums">
                    {s.count} {s.count === 1 ? 'use' : 'uses'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
