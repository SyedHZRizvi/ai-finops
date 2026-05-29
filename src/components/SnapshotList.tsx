'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SnapshotMeta } from '@/lib/snapshots';

interface SnapshotListProps {
  items: SnapshotMeta[];
}

function formatDateTime(iso: string): string {
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

const PERIOD_CHIP: Record<SnapshotMeta['period'], string> = {
  '24h': 'chip-amber',
  '7d': 'chip-teal',
  '30d': 'chip-brand',
  all: 'chip-indigo',
};

/**
 * List of snapshots with selection state for compare. Selecting two
 * snapshots reveals a bar that navigates to /snapshots/compare?a=&b=.
 *
 * The first selection is treated as "before" (A). The second as "after"
 * (B). The order of clicks determines the diff direction, which matters
 * because deltas are computed B − A.
 */
export function SnapshotList({ items }: SnapshotListProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedMetas = useMemo(() => {
    const map = new Map(items.map((it) => [it.id, it]));
    return selected
      .map((id) => map.get(id))
      .filter((m): m is SnapshotMeta => m !== undefined);
  }, [items, selected]);

  function toggleSelection(id: string) {
    setSelected((prev) => {
      const idx = prev.indexOf(id);
      if (idx !== -1) {
        // Deselect.
        const next = [...prev];
        next.splice(idx, 1);
        return next;
      }
      if (prev.length >= 2) {
        // Replace the older selection — keep the most recent two clicks.
        return [prev[1]!, id];
      }
      return [...prev, id];
    });
  }

  async function onDelete(id: string, label: string) {
    if (!confirm(`Delete snapshot "${label}"? This cannot be undone.`)) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/snapshots/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Delete failed (${res.status})`);
      }
      // Remove from selection if it was selected.
      setSelected((prev) => prev.filter((sid) => sid !== id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return null; // Page-level empty state owns the messaging.
  }

  const canCompare = selectedMetas.length === 2;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          Snapshots <span className="text-muted text-sm font-normal">({items.length})</span>
        </h2>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected([])}
            className="btn-ghost text-xs"
          >
            Clear selection
          </button>
        )}
      </div>

      {error && (
        <div className="card card-pad border-bad/40 bg-bad/5 text-sm text-bad">
          {error}
        </div>
      )}

      <div className="card fade-up-delay-1">
        <ul className="divide-y divide-border">
          {items.map((s) => {
            const selectedIdx = selected.indexOf(s.id);
            const isSelected = selectedIdx !== -1;
            const role = selectedIdx === 0 ? 'A' : selectedIdx === 1 ? 'B' : null;
            return (
              <li
                key={s.id}
                className={`px-5 py-4 transition-colors ${
                  isSelected ? 'bg-brand/5' : 'hover:bg-panel2/50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex items-center pt-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleSelection(s.id)}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center font-semibold text-xs transition-all ${
                        isSelected
                          ? 'bg-brand-gradient text-white border-brand shadow-glow'
                          : 'border-border bg-panel2 text-muted hover:border-borderBright hover:text-ink'
                      }`}
                      title={
                        isSelected
                          ? `Selected as ${role}. Click to unselect.`
                          : 'Select for compare'
                      }
                      aria-pressed={isSelected}
                    >
                      {role ?? '+'}
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3 flex-wrap">
                      <Link
                        href={`/snapshots/${encodeURIComponent(s.id)}`}
                        className="font-semibold text-sm text-ink hover:text-brandLight transition-colors"
                      >
                        {s.label}
                      </Link>
                      <span className={`chip ${PERIOD_CHIP[s.period]} capitalize`}>
                        {s.period}
                      </span>
                    </div>
                    {s.note && (
                      <p className="text-xs text-inkDim mt-1.5 leading-relaxed line-clamp-2">
                        {s.note}
                      </p>
                    )}
                    <div className="text-[11px] text-muted mt-2 flex items-center gap-2 flex-wrap">
                      <span title={formatDateTime(s.capturedAt)}>
                        {formatRelative(s.capturedAt)}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{formatDateTime(s.capturedAt)}</span>
                      {s.capturedBy && (
                        <>
                          <span aria-hidden>·</span>
                          <span>by {s.capturedBy}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <Link
                      href={`/snapshots/${encodeURIComponent(s.id)}`}
                      className="btn-ghost text-xs"
                    >
                      View
                    </Link>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id, s.label)}
                      disabled={busyId === s.id}
                      className="btn-ghost text-xs text-bad hover:text-bad"
                    >
                      {busyId === s.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {selected.length > 0 && (
        <div
          className={`sticky bottom-4 z-10 card card-pad border-brand/40 bg-panel/95 backdrop-blur-md shadow-card-hover transition-all ${
            canCompare ? 'glow-brand' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="label">Selected for compare</div>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedMetas.map((m, idx) => (
                  <span
                    key={m.id}
                    className="chip chip-brand inline-flex items-center gap-1.5"
                  >
                    <span className="font-bold opacity-80">{idx === 0 ? 'A' : 'B'}</span>
                    <span className="truncate max-w-[180px]">{m.label}</span>
                  </span>
                ))}
                {selectedMetas.length === 1 && (
                  <span className="text-xs text-muted">
                    Pick one more to compare →
                  </span>
                )}
              </div>
            </div>
            {canCompare && (
              <Link
                href={`/snapshots/compare?a=${encodeURIComponent(selectedMetas[0]!.id)}&b=${encodeURIComponent(selectedMetas[1]!.id)}`}
                className="btn-primary"
              >
                Compare these <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
