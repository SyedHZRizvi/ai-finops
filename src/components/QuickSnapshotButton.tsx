'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Period = '24h' | '7d' | '30d' | 'all';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
];

interface QuickSnapshotButtonProps {
  /** Pre-fill the period selector. Defaults to the page's selected period or 30d. */
  defaultPeriod?: Period;
  /** Custom button label. Defaults to "Snapshot now". */
  label?: string;
  /** Use the compact "btn" style instead of "btn-primary". */
  compact?: boolean;
}

/**
 * Small "Snapshot now" trigger that opens a modal for capturing a snapshot
 * without leaving the current page. Most useful from /insights where the
 * analyst is already looking at numbers they want to pin.
 *
 * Different from SnapshotCaptureForm in two ways:
 *   1. It's a button that opens a modal, not an always-visible form.
 *   2. On success it navigates to the new snapshot's detail page so the
 *      user can confirm the capture rather than discovering it in a list.
 */
export function QuickSnapshotButton({
  defaultPeriod = '30d',
  label = 'Snapshot now',
  compact = false,
}: QuickSnapshotButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [labelText, setLabelText] = useState('');
  const [note, setNote] = useState('');
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time we close so a re-open doesn't show stale text.
  useEffect(() => {
    if (!open) {
      setError(null);
      // Keep label/note draft across opens within the same mount — user
      // closing accidentally shouldn't wipe their typing. But reset on
      // every fresh mount via the useState initializers above.
    }
  }, [open]);

  // Lock body scroll while modal is open and bind Escape to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, submitting]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = labelText.trim();
    if (!trimmed) {
      setError('Label is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: trimmed,
          note: note.trim() || undefined,
          period,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Capture failed (${res.status})`);
      }
      const json = (await res.json()) as { item?: { id?: string } };
      const id = json.item?.id;
      // Navigate so the user lands on the new snapshot.
      setOpen(false);
      if (id) {
        router.push(`/snapshots/${encodeURIComponent(id)}`);
      } else {
        router.push('/snapshots');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capture failed');
    } finally {
      setSubmitting(false);
    }
  }

  const btnClass = compact ? 'btn' : 'btn-primary';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={btnClass}
        title="Capture a snapshot of the current insights"
      >
        <span aria-hidden>📸</span>
        <span>{label}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-40"
            onClick={() => {
              if (!submitting) setOpen(false);
            }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-snapshot-title"
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,560px)] max-h-[90vh] overflow-y-auto z-50 bg-panel border border-borderBright rounded-2xl shadow-2xl"
          >
            <form onSubmit={submit} className="card-pad space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-gradient shadow-glow flex items-center justify-center">
                    <span aria-hidden className="text-lg">📸</span>
                  </div>
                  <div>
                    <h2 id="quick-snapshot-title" className="text-base font-bold tracking-tight">
                      Snapshot now
                    </h2>
                    <p className="text-xs text-muted mt-0.5">
                      Pins the insights for the selected period.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="btn-ghost"
                  aria-label="Close"
                >
                  <span aria-hidden>×</span>
                </button>
              </div>

              <div>
                <label htmlFor="quick-snapshot-label" className="label block mb-2">
                  Label <span className="text-bad">*</span>
                </label>
                <input
                  id="quick-snapshot-label"
                  type="text"
                  value={labelText}
                  onChange={(e) => setLabelText(e.target.value)}
                  placeholder='e.g. "Pre-Q3 baseline"'
                  maxLength={120}
                  className="input"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label htmlFor="quick-snapshot-note" className="label block mb-2">
                  Note (optional)
                </label>
                <textarea
                  id="quick-snapshot-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Context for future-you…"
                  rows={2}
                  maxLength={4000}
                  className="input"
                />
              </div>

              <div>
                <div className="label mb-2">Period</div>
                <div className="inline-flex items-center gap-1 rounded-xl bg-panel2 border border-border p-1">
                  {PERIOD_OPTIONS.map((opt) => {
                    const active = opt.value === period;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPeriod(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                          active
                            ? 'bg-brand-gradient text-white shadow-glow'
                            : 'text-muted hover:text-ink hover:bg-panel3'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="card-pad border border-bad/40 bg-bad/5 rounded-xl text-sm text-bad">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Capturing...' : 'Capture'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
