'use client';

/**
 * Renders the formatted payload JSON for a selected audit row. Used inline
 * by `AuditTable` when a row is expanded — kept separate so the table
 * stays focused on layout and the JSON-rendering logic has somewhere to
 * grow (truncation, copy-to-clipboard, etc.) without bloating the table
 * component.
 */

import { useState } from 'react';

interface AuditExpandRowProps {
  payload: unknown;
  userAgent: string | null;
}

/**
 * Pretty-print the payload as JSON. We accept `unknown` and recover from
 * anything pathological (e.g. circular refs) by falling back to
 * `String(value)` — the alternative is throwing and breaking the page.
 */
function formatPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return 'null';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function AuditExpandRow({ payload, userAgent }: AuditExpandRowProps) {
  const formatted = formatPayload(payload);
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      // Brief visual confirmation; reset so the button is reusable.
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail under iframes or insecure contexts —
      // silently swallow so the row still renders.
    }
  }

  const isEmpty =
    payload === null ||
    payload === undefined ||
    (typeof payload === 'object' && payload !== null && Object.keys(payload as object).length === 0);

  return (
    <div className="space-y-3 fade-up">
      {userAgent && (
        <div className="text-[11px] text-muted">
          <span className="uppercase tracking-wider font-semibold">User agent</span>
          <div className="font-mono text-xs text-inkDim mt-1 break-all">{userAgent}</div>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
          Payload
        </span>
        {!isEmpty && (
          <button
            type="button"
            onClick={onCopy}
            className="btn-ghost text-xs"
            aria-label="Copy payload JSON"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {isEmpty ? (
        <div className="text-xs text-muted italic">No payload recorded.</div>
      ) : (
        <pre className="text-xs font-mono leading-relaxed bg-panel2 border border-border rounded-xl p-4 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-all">
          {formatted}
        </pre>
      )}
    </div>
  );
}
