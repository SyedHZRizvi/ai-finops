'use client';

import { useState } from 'react';
import { BulkAnnotateModal } from './BulkAnnotateModal';
import { BulkTagModal } from './BulkTagModal';

interface BulkResult {
  updated: number;
  failed: number;
  errors?: string[];
}

/**
 * Sticky bar that surfaces bulk operations whenever the user has one or
 * more prompts selected on /prompts. Lives at the bottom of the viewport
 * and slides up with a CSS transition as selections appear.
 *
 * The bar is rendered unconditionally in the host page; we toggle the
 * `data-open` attribute so the transition is "presence-driven" — the
 * element animates between the on-screen and off-screen positions
 * instead of being unmounted, which would skip the animation.
 *
 *   onClear() — host clears its selection state
 *   onExport() — host triggers CSV export of the selected ids
 *   onMutated() — fires after a successful bulk write so the host can
 *                 refresh the table (re-fetch annotations/tags, etc.)
 */
export function BulkActionBar({
  selectedIds,
  onClear,
  onExport,
  onMutated,
}: {
  selectedIds: string[];
  onClear: () => void;
  onExport?: () => void;
  onMutated?: (action: 'annotate' | 'tag', result: BulkResult) => void;
}) {
  const [modal, setModal] = useState<'annotate' | 'tag' | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const open = selectedIds.length > 0;
  const count = selectedIds.length;

  function handleSuccess(action: 'annotate' | 'tag', result: BulkResult) {
    const summary =
      result.failed > 0
        ? `${result.updated} updated, ${result.failed} failed`
        : `${result.updated} ${result.updated === 1 ? 'prompt' : 'prompts'} updated`;
    setLastResult(summary);
    setModal(null);
    onMutated?.(action, result);
    // Auto-dismiss the toast after a few seconds.
    window.setTimeout(() => setLastResult(null), 3500);
  }

  return (
    <>
      {/*
        The bar is always in the DOM. CSS handles the slide-up animation
        based on data-open so it eases in / out smoothly on selection
        changes. pointer-events-none in the closed state lets the page
        underneath stay clickable.
      */}
      <div
        data-open={open ? 'true' : 'false'}
        className="fixed inset-x-0 bottom-0 z-30 pointer-events-none transition-transform duration-200 ease-out data-[open=true]:translate-y-0 translate-y-[120%] data-[open=true]:pointer-events-auto"
        aria-hidden={!open}
      >
        <div className="mx-auto max-w-5xl px-4 pb-4">
          <div className="card card-pad flex flex-wrap items-center justify-between gap-3 border-borderBright shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="chip chip-brand tabular-nums">
                {count} selected
              </span>
              {lastResult && (
                <span className="text-xs text-good">{lastResult}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => setModal('annotate')}
                disabled={!open}
              >
                Annotate
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setModal('tag')}
                disabled={!open}
              >
                Tag
              </button>
              {onExport && (
                <button
                  type="button"
                  className="btn"
                  onClick={onExport}
                  disabled={!open}
                >
                  Export
                </button>
              )}
              <button
                type="button"
                className="btn-ghost"
                onClick={onClear}
                disabled={!open}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      {modal === 'annotate' && (
        <BulkAnnotateModal
          promptLogIds={selectedIds}
          onClose={() => setModal(null)}
          onSuccess={(r) => handleSuccess('annotate', r)}
        />
      )}
      {modal === 'tag' && (
        <BulkTagModal
          promptLogIds={selectedIds}
          onClose={() => setModal(null)}
          onSuccess={(r) => handleSuccess('tag', r)}
        />
      )}
    </>
  );
}
