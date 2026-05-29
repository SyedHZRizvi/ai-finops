'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BudgetStatus, BudgetStatusKind } from '@/lib/budget';

interface BudgetTableProps {
  rows: BudgetStatus[];
}

function formatUSD(n: number, currency = 'USD'): string {
  if (!Number.isFinite(n)) return `${currency} 0.00`;
  const abs = Math.abs(n);
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  if (abs < 1) return `${symbol}${n.toFixed(4)}`;
  return `${symbol}${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const STATUS_CHIP: Record<BudgetStatusKind, { className: string; label: string }> = {
  ok: { className: 'chip-good', label: 'OK' },
  'warn-75': { className: 'chip-warn', label: 'Warn 75%' },
  'warn-90': { className: 'chip-bad', label: 'Warn 90%' },
  'breach-100': { className: 'chip-bad', label: 'Breached' },
};

function barColor(status: BudgetStatusKind): string {
  if (status === 'ok') return 'bg-good';
  if (status === 'warn-75') return 'bg-warn';
  return 'bg-bad';
}

export function BudgetTable({ rows }: BudgetTableProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onDelete(id: string) {
    if (!confirm('Delete this budget?')) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/budget?id=${encodeURIComponent(id)}`, {
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

  return (
    <div className="card fade-up-delay-1">
      {error && (
        <div className="card-pad border-b border-border bg-bad/5 text-sm text-bad">
          {error}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Scope</th>
              <th>Value</th>
              <th className="text-right">Limit</th>
              <th>Used</th>
              <th className="text-right">Remaining</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { budget, percentUsed, monthToDate, remaining, status } = row;
              const pctClamped = Math.max(0, Math.min(100, percentUsed));
              const chip = STATUS_CHIP[status];
              return (
                <tr key={budget.id}>
                  <td className="capitalize font-medium">{budget.scope}</td>
                  <td className="font-mono text-xs">
                    {budget.scope === 'global' ? (
                      <span className="text-muted">—</span>
                    ) : (
                      budget.scopeValue ?? <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums font-semibold">
                    {formatUSD(budget.monthlyLimit, budget.currency)}
                  </td>
                  <td className="min-w-[180px]">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-panel3 overflow-hidden">
                        <div
                          className={`h-full ${barColor(status)} transition-all`}
                          style={{ width: `${pctClamped}%` }}
                        />
                      </div>
                      <div className="text-xs tabular-nums text-muted w-28 text-right">
                        {formatUSD(monthToDate, budget.currency)} (
                        {percentUsed.toFixed(0)}%)
                      </div>
                    </div>
                  </td>
                  <td className="text-right tabular-nums">
                    {formatUSD(remaining, budget.currency)}
                  </td>
                  <td>
                    <span className={`chip ${chip.className}`}>{chip.label}</span>
                  </td>
                  <td className="text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        className="btn-ghost"
                        title="Edit (re-submit the form with the same scope to update)"
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-bad hover:text-bad"
                        onClick={() => onDelete(budget.id)}
                        disabled={busyId === budget.id}
                      >
                        {busyId === budget.id ? 'Deleting...' : 'Delete'}
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
  );
}
