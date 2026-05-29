'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// Kinds + their human labels. Order is the order they appear in the
// radio strip — "bug" first because it's the highest-signal feedback we
// can act on, "other" last as the catch-all.
const KINDS = [
  { value: 'bug', label: 'Bug', hint: 'Something is broken' },
  {
    value: 'feature-request',
    label: 'Feature request',
    hint: "Something you'd love to have",
  },
  { value: 'praise', label: 'Praise', hint: 'Something you love' },
  { value: 'question', label: 'Question', hint: 'You need help' },
  { value: 'other', label: 'Other', hint: 'Anything else' },
] as const;

type FeedbackKind = (typeof KINDS)[number]['value'];

const MAX_MESSAGE_CHARS = 4000;
const MAX_EMAIL_CHARS = 320;

interface PostResponse {
  id?: string;
  error?: string;
}

export interface FeedbackModalProps {
  /** Called when the user closes the modal (success or cancel). */
  onClose: () => void;
}

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pathname = usePathname();

  // Close on ESC + lock background scroll while open. Mirrors the
  // pattern used by TemplateDetailModal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Autofocus the textarea so submitting is one keystroke + one click.
    // Skip when the success screen renders since the textarea is unmounted.
    textareaRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      setError('Please add a message before submitting.');
      return;
    }
    if (trimmed.length > MAX_MESSAGE_CHARS) {
      setError(`Message exceeds ${MAX_MESSAGE_CHARS} characters.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          message: trimmed,
          path: pathname ?? undefined,
          // `createdBy` carries the optional email — the schema doesn't
          // enforce a format, but we trim and only send when present.
          createdBy: email.trim() ? email.trim() : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as PostResponse;
      if (!res.ok || !json.id) {
        throw new Error(json.error ?? `Submit failed (${res.status})`);
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  const remaining = MAX_MESSAGE_CHARS - message.length;
  const overLimit = remaining < 0;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-40"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="card card-pad w-full max-w-lg pointer-events-auto fade-up max-h-[90vh] overflow-y-auto">
          <header className="flex items-start justify-between gap-3 mb-5">
            <div className="min-w-0">
              <h2
                id="feedback-modal-title"
                className="text-lg font-bold tracking-tight"
              >
                {submitted ? 'Thanks for sharing' : 'Send feedback'}
              </h2>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                {submitted
                  ? 'It goes straight into our triage queue.'
                  : pathname
                  ? `Telling us about ${pathname}? Drop a note below — we read every one.`
                  : 'Drop a note below — we read every one.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost text-sm"
              aria-label="Close"
            >
              <span aria-hidden>×</span>
            </button>
          </header>

          {submitted ? (
            <div className="space-y-4">
              <div className="card-pad bg-good/10 border border-good/30 rounded-xl text-sm text-good">
                Got it — thank you. We&apos;ll triage this in our next pass.
              </div>
              <div className="text-sm text-inkDim leading-relaxed">
                <p className="font-medium text-ink mb-2">Want to tell us more?</p>
                <p>
                  If there&apos;s extra context that didn&apos;t fit (a screenshot,
                  a request ID, the exact steps you took), reset the form and
                  send a follow-up — we link them by submission time during
                  triage.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSubmitted(false);
                    setMessage('');
                    setError(null);
                    // Don't reset kind or email — likely the same context.
                    textareaRef.current?.focus();
                  }}
                >
                  Send another
                </button>
                <button type="button" className="btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="label mb-1">What kind of feedback?</legend>
                <div className="flex flex-wrap gap-2">
                  {KINDS.map((k) => {
                    const selected = kind === k.value;
                    return (
                      <button
                        key={k.value}
                        type="button"
                        onClick={() => setKind(k.value)}
                        className={`chip transition-colors ${
                          selected
                            ? 'border-brand/60 bg-brand/15 text-brandLight'
                            : 'hover:border-borderBright'
                        }`}
                        aria-pressed={selected}
                        title={k.hint}
                      >
                        {k.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="space-y-1.5">
                <label htmlFor="feedback-message" className="label block">
                  Message
                </label>
                <textarea
                  id="feedback-message"
                  ref={textareaRef}
                  className="input min-h-[140px]"
                  placeholder="What happened? What did you expect? Steps to reproduce help a lot for bugs."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={submitting}
                  // Allow typing past the limit so the live counter can
                  // turn red — better UX than a hard caret block. The
                  // submit handler blocks the actual POST.
                  maxLength={MAX_MESSAGE_CHARS + 200}
                  required
                />
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">
                    {pathname ? (
                      <>
                        Path:{' '}
                        <span className="font-mono text-inkDim">{pathname}</span>
                      </>
                    ) : (
                      'Captured with your current page path.'
                    )}
                  </span>
                  <span
                    className={`tabular-nums ${
                      overLimit
                        ? 'text-bad'
                        : remaining < 200
                        ? 'text-warn'
                        : 'text-muted'
                    }`}
                  >
                    {remaining}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="feedback-email" className="label block">
                  Your email{' '}
                  <span className="text-muted normal-case font-normal">
                    (optional, only if you want a follow-up)
                  </span>
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  className="input"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  maxLength={MAX_EMAIL_CHARS}
                />
              </div>

              {error && (
                <div className="card-pad bg-bad/10 border border-bad/30 rounded-xl text-sm text-bad">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="btn"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={
                    submitting || overLimit || message.trim().length === 0
                  }
                >
                  {submitting ? 'Sending…' : 'Send feedback'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
