'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import type { Category, Complexity } from '@/lib/types';

export interface PromptRow {
  id: string;
  timestamp: string;
  model: string;
  category: Category;
  complexity: Complexity;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  potentialSavedCost: number;
  potentialSavedTokens: number;
}

const CATEGORIES: Category[] = [
  'factual',
  'reasoning',
  'creative',
  'code',
  'analytical',
  'conversational',
  'instructional',
  'other',
];

const COMPLEXITIES: Complexity[] = ['simple', 'moderate', 'complex', 'multidimensional'];

export const CATEGORY_CHIP: Record<Category, string> = {
  factual: 'chip-teal',
  reasoning: 'chip-blue',
  creative: 'chip-pink',
  code: 'chip-lime',
  analytical: 'chip-amber',
  conversational: 'chip-brand',
  instructional: 'chip-indigo',
  other: 'chip-rose',
};

export const COMPLEXITY_CHIP: Record<Complexity, string> = {
  simple: 'chip-good',
  moderate: 'chip-blue',
  complex: 'chip-warn',
  multidimensional: 'chip-bad',
};

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PromptTable({
  items,
  total,
  limit,
  offset,
  models,
}: {
  items: PromptRow[];
  total: number;
  limit: number;
  offset: number;
  models: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(sp.get('search') ?? '');
  useEffect(() => {
    setSearch(sp.get('search') ?? '');
  }, [sp]);

  function update(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    params.delete('offset');
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function go(newOffset: number) {
    const params = new URLSearchParams(sp.toString());
    params.set('offset', String(newOffset));
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function openRow(id: string) {
    const params = new URLSearchParams(sp.toString());
    params.set('selected', id);
    router.push(`${pathname}?${params.toString()}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    update({ search: search || null });
  }

  const page = Math.floor(offset / Math.max(1, limit)) + 1;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));

  return (
    <div className="space-y-4">
      <div className="card card-pad fade-up">
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="label block mb-2">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompt text..."
              className="input"
            />
          </div>
          <div>
            <label className="label block mb-2">Category</label>
            <select
              className="input"
              value={sp.get('category') ?? ''}
              onChange={(e) => update({ category: e.target.value || null })}
            >
              <option value="">All</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label block mb-2">Complexity</label>
            <select
              className="input"
              value={sp.get('complexity') ?? ''}
              onChange={(e) => update({ complexity: e.target.value || null })}
            >
              <option value="">All</option>
              {COMPLEXITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label block mb-2">Model</label>
            <select
              className="input"
              value={sp.get('model') ?? ''}
              onChange={(e) => update({ model: e.target.value || null })}
            >
              <option value="">All</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">
              Apply
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSearch('');
                startTransition(() => router.push(pathname));
              }}
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      <div className="card fade-up-delay-1">
        {total === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-brand-gradient shadow-glow flex items-center justify-center mb-4">
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="15" x2="15" y2="15" strokeLinecap="round" />
              </svg>
            </div>
            <div className="text-lg font-bold gradient-text mb-2">No prompts logged yet</div>
            <div className="text-sm text-inkDim max-w-md mx-auto leading-relaxed">
              Install the AI FinOps SDK and start logging your LLM calls to see them here.
              Prompts will be auto-categorized and analyzed for savings.
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
              <Link href="/setup" className="btn-primary">
                Run setup wizard <span aria-hidden>→</span>
              </Link>
              <Link href="/studio" className="btn">
                Try Studio
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Model</th>
                    <th>Category</th>
                    <th>Complexity</th>
                    <th className="text-right">Input</th>
                    <th className="text-right">Output</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => openRow(r.id)}
                      className="cursor-pointer"
                    >
                      <td className="text-xs text-muted whitespace-nowrap">
                        {formatTime(r.timestamp)}
                      </td>
                      <td className="font-mono text-xs whitespace-nowrap">{r.model}</td>
                      <td>
                        <span className={`chip capitalize ${CATEGORY_CHIP[r.category] ?? ''}`}>
                          {r.category}
                        </span>
                      </td>
                      <td>
                        <span className={`chip capitalize ${COMPLEXITY_CHIP[r.complexity] ?? ''}`}>
                          {r.complexity}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{formatNum(r.inputTokens)}</td>
                      <td className="text-right tabular-nums">{formatNum(r.outputTokens)}</td>
                      <td className="text-right tabular-nums font-semibold">{formatUSD(r.totalCost)}</td>
                      <td className="text-right tabular-nums">
                        {r.potentialSavedCost > 0 ? (
                          <span className="text-good font-semibold">−{formatUSD(r.potentialSavedCost)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-6 py-4 text-xs text-muted border-t border-border">
              <div className="tabular-nums">
                Showing {offset + 1}–{Math.min(offset + items.length, total)} of {formatNum(total)}
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="btn"
                  disabled={offset === 0}
                  onClick={() => go(Math.max(0, offset - limit))}
                >
                  <span aria-hidden>←</span> Prev
                </button>
                <button
                  className="btn"
                  disabled={offset + limit >= total}
                  onClick={() => go(offset + limit)}
                >
                  Next <span aria-hidden>→</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
