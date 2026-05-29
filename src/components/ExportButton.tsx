'use client';

import { useEffect, useRef, useState } from 'react';

interface ExportButtonProps {
  url: string;
  label?: string;
  filename?: string;
}

function appendFormat(url: string, format: 'csv' | 'json'): string {
  // Preserve existing query params if any. URL may be relative (e.g.
  // "/api/export/prompts") so build via URLSearchParams manually rather
  // than `new URL(...)`.
  const [path, query] = url.split('?');
  const params = new URLSearchParams(query ?? '');
  params.set('format', format);
  return `${path}?${params.toString()}`;
}

function DownloadIcon() {
  // 14x14 inline SVG; inherits currentColor so it picks up text color.
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
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transition: 'transform 150ms ease',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      }}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ExportButton({ url, label = 'Export', filename }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);
  const lastItemRef = useRef<HTMLAnchorElement>(null);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // When the menu opens, focus the first item for keyboard users.
  useEffect(() => {
    if (open) {
      // Defer so the element exists.
      const id = window.setTimeout(() => firstItemRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  function onItemKeyDown(e: React.KeyboardEvent<HTMLAnchorElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (document.activeElement === firstItemRef.current) {
        lastItemRef.current?.focus();
      } else {
        firstItemRef.current?.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (document.activeElement === lastItemRef.current) {
        firstItemRef.current?.focus();
      } else {
        lastItemRef.current?.focus();
      }
    } else if (e.key === 'Tab') {
      // Let Tab close the menu naturally.
      setOpen(false);
    }
  }

  // Trigger a download. We rely on the server's Content-Disposition for
  // the filename, but the `download` attribute on the anchor is a hint
  // for the browser in case the server header is stripped by a proxy.
  function downloadHref(format: 'csv' | 'json'): string {
    return appendFormat(url, format);
  }

  function downloadName(format: 'csv' | 'json'): string {
    if (filename) return `${filename}.${format}`;
    return '';
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-ink border border-border bg-panel2 hover:bg-panel3 hover:border-borderBright transition-all duration-150"
      >
        <DownloadIcon />
        <span>{label}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 mt-1 z-20 min-w-[160px] rounded-xl border border-border bg-panel shadow-card overflow-hidden"
        >
          <a
            ref={firstItemRef}
            href={downloadHref('csv')}
            download={downloadName('csv') || undefined}
            role="menuitem"
            onKeyDown={onItemKeyDown}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-xs text-muted hover:text-ink hover:bg-panel2 focus:outline-none focus:bg-panel2 focus:text-ink transition-colors duration-100"
          >
            <DownloadIcon />
            <span>Download CSV</span>
          </a>
          <a
            ref={lastItemRef}
            href={downloadHref('json')}
            download={downloadName('json') || undefined}
            role="menuitem"
            onKeyDown={onItemKeyDown}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-xs text-muted hover:text-ink hover:bg-panel2 focus:outline-none focus:bg-panel2 focus:text-ink transition-colors duration-100 border-t border-border"
          >
            <DownloadIcon />
            <span>Download JSON</span>
          </a>
        </div>
      )}
    </div>
  );
}
