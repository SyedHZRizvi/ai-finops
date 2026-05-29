'use client';

// Header controls for the /digest page. Sits *above* the embedded digest HTML
// (which is rendered server-side via dangerouslySetInnerHTML). All actions
// operate on the digest content already on the page, so they feel instant —
// no extra fetch round-trip just to copy a URL or download HTML.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

type DigestPeriod = 'daily' | 'weekly' | 'monthly';

interface DigestControlsProps {
  period: DigestPeriod;
  /**
   * The rendered HTML document for the current digest. We hold this in a
   * data attribute / prop so client actions (download, send to webhook,
   * copy URL) don't need to refetch.
   */
  html: string;
  /**
   * The markdown rendition of the same digest, for the Copy-as-Markdown
   * action. Pre-rendered on the server so the client never needs to know
   * how to format the digest itself.
   */
  markdown: string;
}

const PERIODS: { value: DigestPeriod; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function MarkdownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function DigestControls({ period, html, markdown }: DigestControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [toast, setToast] = useState<string | null>(null);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [sending, setSending] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const webhookInputRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss the toast after a couple of seconds so the UI stays clean.
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [toast]);

  // Focus the webhook input when the inline form opens.
  useEffect(() => {
    if (webhookOpen) {
      const id = window.setTimeout(() => webhookInputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [webhookOpen]);

  function setPeriod(next: DigestPeriod) {
    const params = new URLSearchParams(sp.toString());
    params.set('period', next);
    router.push(`${pathname}?${params.toString()}`);
  }

  function showToast(msg: string) {
    setToast(msg);
  }

  function copyUrl() {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => showToast('URL copied'),
        () => showToast('Copy failed'),
      );
    } else {
      // Fallback for older browsers: select-then-execCommand.
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('URL copied');
      } catch {
        showToast('Copy failed');
      }
    }
  }

  function copyMarkdown() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(markdown).then(
        () => showToast('Markdown copied'),
        () => showToast('Copy failed'),
      );
    } else {
      showToast('Clipboard unavailable');
    }
  }

  function downloadHtml() {
    const filename = `ai-finops-digest-${period}-${new Date().toISOString().slice(0, 10)}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after a tick so the browser has time to start the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Download started');
  }

  async function sendToWebhook() {
    const url = webhookUrl.trim();
    if (!url) {
      showToast('Enter a webhook URL');
      return;
    }
    // Quick sanity check — webhooks are almost always http(s) URLs.
    if (!/^https?:\/\//i.test(url)) {
      showToast('URL must start with http(s)://');
      return;
    }
    setSending(true);
    try {
      // POST the HTML body. Slack and Teams both accept `text/html` payloads
      // wrapped in their own JSON envelope; rather than try to guess the
      // shape, we send the raw HTML and let the receiver decide. Operators
      // that need Slack-shaped payloads will run a small relay anyway.
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
        body: html,
        // CORS may block the response read; we don't care about the body,
        // just whether the network call resolved without throwing.
        mode: 'cors',
      });
      if (res.ok || res.type === 'opaque') {
        showToast('Sent');
        setWebhookOpen(false);
        setWebhookUrl('');
      } else {
        showToast(`Webhook returned ${res.status}`);
      }
    } catch (err) {
      // CORS preflight failures look like network errors. We still surface
      // them as best we can so the operator knows the call didn't land.
      const msg = err instanceof Error ? err.message : 'send failed';
      showToast(msg.length > 60 ? 'Send failed (see console)' : msg);
      // eslint-disable-next-line no-console
      console.error('digest webhook send failed', err);
    } finally {
      setSending(false);
    }
  }

  const periodPills = useMemo(
    () =>
      PERIODS.map((p) => {
        const active = p.value === period;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
              active
                ? 'bg-brand-gradient text-white shadow-glow'
                : 'text-muted hover:text-ink hover:bg-panel2'
            }`}
          >
            {p.label}
          </button>
        );
      }),
    // setPeriod is closed over `pathname`/`sp`/`router` which are referenced
    // implicitly; the surrounding effect rules don't apply here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center gap-1 rounded-xl bg-panel border border-border p-1 shadow-card">
          {periodPills}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={copyUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-ink border border-border bg-panel2 hover:bg-panel3 hover:border-borderBright transition-all duration-150"
          >
            <CopyIcon />
            <span>Copy URL</span>
          </button>
          <button
            type="button"
            onClick={copyMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-ink border border-border bg-panel2 hover:bg-panel3 hover:border-borderBright transition-all duration-150"
          >
            <MarkdownIcon />
            <span>Copy as Markdown</span>
          </button>
          <button
            type="button"
            onClick={downloadHtml}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-ink border border-border bg-panel2 hover:bg-panel3 hover:border-borderBright transition-all duration-150"
          >
            <DownloadIcon />
            <span>Download HTML</span>
          </button>
          <button
            type="button"
            onClick={() => setWebhookOpen((v) => !v)}
            aria-expanded={webhookOpen}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
              webhookOpen
                ? 'bg-brand/15 text-brandLight border border-brand/30'
                : 'text-muted hover:text-ink border border-border bg-panel2 hover:bg-panel3 hover:border-borderBright'
            }`}
          >
            <SendIcon />
            <span>Send to webhook</span>
          </button>
        </div>
      </div>

      {webhookOpen && (
        <div className="card card-pad flex items-center gap-2 flex-wrap">
          <input
            ref={webhookInputRef}
            type="url"
            placeholder="https://hooks.slack.com/services/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendToWebhook();
              if (e.key === 'Escape') setWebhookOpen(false);
            }}
            className="input flex-1 min-w-[260px]"
            disabled={sending}
          />
          <button
            type="button"
            onClick={sendToWebhook}
            disabled={sending}
            className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
          <button
            type="button"
            onClick={() => setWebhookOpen(false)}
            className="btn"
            disabled={sending}
          >
            Cancel
          </button>
          <div className="basis-full text-xs text-muted leading-relaxed">
            POSTs the digest HTML to the URL with{' '}
            <code className="font-mono text-inkDim">Content-Type: text/html</code>. Slack/Teams may
            need a small relay to wrap it in their JSON envelope.
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-panel2 border border-borderBright shadow-card text-sm text-ink"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
