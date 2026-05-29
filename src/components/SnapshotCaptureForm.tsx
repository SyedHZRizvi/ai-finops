'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Period = '24h' | '7d' | '30d' | 'all';

const PERIOD_OPTIONS: { value: Period; label: string; description: string }[] = [
  { value: '24h', label: '24h', description: 'Last day' },
  { value: '7d', label: '7d', description: 'Last week' },
  { value: '30d', label: '30d', description: 'Last month' },
  { value: 'all', label: 'All', description: 'Everything' },
];

interface SnapshotCaptureFormProps {
  /** Default period radio selection. Defaults to '30d'. */
  defaultPeriod?: Period;
  /** Called once the snapshot is successfully captured. */
  onCaptured?: () => void;
}

/**
 * Form for capturing a new snapshot of the current insights state.
 *
 * Submit POSTs to /api/snapshots. On success the form resets, a toast-style
 * success banner shows for a few seconds, and the surrounding page is
 * refreshed via router.refresh() so the list reflects the new row.
 */
export function SnapshotCaptureForm({
  defaultPeriod = '30d',
  onCaptured,
}: SnapshotCaptureFormProps) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setToast(null);

    const trimmed = label.trim();
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
      setLabel('');
      setNote('');
      setToast(`Snapshot "${trimmed}" captured.`);
      // Toast clears itself; on next interaction we hide it. Use a timer
      // so it disappears even if the user walks away.
      setTimeout(() => setToast(null), 4000);
      onCaptured?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capture failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="card card-pad space-y-5 fade-up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight">Capture a snapshot</h2>
          <p className="text-xs text-muted mt-1">
            Pin the current insights output. Useful as a baseline before
            running a cost-reduction campaign — you can compare any two
            snapshots later.
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-brand-gradient shadow-glow flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </div>
      </div>

      <div>
        <label htmlFor="snapshot-label" className="label block mb-2">
          Label <span className="text-bad">*</span>
        </label>
        <input
          id="snapshot-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder='e.g. "May 2026 baseline" or "Pre-Q3 optimization push"'
          maxLength={120}
          className="input"
          required
        />
      </div>

      <div>
        <label htmlFor="snapshot-note" className="label block mb-2">
          Note (optional)
        </label>
        <textarea
          id="snapshot-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Context that future-you will want — what changed, who asked, ticket links…"
          rows={3}
          maxLength={4000}
          className="input"
        />
      </div>

      <div>
        <div className="label mb-2">Period</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PERIOD_OPTIONS.map((opt) => {
            const active = opt.value === period;
            return (
              <label
                key={opt.value}
                className={`btn cursor-pointer flex flex-col items-start py-3 transition-all ${
                  active
                    ? 'border-brand bg-brand/10 text-brandLight'
                    : ''
                }`}
              >
                <input
                  type="radio"
                  name="snapshot-period"
                  value={opt.value}
                  checked={active}
                  onChange={() => setPeriod(opt.value)}
                  className="sr-only"
                />
                <span className="font-semibold text-sm">{opt.label}</span>
                <span className="text-xs text-muted">{opt.description}</span>
              </label>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="card-pad border border-bad/40 bg-bad/5 rounded-xl text-sm text-bad">
          {error}
        </div>
      )}
      {toast && (
        <div
          className="card-pad border border-good/40 bg-good/5 rounded-xl text-sm text-good flex items-center gap-2"
          role="status"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Capturing...' : 'Capture snapshot'}
        </button>
        <span className="text-xs text-muted">
          Computes insights for the selected period and stores the result.
        </span>
      </div>
    </form>
  );
}
