'use client';

import { useEffect, useState } from 'react';
import {
  ANNOTATION_STATUSES,
  type AnnotationStatus,
} from '@/lib/annotations';

const STATUS_LABEL: Record<AnnotationStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  optimized: 'Optimized',
  'wont-fix': "Won't fix",
};

interface BulkAnnotateResult {
  updated: number;
  failed: number;
  errors?: string[];
}

/**
 * Modal that applies the same annotation to many selected prompts at
 * once. Posts to /api/prompts/bulk with action: 'annotate'.
 *
 * onSuccess fires with the bulk result so the parent (BulkActionBar /
 * /prompts page) can refresh the table and report counts.
 */
export function BulkAnnotateModal({
  promptLogIds,
  onClose,
  onSuccess,
}: {
  promptLogIds: string[];
  onClose: () => void;
  onSuccess: (result: BulkAnnotateResult) => void;
}) {
  const [status, setStatus] = useState<AnnotationStatus>('investigating');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC closes + lock background scroll, matching the existing modal
  // pattern in TemplateDetailModal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, submitting]);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/prompts/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'annotate',
          promptLogIds,
          payload: {
            status,
            note: note.trim() ? note.trim() : null,
          },
        }),
      });
      const json = (await r.json()) as BulkAnnotateResult & { error?: string };
      if (!r.ok) {
        throw new Error(json.error ?? `Failed (${r.status})`);
      }
      onSuccess(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  const count = promptLogIds.length;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-40"
        onClick={() => !submitting && onClose()}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-annotate-title"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,32rem)] z-50"
      >
        <div className="card card-pad space-y-4 shadow-2xl border-borderBright">
          <div>
            <div id="bulk-annotate-title" className="text-base font-bold tracking-tight">
              Annotate {count} {count === 1 ? 'prompt' : 'prompts'}
            </div>
            <div className="text-xs text-muted mt-1">
              The same status and note will be applied to every selected prompt.
              Any existing annotations are replaced.
            </div>
          </div>

          <div>
            <label className="label block mb-1.5" htmlFor="bulk-annotate-status">
              Status
            </label>
            <select
              id="bulk-annotate-status"
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as AnnotationStatus)}
              disabled={submitting}
            >
              {ANNOTATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label block mb-1.5" htmlFor="bulk-annotate-note">
              Note (optional)
            </label>
            <textarea
              id="bulk-annotate-note"
              className="input"
              rows={3}
              placeholder="Context — ticket #, decision rationale…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              maxLength={4000}
            />
          </div>

          {error && <div className="text-xs text-bad">Error: {error}</div>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={confirm}
              disabled={submitting}
            >
              {submitting
                ? 'Applying…'
                : `Apply to ${count} ${count === 1 ? 'prompt' : 'prompts'}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
