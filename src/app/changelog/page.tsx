// /changelog — public "What's new" surface.
//
// Server component. Renders a vertical timeline of every release pulled
// from src/lib/changelog.ts, newest first. The most recent release lands
// expanded; older releases collapse to a one-line digest with a "Show
// details" toggle (handled inside ChangelogEntry on the client).
//
// We intentionally do NOT fetch from a CMS or DB — the changelog is a
// hand-curated narrative tied to actual shipped code, and treating it as
// source-controlled content keeps the marketing surface in sync with the
// repo. If we ever want a draft workflow it can grow into one.

import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ChangelogEntry } from '@/components/ChangelogEntry';
import { CHANGELOG } from '@/lib/changelog';

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'Every release of AI FinOps with the changes that shipped — features, fixes, security work, and polish.',
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ChangelogPage() {
  // CHANGELOG is authored latest-first, but we sort defensively so a
  // mis-ordered insert (or an out-of-order future entry) still renders
  // newest on top.
  const releases = [...CHANGELOG].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Changelog"
        gradient
        subtitle="Every release of AI FinOps with the changes that shipped. Latest on top — older releases collapse to a digest you can expand inline."
      />

      {/* Mini-index — version + date jump links. Useful for linking to a
          specific release from the marketing site, and gives readers a
          sense of momentum before they start scrolling. */}
      <nav
        className="card card-pad flex flex-wrap items-center gap-2"
        aria-label="Releases"
      >
        <span className="label mr-1">Jump to</span>
        {releases.map((r) => (
          <Link
            key={r.version}
            href={`#v${r.version}`}
            className="chip hover:border-brand/40 hover:text-brandLight transition-colors"
          >
            <span className="font-mono tabular-nums">v{r.version}</span>
            <span className="text-muted">·</span>
            <span className="text-muted">{formatDate(r.date)}</span>
          </Link>
        ))}
      </nav>

      {/* Vertical timeline. The accent rail to the left of each card
          visually ties the releases together; on small screens it
          collapses into a single stacked list. */}
      <ol className="relative space-y-6 md:pl-8">
        <span
          className="hidden md:block absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-brand/40 via-border to-transparent"
          aria-hidden
        />
        {releases.map((release, idx) => (
          <li key={release.version} className="relative">
            <span
              className="hidden md:block absolute -left-[1.55rem] top-6 w-3 h-3 rounded-full bg-brand-gradient shadow-glow"
              aria-hidden
            />
            <ChangelogEntry release={release} defaultOpen={idx === 0} />
          </li>
        ))}
      </ol>

      <div className="card card-pad text-sm text-inkDim flex items-center justify-between gap-3 flex-wrap">
        <p>
          See what&apos;s coming next on the{' '}
          <Link href="/roadmap" className="text-brandLight hover:underline underline-offset-4">
            roadmap
          </Link>
          , or{' '}
          <Link href="/feedback" className="text-brandLight hover:underline underline-offset-4">
            send us feedback
          </Link>
          .
        </p>
        <span className="text-xs text-muted tabular-nums">
          {releases.length} releases shipped
        </span>
      </div>
    </div>
  );
}
