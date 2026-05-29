'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AnomalyListItem {
  id: string;
  kind: string;
  severity: string;
  title: string;
  description: string;
  detectedAt: string;
  resolvedAt: string | null;
  metadata: unknown;
  webhookSent: boolean;
  scopeKey: string | null;
}

interface AnomalyListProps {
  items: AnomalyListItem[];
}

const SEVERITY_CHIP: Record<string, { className: string; label: string }> = {
  info: { className: 'chip-blue', label: 'Info' },
  warn: { className: 'chip-warn', label: 'Warn' },
  critical: { className: 'chip-bad', label: 'Critical' },
};

const KIND_LABEL: Record<string, string> = {
  'cost-spike': 'Cost spike',
  'new-model': 'New model',
  'expensive-prompt': 'Expensive prompt',
  'budget-breach': 'Budget breach',
  'latency-spike': 'Latency spike',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AnomalyList({ items }: AnomalyListProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onResolve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch('/api/anomaly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'resolve' }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Resolve failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolve failed');
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="card card-pad text-sm text-muted">
        No anomalies match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="card card-pad border-bad/40 bg-bad/5 text-sm text-bad">
          {error}
        </div>
      )}
      {items.map((it) => {
        const chip = SEVERITY_CHIP[it.severity] ?? {
          className: 'chip-blue',
          label: it.severity,
        };
        const kindLabel = KIND_LABEL[it.kind] ?? it.kind;
        const isResolved = it.resolvedAt != null;
        return (
          <div
            key={it.id}
            className={`card card-pad fade-up ${
              isResolved ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`chip ${chip.className}`}>{chip.label}</span>
                  <span className="chip">{kindLabel}</span>
                  {it.webhookSent && (
                    <span className="chip chip-teal" title="Alert webhook delivered">
                      Notified
                    </span>
                  )}
                  {isResolved && (
                    <span className="chip chip-good">Resolved</span>
                  )}
                </div>
                <div className="text-base font-semibold tracking-tight">
                  {it.title}
                </div>
                <div className="text-sm text-inkDim mt-2 leading-relaxed">
                  {it.description}
                </div>
                <div className="text-[11px] uppercase tracking-wider text-muted mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Detected: {formatDate(it.detectedAt)}</span>
                  {it.resolvedAt && (
                    <span>Resolved: {formatDate(it.resolvedAt)}</span>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                {!isResolved && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onResolve(it.id)}
                    disabled={busyId === it.id}
                  >
                    {busyId === it.id ? 'Resolving...' : 'Resolve'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
