'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AllocationRuleData, SourceMatcher, TargetSplit } from '@/lib/allocation';
import { AllocationRuleForm } from './AllocationRuleForm';

interface AllocationRuleListProps {
  rows: AllocationRuleData[];
}

function renderMatcherField(v: string | string[] | undefined): string {
  if (v === undefined) return '*';
  if (Array.isArray(v)) return v.join(', ');
  return v;
}

function renderSource(m: SourceMatcher): { label: string; value: string }[] {
  return [
    { label: 'app', value: renderMatcherField(m.appName) },
    { label: 'model', value: renderMatcherField(m.model) },
    { label: 'user', value: renderMatcherField(m.userId) },
  ];
}

function renderSplit(s: TargetSplit): { name: string; percent: number }[] {
  return Object.entries(s).map(([name, percent]) => ({ name, percent }));
}

export function AllocationRuleList({ rows }: AllocationRuleListProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function toggleActive(rule: AllocationRuleData) {
    setBusyId(rule.id);
    setError(null);
    try {
      const res = await fetch(`/api/allocations?id=${encodeURIComponent(rule.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Toggle failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this allocation rule? It will be deactivated.')) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/allocations?id=${encodeURIComponent(id)}`, {
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
    <div className="space-y-4">
      {error && (
        <div className="card-pad border border-bad/40 bg-bad/5 rounded-xl text-sm text-bad">
          {error}
        </div>
      )}

      <div className="card fade-up-delay-1">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Source</th>
                <th>Split</th>
                <th className="text-right">Priority</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rule) => {
                const source = renderSource(rule.sourceMatcher);
                const split = renderSplit(rule.targetSplit);
                const sum = split.reduce((a, b) => a + b.percent, 0);
                return (
                  <tr key={rule.id} className={rule.isActive ? '' : 'opacity-60'}>
                    <td>
                      <div className="font-medium">{rule.name}</div>
                      <div className="text-[11px] text-muted font-mono mt-0.5">
                        {rule.id}
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1 text-xs font-mono">
                        {source.map((s) => (
                          <div key={s.label} className="flex items-center gap-2">
                            <span className="text-muted uppercase tracking-wider w-12">
                              {s.label}
                            </span>
                            <span>{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1">
                        {split.map((s) => (
                          <div key={s.name} className="flex items-center gap-2 text-xs">
                            <span className="font-mono">{s.name}</span>
                            <span className="chip chip-brand tabular-nums">
                              {s.percent}%
                            </span>
                          </div>
                        ))}
                        <div className="text-[10px] text-muted tabular-nums mt-1">
                          sum: {Math.round(sum * 100) / 100}%
                        </div>
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{rule.priority}</td>
                    <td>
                      <span
                        className={`chip ${rule.isActive ? 'chip-good' : 'chip-warn'}`}
                      >
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => toggleActive(rule)}
                          disabled={busyId === rule.id}
                        >
                          {rule.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() =>
                            setEditingId(editingId === rule.id ? null : rule.id)
                          }
                        >
                          {editingId === rule.id ? 'Close' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost text-bad hover:text-bad"
                          onClick={() => onDelete(rule.id)}
                          disabled={busyId === rule.id}
                        >
                          {busyId === rule.id ? '...' : 'Delete'}
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

      {editingId && (
        <div className="space-y-2">
          <div className="text-sm text-muted">
            Editing rule —{' '}
            <span className="font-mono text-xs">{editingId}</span>
          </div>
          <AllocationRuleForm
            initial={rows.find((r) => r.id === editingId)}
            onSaved={() => setEditingId(null)}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}
    </div>
  );
}
