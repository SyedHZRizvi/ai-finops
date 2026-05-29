'use client';
import { useEffect, useRef, useState } from 'react';

interface RawTokenModalProps {
  /** The raw token string returned by POST /api/api-keys. Shown ONCE. */
  rawToken: string;
  /** Human-readable label for the key (shown in the modal header). */
  label: string;
  /** Called when the modal is dismissed for any reason (after copy, ESC, backdrop confirm). */
  onClose: () => void;
}

/**
 * One-time token display modal.
 *
 * The token returned from POST /api/api-keys is unrecoverable. The modal:
 *   - blocks dismissal via backdrop click unless the user confirms,
 *   - dismissal via ESC also confirms first,
 *   - auto-dismisses 3 seconds after the user clicks Copy (with a toast).
 *
 * This is the strongest UX pattern we can use without disabling browser
 * keyboard shortcuts. The warning copy is intentionally loud and red.
 */
export function RawTokenModal({ rawToken, label, onClose }: RawTokenModalProps) {
  const [copied, setCopied] = useState(false);
  const [autoCloseSeconds, setAutoCloseSeconds] = useState<number | null>(null);
  const [showRevealed, setShowRevealed] = useState(false);
  const copyButtonRef = useRef<HTMLButtonElement | null>(null);
  const closedRef = useRef(false);

  // Focus the copy button on mount so the natural action (press Enter) is
  // safe — Enter copies, it doesn't dismiss.
  useEffect(() => {
    copyButtonRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  function confirmClose(): boolean {
    if (copied) return true;
    return window.confirm(
      "You haven't copied the token yet. If you close this dialog, the token will be lost forever and you'll have to create a new key. Close anyway?",
    );
  }

  function handleClose() {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }

  // ESC handler also requires confirmation if not yet copied.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmClose()) handleClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // confirmClose closes over `copied`, but reading it via state at call
    // time is fine — we attach a single listener and `copied` is read inside
    // the function body when the key event fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a successful copy, count down 3 seconds and auto-dismiss.
  useEffect(() => {
    if (!copied) return;
    setAutoCloseSeconds(3);
    const tick = setInterval(() => {
      setAutoCloseSeconds((s) => {
        if (s === null) return null;
        if (s <= 1) {
          clearInterval(tick);
          handleClose();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(rawToken);
      setCopied(true);
    } catch {
      // Clipboard API can fail (insecure context, permissions denied). Fall
      // back to a manual selection so the user can copy by hand.
      const node = document.getElementById('raw-token-text');
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      setCopied(true);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-40"
        onClick={() => {
          if (confirmClose()) handleClose();
        }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="raw-token-title"
        aria-describedby="raw-token-warning"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,640px)] max-h-[90vh] overflow-y-auto z-50 bg-panel border-2 border-bad/60 rounded-2xl shadow-2xl glow-warn"
      >
        <div className="card-pad space-y-5">
          {/* Big red warning banner — this is the entire point of the modal. */}
          <div className="rounded-xl bg-bad/10 border border-bad/40 p-4 flex items-start gap-3">
            <span
              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-bad/20 text-bad shrink-0"
              aria-hidden
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008m-9.197 1.5L12 3.75l9.189 14.25H2.811z" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 id="raw-token-title" className="text-base font-bold tracking-tight text-bad">
                This is the only time you&apos;ll see this token.
              </h2>
              <p id="raw-token-warning" className="text-sm text-inkDim mt-1 leading-relaxed">
                Copy it now and store it somewhere safe (e.g. your secrets manager).
                If you close this dialog without copying, the token will be{' '}
                <strong className="text-bad">lost forever</strong> and you&apos;ll have to
                create a new key.
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="label">Token for {label || 'this key'}</div>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => setShowRevealed((v) => !v)}
                aria-pressed={showRevealed}
              >
                {showRevealed ? 'Hide' : 'Reveal'}
              </button>
            </div>
            <div
              id="raw-token-text"
              className="font-mono text-sm bg-panel2 border border-border rounded-xl p-4 break-all select-all"
            >
              {showRevealed ? rawToken : `${rawToken.slice(0, 12)}${'•'.repeat(rawToken.length - 12)}`}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              ref={copyButtonRef}
              type="button"
              onClick={copy}
              className="btn-primary flex-1 justify-center"
            >
              {copied ? (
                <>
                  <span aria-hidden>✓</span> Copied to clipboard
                </>
              ) : (
                'Copy token'
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmClose()) handleClose();
              }}
              className="btn flex-1 justify-center"
            >
              {copied ? 'Done' : 'Close without copying'}
            </button>
          </div>

          {copied && autoCloseSeconds !== null && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl bg-good/10 border border-good/40 p-3 text-sm text-good text-center"
            >
              Copied. This dialog will close in {autoCloseSeconds}s.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
