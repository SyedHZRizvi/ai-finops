// /feedback — admin triage view.
//
// Server component. Reads every row out of the Feedback table directly
// via prisma (no extra fetch hop) and hands off to FeedbackList for the
// grouped-by-status rendering + inline status transitions.
//
// Access note: this page is open today behind the regular dashboard
// auth. Once the planned RBAC + workspace work lands, it should flip to
// admin-only.

import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { FeedbackList } from '@/components/FeedbackList';
import { prisma } from '@/lib/db';
import type { FeedbackListItem } from '@/app/api/feedback/list/route';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Feedback',
  description: 'Triage queue for user feedback submitted via the floating widget.',
};

const KINDS = ['bug', 'feature-request', 'praise', 'question', 'other'] as const;
const STATUSES = ['open', 'triaged', 'addressed', 'wont-do', 'duplicate'] as const;

async function loadFeedback(): Promise<{
  items: FeedbackListItem[];
  total: number;
  error: string | null;
}> {
  try {
    const [rows, total] = await Promise.all([
      prisma.feedback.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.feedback.count(),
    ]);

    const items: FeedbackListItem[] = rows.map((r) => ({
      id: r.id,
      kind: (KINDS as readonly string[]).includes(r.kind)
        ? (r.kind as (typeof KINDS)[number])
        : 'other',
      message: r.message,
      path: r.path,
      status: (STATUSES as readonly string[]).includes(r.status)
        ? (r.status as (typeof STATUSES)[number])
        : 'open',
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      createdBy: r.createdBy,
      ip: r.ip,
      userAgent: r.userAgent,
      triageNote: r.triageNote,
    }));

    return { items, total, error: null };
  } catch (err) {
    return {
      items: [],
      total: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

function countByStatus(items: FeedbackListItem[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const it of items) map[it.status] = (map[it.status] ?? 0) + 1;
  return map;
}

function countByKind(items: FeedbackListItem[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const it of items) map[it.kind] = (map[it.kind] ?? 0) + 1;
  return map;
}

export default async function FeedbackPage() {
  const { items, total, error } = await loadFeedback();
  const byStatus = countByStatus(items);
  const byKind = countByKind(items);
  const openCount = byStatus.open ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback"
        gradient
        subtitle="Everything submitted via the floating Feedback widget. Newest first, grouped by triage status."
      />

      {error && (
        <div className="card card-pad border-warn/40 bg-warn/5 text-sm text-warn">
          Couldn&apos;t load feedback: {error}
        </div>
      )}

      {!error && total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="card card-pad">
            <div className="label">Open</div>
            <div className="stat-num-sm mt-1 text-warn">{openCount}</div>
          </div>
          <div className="card card-pad">
            <div className="label">Triaged</div>
            <div className="stat-num-sm mt-1">{byStatus.triaged ?? 0}</div>
          </div>
          <div className="card card-pad">
            <div className="label">Addressed</div>
            <div className="stat-num-sm mt-1 text-good">
              {byStatus.addressed ?? 0}
            </div>
          </div>
          <div className="card card-pad">
            <div className="label">Bugs</div>
            <div className="stat-num-sm mt-1 text-bad">{byKind.bug ?? 0}</div>
          </div>
          <div className="card card-pad">
            <div className="label">Feature requests</div>
            <div className="stat-num-sm mt-1">
              {byKind['feature-request'] ?? 0}
            </div>
          </div>
        </div>
      )}

      {!error && items.length === 0 && (
        <EmptyState
          title="No feedback yet"
          subtitle="When users submit feedback via the floating widget, it'll show up here grouped by triage status. The widget is wired into every page automatically — there's nothing to configure."
          variant="brand"
        />
      )}

      {!error && items.length > 0 && <FeedbackList items={items} />}
    </div>
  );
}
