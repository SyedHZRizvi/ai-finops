'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ModelPricing } from '@/lib/types';

interface PricingRow extends ModelPricing {
  id?: string;
  isActive?: boolean;
}

function formatUSD4(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

export function PricingTable({ rows }: { rows: PricingRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PricingRow>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow] = useState<Partial<ModelPricing>>({
    model: '',
    provider: '',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    contextWindow: 0,
  });

  function startEdit(row: PricingRow) {
    setEditing(row.model);
    setDraft({ ...row });
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft({});
  }

  async function save() {
    if (!draft.model) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: draft.model,
          provider: draft.provider || undefined,
          inputCostPer1M: Number(draft.inputCostPer1M ?? 0),
          outputCostPer1M: Number(draft.outputCostPer1M ?? 0),
          contextWindow: Number(draft.contextWindow ?? 0),
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setEditing(null);
      setDraft({});
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function addModel(e: React.FormEvent) {
    e.preventDefault();
    if (!newRow.model) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: newRow.model,
          provider: newRow.provider || undefined,
          inputCostPer1M: Number(newRow.inputCostPer1M ?? 0),
          outputCostPer1M: Number(newRow.outputCostPer1M ?? 0),
          contextWindow: Number(newRow.contextWindow ?? 0),
        }),
      });
      if (!res.ok) throw new Error(`Add failed (${res.status})`);
      setShowAdd(false);
      setNewRow({
        model: '',
        provider: '',
        inputCostPer1M: 0,
        outputCostPer1M: 0,
        contextWindow: 0,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card card-pad fade-up">
        <div className="flex items-center justify-between">
          <div>
            <div className="label">Add model pricing</div>
            <div className="text-xs text-muted mt-1">
              Costs are quoted per 1M tokens to match provider pricing pages.
            </div>
          </div>
          <button
            type="button"
            className={showAdd ? 'btn' : 'btn-primary'}
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? 'Cancel' : 'Add Model'}
          </button>
        </div>

        {showAdd && (
          <form
            onSubmit={addModel}
            className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4"
          >
            <div>
              <label className="label block mb-2">Model</label>
              <input
                className="input"
                placeholder="gpt-4o-mini"
                value={newRow.model ?? ''}
                onChange={(e) => setNewRow({ ...newRow, model: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label block mb-2">Provider</label>
              <input
                className="input"
                placeholder="openai"
                value={newRow.provider ?? ''}
                onChange={(e) => setNewRow({ ...newRow, provider: e.target.value })}
              />
            </div>
            <div>
              <label className="label block mb-2">Input / 1M</label>
              <input
                type="number"
                step="0.0001"
                className="input"
                value={newRow.inputCostPer1M ?? 0}
                onChange={(e) =>
                  setNewRow({ ...newRow, inputCostPer1M: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="label block mb-2">Output / 1M</label>
              <input
                type="number"
                step="0.0001"
                className="input"
                value={newRow.outputCostPer1M ?? 0}
                onChange={(e) =>
                  setNewRow({ ...newRow, outputCostPer1M: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="label block mb-2">Context</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="input"
                  value={newRow.contextWindow ?? 0}
                  onChange={(e) =>
                    setNewRow({ ...newRow, contextWindow: Number(e.target.value) })
                  }
                />
                <button type="submit" disabled={saving} className="btn-primary shrink-0">
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {error && (
        <div className="card card-pad border-bad/40 bg-bad/5 text-xs text-bad">{error}</div>
      )}

      <div className="card fade-up-delay-1">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted">
            No pricing configured. Add your first model above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Provider</th>
                  <th className="text-right">Input / 1M</th>
                  <th className="text-right">Output / 1M</th>
                  <th className="text-right">Context</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isEditing = editing === row.model;
                  return (
                    <tr key={row.model}>
                      <td className="font-mono text-xs">{row.model}</td>
                      <td className="text-xs text-muted capitalize">{row.provider ?? '—'}</td>
                      <td className="text-right tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.0001"
                            className="input text-right w-28 inline-block"
                            value={draft.inputCostPer1M ?? 0}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                inputCostPer1M: Number(e.target.value),
                              })
                            }
                          />
                        ) : (
                          formatUSD4(row.inputCostPer1M)
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.0001"
                            className="input text-right w-28 inline-block"
                            value={draft.outputCostPer1M ?? 0}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                outputCostPer1M: Number(e.target.value),
                              })
                            }
                          />
                        ) : (
                          formatUSD4(row.outputCostPer1M)
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            className="input text-right w-28 inline-block"
                            value={draft.contextWindow ?? 0}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                contextWindow: Number(e.target.value),
                              })
                            }
                          />
                        ) : (
                          formatNum(row.contextWindow)
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            row.isActive === false
                              ? 'chip text-muted'
                              : 'chip chip-good'
                          }
                        >
                          {row.isActive === false ? 'inactive' : 'active'}
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex gap-2">
                            <button
                              onClick={save}
                              disabled={saving}
                              className="btn-primary"
                            >
                              {saving ? '...' : 'Save'}
                            </button>
                            <button onClick={cancelEdit} className="btn">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(row)} className="btn">
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
