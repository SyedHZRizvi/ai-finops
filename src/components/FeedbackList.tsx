'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FeedbackListItem } from '@/app/api/feedback/list/route';

const STATUS_ORDER = [
  'open',
  'triaged',
  'addressed',
  'wont-do',
  'duplicate',
] as const;

type FeedbackStatus = (typeof STATUS_ORDER)[number];

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: 'Open',
  triaged: 'Triaged',
  addressed: 'Addressed',
  'wont-do': "Won't do",
  duplicate: 'Duplicate',
};

const STATUS_CHIP: Record<FeedbackStatus, string> = {
  open: 'chip-warn',
  triaged: 'chip-blue',
  addressed: 'chip-good',
  'wont-do': '',
  duplicate: 'chip-indigo',
};

// Map feedback kind to a chip color so a long table is scannable.
const KIND_CHIP: Record<FeedbackListItem['kind'], string> = {
  bug: 'chip-bad',
  'feature-request': 'chip-brand',
  praise: 'chip-good',
  question: 'chip-amber',
  other: '',
};

const KIND_LABEL: Record<FeedbackListItem['kind'], string> = {
  bug: 'Bug',
  'feature-request': 'Feature',
  praise: 'Praise',
  question: 'Question',
  other: 'Other',
};

// Actions visible on each row. "duplicate" is rarely set inline so we
// stuff it into the dropdown alongside the explicit buttons; here we
// surface the four most-used transitions.
const NEXT_STATUSES: { value: FeedbackStatus; label: string }[] = [
  { value: 'triaged', label: 'Mark triaged' },
  { value: 'addressed', label: 'Mark addressed' },
  { value: 'wont-do', label: "Won't do" },
  { value: 'duplicate', label: 'Duplicate' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.round(diffMonth / 12)}y ago`;
}

export interface FeedbackListProps {
  items: FeedbackListItem[];
}

/**
 * Admin list grouped by status. Within each status group rows are
 * newest-first (the parent server component already sorted them when
 * fetching). Status transitions and deletes go through the per-item
 * PATCH / DELETE endpoints; on success we refresh the route so the row
 * pops into its new group.
 */
export function FeedbackList({ items }: FeedbackListProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<FeedbackStatus, FeedbackListItem[]> = {
      open: [],
      triaged: [],
      addressed: [],
      'wont-do': [],
      duplicate: [],
    };
    for (const it of items) {
      if ((STATUS_ORDER as readonly string[]).includes(it.status)) {
        map[it.status].push(it);
      } else {
        // Unknown status (shouldn't happen, but be defensive) — bucket
        // it under open so it shows up at the top of the page.
        map.open.push(it);
      }
    }
    return map;
  }, [items]);

  async function updateStatus(id: string, status: FeedbackStatus) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Update failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRow(id: string) {
    if (!confirm('Delete this feedback? This cannot be undone.')) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Delete failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="card card-pad border-bad/40 bg-bad/5 text-sm text-bad">
          {error}
        </div>
      )}

      {STATUS_ORDER.map((status) => {
        const group = grouped[status];
        if (group.length === 0) return null;
        return (
          <section key={status} className="space-y-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-lg font-semibold tracking-tight">
                <span className={`chip ${STATUS_CHIP[status]} mr-2 align-middle`}>
                  {STATUS_LABEL[status]}
                </span>
                <span className="text-muted text-sm font-normal tabular-nums">
                  ({group.length})
                </span>
              </h2>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Kind</th>
                      <th>Message</th>
                      <th>Path</th>
                      <th>From</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((row) => {
                      const busy = busyId === row.id;
                      return (
                        <tr key={row.id}>
                          <td className="text-xs whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className="text-inkDim"
                                title={formatDate(row.createdAt)}
                              >
                                {formatRelative(row.createdAt)}
                              </span>
                              <span className="text-[10px] text-muted">
                                {formatDate(row.createdAt)}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`chip ${KIND_CHIP[row.kind]}`}>
                              {KIND_LABEL[row.kind]}
                            </span>
                          </td>
                          <td className="max-w-md">
                            <p className="text-sm text-inkDim whitespace-pre-wrap leading-relaxed">
                              {row.message}
                            </p>
                            {row.triageNote && (
                              <p className="mt-2 text-xs text-muted bg-panel2/60 border border-border rounded-lg px-2.5 py-1.5 leading-relaxed">
                                <span className="font-semibold text-inkDim">
                                  Triage note:
                                </span>{' '}
                                {row.triageNote}
                              </p>
                            )}
                          </td>
                          <td className="text-xs">
                            {row.path ? (
                              <code className="font-mono text-[11px] text-brandLight bg-brand/10 border border-brand/20 px-1.5 py-0.5 rounded">
                                {row.path}
                              </code>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="text-xs">
                            {row.createdBy ? (
                              <span className="text-inkDim">{row.createdBy}</span>
                            ) : (
                              <span className="chip">anon</span>
                            )}
                          </td>
                          <td className="text-right">
                            <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                              {NEXT_STATUSES
                                .filter((n) => n.value !== row.status)
                                .map((n) => (
                                  <button
                                    key={n.value}
                                    type="button"
                                    className="btn-ghost text-xs"
                                    onClick={() => updateStatus(row.id, n.value)}
                                    disabled={busy}
                                  >
                                    {n.label}
                                  </button>
                                ))}
                              <button
                                type="button"
                                className="btn-ghost text-xs text-bad hover:text-bad"
                                onClick={() => deleteRow(row.id)}
                                disabled={busy}
                              >
                                {busy ? '…' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
