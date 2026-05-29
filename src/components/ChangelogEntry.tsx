'use client';

import { useState } from 'react';
import type { ChangelogRelease, ChangelogTag } from '@/lib/changelog';

// Per-tag chip class. Keeps each release card visually scannable — the
// tag colors at the top of the card double as a legend (most cards are
// brand=feature; a "fix" card stands out).
const TAG_CHIP: Record<ChangelogTag, string> = {
  feature: 'chip-brand',
  fix: 'chip-warn',
  security: 'chip-bad',
  performance: 'chip-teal',
  polish: 'chip-lime',
};

const TAG_LABEL: Record<ChangelogTag, string> = {
  feature: 'Feature',
  fix: 'Fix',
  security: 'Security',
  performance: 'Performance',
  polish: 'Polish',
};

function formatDate(iso: string): string {
  // Build the Date with an explicit UTC midnight so the rendered string
  // doesn't drift across timezones for an ISO yyyy-mm-dd input.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export interface ChangelogEntryProps {
  release: ChangelogRelease;
  /**
   * When true (default), the card renders with sections collapsed so the
   * timeline reads as a digest. Click the "Show details" button to expand.
   * The most recent release on the page can pass `defaultOpen` so it
   * lands fully visible.
   */
  defaultOpen?: boolean;
}

/**
 * Single release card in the changelog timeline. Encapsulates the
 * collapse/expand state so the parent server component stays static.
 */
export function ChangelogEntry({ release, defaultOpen = false }: ChangelogEntryProps) {
  const [open, setOpen] = useState(defaultOpen);

  const totalItems = release.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <article
      id={`v${release.version}`}
      className="card card-pad space-y-4 scroll-mt-24"
      aria-labelledby={`v${release.version}-title`}
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="chip chip-brand font-mono tabular-nums text-sm">
            v{release.version}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {formatDate(release.date)}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {release.tags.map((t) => (
              <span key={t} className={`chip ${TAG_CHIP[t]}`}>
                {TAG_LABEL[t]}
              </span>
            ))}
          </div>
        </div>
        <h2
          id={`v${release.version}-title`}
          className="text-xl font-bold tracking-tight"
        >
          {release.title}
        </h2>
        <p className="text-sm text-inkDim leading-relaxed">{release.summary}</p>
      </header>

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="text-[11px] uppercase tracking-wider text-muted">
          {release.sections.length}{' '}
          {release.sections.length === 1 ? 'section' : 'sections'}{' '}
          <span aria-hidden>·</span> {totalItems}{' '}
          {totalItems === 1 ? 'change' : 'changes'}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-ghost text-xs"
          aria-expanded={open}
          aria-controls={`v${release.version}-details`}
        >
          {open ? 'Hide details' : 'Show details'}
        </button>
      </div>

      {open && (
        <div
          id={`v${release.version}-details`}
          className="border-t border-border pt-4 space-y-5 fade-up"
        >
          {release.sections.map((section) => (
            <section key={section.heading} className="space-y-2">
              <h3 className="section-title">{section.heading}</h3>
              <ul className="space-y-1.5 text-sm text-inkDim">
                {section.items.map((item, idx) => (
                  <li
                    // Items are short imperative bullets; the parent section
                    // heading + index gives us a stable key even if two
                    // sections happen to share an identical item string.
                    key={`${section.heading}-${idx}`}
                    className="flex gap-2.5 leading-relaxed"
                  >
                    <span
                      className="mt-2 w-1 h-1 rounded-full bg-brand shrink-0"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
