'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  TEMPLATES,
  type PromptTemplate,
  type TemplateCategory,
  type TemplateTarget,
} from '@/lib/templates';
import { TemplateCard } from './TemplateCard';
import { TemplateDetailModal } from './TemplateDetailModal';

const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: 'rag', label: 'RAG' },
  { value: 'classification', label: 'Classification' },
  { value: 'summarization', label: 'Summarization' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'generation', label: 'Generation' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'code', label: 'Code' },
  { value: 'translation', label: 'Translation' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'planning', label: 'Planning' },
  { value: 'creative', label: 'Creative' },
];

const TARGETS: { value: TemplateTarget; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'gpt', label: 'GPT' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'any', label: 'Any model' },
];

const VALID_CATEGORIES = new Set<string>(CATEGORIES.map((c) => c.value));
const VALID_TARGETS = new Set<string>(TARGETS.map((t) => t.value));

function matchesSearch(t: PromptTemplate, q: string): boolean {
  const needle = q.toLowerCase().trim();
  if (!needle) return true;
  if (t.name.toLowerCase().includes(needle)) return true;
  if (t.description.toLowerCase().includes(needle)) return true;
  if (t.useCase.toLowerCase().includes(needle)) return true;
  for (const tag of t.tags) {
    if (tag.toLowerCase().includes(needle)) return true;
  }
  return false;
}

export function TemplateBrowser({
  initialCategory,
  initialTarget,
  initialQuery,
}: {
  initialCategory: string;
  initialTarget: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  // Sanitize inputs from URL to valid enum values; otherwise treat as no filter.
  const safeInitialCategory = VALID_CATEGORIES.has(initialCategory) ? initialCategory : '';
  const safeInitialTarget = VALID_TARGETS.has(initialTarget) ? initialTarget : '';

  const [category, setCategory] = useState<string>(safeInitialCategory);
  const [target, setTarget] = useState<string>(safeInitialTarget);
  const [query, setQuery] = useState<string>(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Sync local state when URL changes from external nav (e.g., back button).
  useEffect(() => {
    const c = sp.get('category') ?? '';
    const t = sp.get('target') ?? '';
    const q = sp.get('q') ?? '';
    setCategory(VALID_CATEGORIES.has(c) ? c : '');
    setTarget(VALID_TARGETS.has(t) ? t : '');
    setQuery(q);
  }, [sp]);

  // Debounce URL writes for the search box so each keystroke doesn't push history.
  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (category) params.set('category', category);
      else params.delete('category');
      if (target) params.set('target', target);
      else params.delete('target');
      if (query.trim()) params.set('q', query.trim());
      else params.delete('q');
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
    }, 200);
    return () => clearTimeout(handle);
    // We intentionally exclude `sp` from deps to avoid feedback loops with the
    // URL-sync effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, target, query, pathname, router]);

  const filtered = useMemo(() => {
    let items: PromptTemplate[] = TEMPLATES;
    if (category) items = items.filter((t) => t.category === category);
    if (target) items = items.filter((t) => t.target === target);
    if (query.trim()) items = items.filter((t) => matchesSearch(t, query));
    return items;
  }, [category, target, query]);

  const selected = selectedId ? TEMPLATES.find((t) => t.id === selectedId) ?? null : null;

  function clearFilters() {
    setCategory('');
    setTarget('');
    setQuery('');
  }

  const hasFilters = category !== '' || target !== '' || query.trim() !== '';

  return (
    <div className="space-y-4">
      <div className="card card-pad fade-up">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-6">
            <label htmlFor="tpl-search" className="label block mb-2">
              Search
            </label>
            <input
              id="tpl-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, tag, or use case..."
              className="input"
            />
          </div>
          <div className="md:col-span-3">
            <label htmlFor="tpl-category" className="label block mb-2">
              Category
            </label>
            <select
              id="tpl-category"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label htmlFor="tpl-target" className="label block mb-2">
              Target model
            </label>
            <select
              id="tpl-target"
              className="input"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">All targets</option>
              {TARGETS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="text-muted tabular-nums">
            {filtered.length} of {TEMPLATES.length} {filtered.length === 1 ? 'template' : 'templates'}
          </div>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="btn-ghost">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card card-pad text-center py-16 fade-up-delay-1">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-gradient shadow-glow flex items-center justify-center mb-4">
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-lg font-bold gradient-text mb-2">No matching templates</div>
          <div className="text-sm text-inkDim max-w-md mx-auto">
            Try a different search term or clear the filters to see all templates.
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="btn mt-4">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} onOpen={setSelectedId} />
          ))}
        </div>
      )}

      {selected && (
        <TemplateDetailModal template={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
