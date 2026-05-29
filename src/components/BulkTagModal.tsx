'use client';

import { useEffect, useState } from 'react';
import { TagInput } from './TagInput';

interface BulkTagResult {
  updated: number;
  failed: number;
  errors?: string[];
}

/**
 * Modal that REPLACES the tags column on every selected prompt with the
 * given comma-separated string. Uses TagInput for autocomplete + chip UI,
 * which keeps the experience consistent with single-row tag editing.
 *
 * Replacement (not merge) is deliberate — bulk tagging is most often
 * used to apply a canonical taxonomy ("prod", "team-marketing") and
 * merging would let stale tags leak through.
 */
export function BulkTagModal({
  promptLogIds,
  onClose,
  onSuccess,
}: {
  promptLogIds: string[];
  onClose: () => void;
  onSuccess: (result: BulkTagResult) => void;
}) {
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          action: 'tag',
          promptLogIds,
          payload: { tags },
        }),
      });
      const json = (await r.json()) as BulkTagResult & { error?: string };
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
  const willClear = tags.trim().length === 0;

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
        aria-labelledby="bulk-tag-title"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,32rem)] z-50"
      >
        <div className="card card-pad space-y-4 shadow-2xl border-borderBright">
          <div>
            <div id="bulk-tag-title" className="text-base font-bold tracking-tight">
              Tag {count} {count === 1 ? 'prompt' : 'prompts'}
            </div>
            <div className="text-xs text-muted mt-1">
              These tags REPLACE any existing tags on every selected prompt.
              {willClear && ' Save with no tags to clear them.'}
            </div>
          </div>

          <div>
            <label className="label block mb-1.5">Tags</label>
            <TagInput value={tags} onChange={setTags} />
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
                : willClear
                  ? `Clear tags on ${count}`
                  : `Apply to ${count} ${count === 1 ? 'prompt' : 'prompts'}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
