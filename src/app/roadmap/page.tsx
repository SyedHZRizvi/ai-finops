// /roadmap — public forward-looking surface.
//
// Server component. Renders the hand-curated ROADMAP grouped by status
// (Shipped, In progress, Planned, Considering). Status + category
// filters live in the URL so links into a specific slice (e.g.
// /roadmap?status=in-progress) are shareable.
//
// We don't paginate — the roadmap is bounded (~30 items) and the value
// is in seeing the whole picture in one place.

import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { RoadmapItemCard } from '@/components/RoadmapItemCard';
import {
  ROADMAP,
  type RoadmapCategory,
  type RoadmapItem,
  type RoadmapStatus,
} from '@/lib/roadmap';

export const metadata: Metadata = {
  title: 'Roadmap',
  description:
    "What's shipped, what we're building, and what we're considering for AI FinOps.",
};

const STATUSES: RoadmapStatus[] = [
  'shipped',
  'in-progress',
  'planned',
  'considering',
];

const CATEGORIES: RoadmapCategory[] = [
  'platform',
  'analytics',
  'integrations',
  'governance',
  'experience',
];

const STATUS_LABEL: Record<RoadmapStatus, string> = {
  shipped: 'Shipped',
  'in-progress': 'In progress',
  planned: 'Planned',
  considering: 'Considering',
};

const STATUS_BLURB: Record<RoadmapStatus, string> = {
  shipped: 'Already live and in the changelog. Click a version to jump.',
  'in-progress':
    'Active work — these are what we expect to ship in the next wave or two.',
  planned: 'Committed but not yet started. Order is not a priority signal.',
  considering:
    'Speculative. We\'d love feedback on these before we commit one way or the other.',
};

const CATEGORY_LABEL: Record<RoadmapCategory, string> = {
  platform: 'Platform',
  analytics: 'Analytics',
  integrations: 'Integrations',
  governance: 'Governance',
  experience: 'Experience',
};

interface RoadmapSearchParams {
  status?: string;
  category?: string;
}

function isStatus(v: string | undefined): v is RoadmapStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

function isCategory(v: string | undefined): v is RoadmapCategory {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

/**
 * Build a filter URL preserving whichever filters are still active. We
 * keep URL state minimal (drop the key when "All" is selected) so links
 * are short and don't grow with every click.
 */
function buildHref(opts: {
  status?: RoadmapStatus | '';
  category?: RoadmapCategory | '';
}): string {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  if (opts.category) qs.set('category', opts.category);
  const s = qs.toString();
  return s ? `/roadmap?${s}` : '/roadmap';
}

export default function RoadmapPage({
  searchParams,
}: {
  searchParams?: RoadmapSearchParams;
}) {
  const params = searchParams ?? {};
  const activeStatus: RoadmapStatus | '' = isStatus(params.status)
    ? params.status
    : '';
  const activeCategory: RoadmapCategory | '' = isCategory(params.category)
    ? params.category
    : '';

  // Apply filters. We filter once into a single list, then group by
  // status — keeping the grouping outside the filter so empty groups
  // can still render their "nothing here" message under the heading.
  const filtered = ROADMAP.filter((it) => {
    if (activeStatus && it.status !== activeStatus) return false;
    if (activeCategory && it.category !== activeCategory) return false;
    return true;
  });

  const byStatus: Record<RoadmapStatus, RoadmapItem[]> = {
    shipped: [],
    'in-progress': [],
    planned: [],
    considering: [],
  };
  for (const item of filtered) byStatus[item.status].push(item);

  const totalShown = filtered.length;
  const totalAll = ROADMAP.length;
  const hasFilter = activeStatus !== '' || activeCategory !== '';

  // When a single status is selected, only render that group's section —
  // it'd be misleading to show "Shipped (0)" placeholders next to it.
  const visibleStatuses = activeStatus ? [activeStatus] : STATUSES;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Roadmap"
        gradient
        subtitle="What's shipped, what we're actively building, what we have planned, and what we're still considering. Filter by status or category."
      />

      <div className="card card-pad space-y-4">
        <div className="space-y-2">
          <div className="label">Status</div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ status: '', category: activeCategory })}
              className={`chip transition-colors ${
                activeStatus === ''
                  ? 'border-brand/60 bg-brand/15 text-brandLight'
                  : 'hover:border-borderBright'
              }`}
            >
              All
            </Link>
            {STATUSES.map((s) => (
              <Link
                key={s}
                href={buildHref({ status: s, category: activeCategory })}
                className={`chip transition-colors ${
                  activeStatus === s
                    ? 'border-brand/60 bg-brand/15 text-brandLight'
                    : 'hover:border-borderBright'
                }`}
              >
                {STATUS_LABEL[s]}
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="label">Category</div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ status: activeStatus, category: '' })}
              className={`chip transition-colors ${
                activeCategory === ''
                  ? 'border-brand/60 bg-brand/15 text-brandLight'
                  : 'hover:border-borderBright'
              }`}
            >
              All
            </Link>
            {CATEGORIES.map((c) => (
              <Link
                key={c}
                href={buildHref({ status: activeStatus, category: c })}
                className={`chip transition-colors ${
                  activeCategory === c
                    ? 'border-brand/60 bg-brand/15 text-brandLight'
                    : 'hover:border-borderBright'
                }`}
              >
                {CATEGORY_LABEL[c]}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted pt-1 border-t border-border">
          <span className="tabular-nums">
            Showing <span className="text-inkDim font-semibold">{totalShown}</span>{' '}
            of <span className="text-inkDim font-semibold">{totalAll}</span>
          </span>
          {hasFilter && (
            <Link href="/roadmap" className="btn-ghost text-xs">
              Clear filters
            </Link>
          )}
        </div>
      </div>

      {totalShown === 0 && (
        <div className="card card-pad text-sm text-muted">
          No items match the current filters.{' '}
          <Link href="/roadmap" className="text-brandLight hover:underline underline-offset-4">
            Clear filters
          </Link>{' '}
          to see all {totalAll} items.
        </div>
      )}

      {visibleStatuses.map((status) => {
        const items = byStatus[status];
        // Skip empty sections when the user has selected a single
        // category — they explicitly narrowed and we shouldn't render a
        // whole "Considering: nothing" panel they didn't ask for.
        if (items.length === 0 && (activeCategory !== '' || activeStatus !== '')) {
          return null;
        }
        return (
          <section key={status} className="space-y-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">
                  {STATUS_LABEL[status]}{' '}
                  <span className="text-muted text-sm font-normal tabular-nums">
                    ({items.length})
                  </span>
                </h2>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">
                  {STATUS_BLURB[status]}
                </p>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="card card-pad text-sm text-muted">
                Nothing here yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((item) => (
                  <RoadmapItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div className="card card-pad text-sm text-inkDim">
        <p>
          See what already shipped on the{' '}
          <Link
            href="/changelog"
            className="text-brandLight hover:underline underline-offset-4"
          >
            changelog
          </Link>
          . Have an idea or a friction point you want us to prioritize?{' '}
          <Link
            href="/feedback"
            className="text-brandLight hover:underline underline-offset-4"
          >
            Send feedback
          </Link>{' '}
          — it goes straight into our triage queue.
        </p>
      </div>
    </div>
  );
}
