'use client';

import { useEffect, useState } from 'react';
import {
  ANNOTATION_STATUSES,
  type Annotation,
  type AnnotationStatus,
} from '@/lib/annotations';
import { AnnotationBadge } from './AnnotationBadge';

interface AnnotationApiResponse {
  item?: SerializedAnnotation;
  error?: string;
}

interface SerializedAnnotation {
  id: string;
  promptLogId: string;
  status: AnnotationStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

const STATUS_LABEL: Record<AnnotationStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  optimized: 'Optimized',
  'wont-fix': "Won't fix",
};

function fromSerialized(s: SerializedAnnotation): Annotation {
  return {
    id: s.id,
    promptLogId: s.promptLogId,
    status: s.status,
    note: s.note,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    createdBy: s.createdBy,
  };
}

/**
 * Inline annotation editor. Designed to live inside PromptDetail at the
 * top of the side panel. Fetches the current annotation on mount,
 * pre-fills the form, and persists via /api/annotations on save.
 *
 * Optimistic state: the local `status` + `note` track what the user is
 * typing. We only commit to /api/annotations on Save. Clear removes the
 * annotation entirely (DELETE) and resets the form to defaults.
 */
export function AnnotationForm({
  promptLogId,
  onChange,
}: {
  promptLogId: string;
  /**
   * Optional callback that fires whenever the annotation is updated or
   * cleared. Lets parents (PromptDetail / PromptTable) refresh their
   * own state without a full reload.
   */
  onChange?: (annotation: Annotation | null) => void;
}) {
  const [status, setStatus] = useState<AnnotationStatus>('open');
  const [note, setNote] = useState('');
  const [existing, setExisting] = useState<Annotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Load the current annotation (if any) when the prompt changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSavedAt(null);
    fetch(
      `/api/annotations?promptLogIds=${encodeURIComponent(promptLogId)}`,
      { cache: 'no-store' },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return (await r.json()) as { items: SerializedAnnotation[] };
      })
      .then((json) => {
        if (cancelled) return;
        const hit = json.items?.find((i) => i.promptLogId === promptLogId);
        if (hit) {
          const a = fromSerialized(hit);
          setExisting(a);
          setStatus(a.status);
          setNote(a.note ?? '');
        } else {
          setExisting(null);
          setStatus('open');
          setNote('');
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [promptLogId]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          promptLogId,
          status,
          note: note.trim() ? note.trim() : null,
        }),
      });
      const json = (await r.json()) as AnnotationApiResponse;
      if (!r.ok || !json.item) {
        throw new Error(json.error ?? `Failed (${r.status})`);
      }
      const saved = fromSerialized(json.item);
      setExisting(saved);
      setSavedAt(Date.now());
      onChange?.(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/annotations/${encodeURIComponent(promptLogId)}`,
        { method: 'DELETE' },
      );
      if (!r.ok) {
        const json = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Failed (${r.status})`);
      }
      setExisting(null);
      setStatus('open');
      setNote('');
      setSavedAt(Date.now());
      onChange?.(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    !existing ||
    existing.status !== status ||
    (existing.note ?? '') !== note;

  return (
    <div className="card card-pad space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="label">Annotation</div>
        {existing && (
          <AnnotationBadge status={existing.status} note={existing.note} />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <label className="label block mb-1.5" htmlFor="annotation-status">
            Status
          </label>
          <select
            id="annotation-status"
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as AnnotationStatus)}
            disabled={loading || saving}
          >
            {ANNOTATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label block mb-1.5" htmlFor="annotation-note">
            Note (optional)
          </label>
          <textarea
            id="annotation-note"
            className="input"
            rows={2}
            placeholder="Context — ticket #, owner, decision rationale…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={loading || saving}
            maxLength={4000}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted">
          {loading && 'Loading…'}
          {!loading && error && <span className="text-bad">Error: {error}</span>}
          {!loading && !error && saving && 'Saving…'}
          {!loading && !error && !saving && savedAt && (
            <span className="text-good">Saved</span>
          )}
          {!loading && !error && !saving && !savedAt && existing && (
            <span>
              Last updated{' '}
              <span className="tabular-nums">
                {existing.updatedAt.toLocaleString()}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {existing && (
            <button
              type="button"
              className="btn"
              onClick={clear}
              disabled={saving || loading}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={save}
            disabled={saving || loading || !dirty}
          >
            {saving ? 'Saving…' : existing ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
