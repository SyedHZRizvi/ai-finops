import Link from 'next/link';
import { diffSnapshots, getSnapshot } from '@/lib/snapshots';
import { SnapshotDiffView } from '@/components/SnapshotDiffView';
import { EmptyState } from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

interface ComparePageProps {
  searchParams: { a?: string; b?: string };
}

function MissingIdsState() {
  return (
    <EmptyState
      title="No snapshots selected"
      subtitle="Pick two snapshots on the snapshots page (A and B) to compare them. The diff shows how totals moved, what got resolved, and what's newly worth doing."
      variant="brand"
      actions={
        <Link href="/snapshots" className="btn-primary">
          Go to snapshots →
        </Link>
      }
    />
  );
}

function SameIdsState() {
  return (
    <EmptyState
      title="Pick two different snapshots"
      subtitle="You can't compare a snapshot to itself. Head back and pick a second one."
      variant="warn"
      actions={
        <Link href="/snapshots" className="btn-primary">
          Back to snapshots →
        </Link>
      }
    />
  );
}

function MissingSnapshotState({ id, role }: { id: string; role: 'A' | 'B' }) {
  return (
    <EmptyState
      title={`Snapshot ${role} not found`}
      subtitle={`We couldn't find the snapshot with id "${id}". It may have been deleted.`}
      variant="warn"
      actions={
        <Link href="/snapshots" className="btn-primary">
          Back to snapshots →
        </Link>
      }
    />
  );
}

export default async function SnapshotComparePage({ searchParams }: ComparePageProps) {
  const aId = (searchParams.a ?? '').trim();
  const bId = (searchParams.b ?? '').trim();

  if (!aId || !bId) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <MissingIdsState />
      </div>
    );
  }

  if (aId === bId) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <SameIdsState />
      </div>
    );
  }

  // Parallel load — both snapshots are independent.
  const [a, b] = await Promise.all([getSnapshot(aId), getSnapshot(bId)]);

  if (!a) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <MissingSnapshotState id={aId} role="A" />
      </div>
    );
  }
  if (!b) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <MissingSnapshotState id={bId} role="B" />
      </div>
    );
  }

  const diff = diffSnapshots(a, b);

  return (
    <div className="space-y-6">
      <PageHeader />
      <SnapshotDiffView diff={diff} />
    </div>
  );
}

function PageHeader() {
  return (
    <div className="fade-up">
      <div className="text-xs text-muted mb-1">
        <Link href="/snapshots" className="hover:text-ink transition-colors inline-flex items-center gap-1">
          <span aria-hidden>←</span> Snapshots
        </Link>
      </div>
      <h1 className="text-2xl font-bold tracking-tight gradient-text">Snapshot comparison</h1>
      <p className="text-sm text-muted mt-1">
        How totals, recommendations, and savings moved between two pinned
        moments. A is the baseline; B is the after.
      </p>
    </div>
  );
}
