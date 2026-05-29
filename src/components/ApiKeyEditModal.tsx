'use client';
import { useEffect, useState } from 'react';

interface ApiKeyEditModalProps {
  /** Row being edited (label + scopeApps come from here). */
  initial: {
    id: string;
    label: string;
    scopeApps: string[] | null;
  };
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * Inline edit modal for an existing API key's label and scopeApps.
 *
 * Revocation lives elsewhere (the row's Revoke button) so the destructive
 * action stays explicit and discoverable. This modal is purely for metadata
 * changes that don't affect the hashed token itself.
 */
export function ApiKeyEditModal({ initial, onSaved, onCancel }: ApiKeyEditModalProps) {
  const [label, setLabel] = useState(initial.label);
  const [scopeAppsText, setScopeAppsText] = useState((initial.scopeApps ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError('Label is required.');
      return;
    }

    const apps = scopeAppsText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    setSaving(true);
    try {
      const res = await fetch(`/api/api-keys/${encodeURIComponent(initial.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: trimmedLabel,
          // Send null when the user clears the field so the route stores it
          // as "any app". An empty array would also be normalized to null
          // server-side, but null is clearer at the wire.
          scopeApps: apps.length > 0 ? apps : null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Save failed (${res.status})`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-40"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-edit-title"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,560px)] max-h-[90vh] overflow-y-auto z-50 bg-panel border border-borderBright rounded-2xl shadow-2xl"
      >
        <form onSubmit={save} className="card-pad space-y-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id="api-key-edit-title" className="text-base font-bold tracking-tight">
              Edit API key
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="btn-ghost"
              aria-label="Close"
            >
              <span aria-hidden>×</span>
            </button>
          </div>

          <div>
            <label htmlFor="api-key-edit-label" className="label block mb-2">
              Label
            </label>
            <input
              id="api-key-edit-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input"
              maxLength={120}
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="api-key-edit-scope" className="label block mb-2">
              Scope to app names
            </label>
            <input
              id="api-key-edit-scope"
              type="text"
              value={scopeAppsText}
              onChange={(e) => setScopeAppsText(e.target.value)}
              placeholder="checkout-bot, marketing-agent"
              className="input"
            />
            <p className="text-xs text-muted mt-2">
              Comma-separated. Clear the field to allow any app.
            </p>
          </div>

          {error && (
            <div className="card-pad border border-bad/40 bg-bad/5 rounded-xl text-sm text-bad">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="btn">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
