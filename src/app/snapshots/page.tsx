import { listSnapshots } from '@/lib/snapshots';
import { SnapshotCaptureForm } from '@/components/SnapshotCaptureForm';
import { SnapshotList } from '@/components/SnapshotList';
import { EmptyState } from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

export default async function SnapshotsPage() {
  // Fetch the list directly via the lib helper rather than going through the
  // API route. Same data, no extra hop, and avoids a server-side fetch loop
  // when BASE_URL isn't set in the local dev environment.
  let items: Awaited<ReturnType<typeof listSnapshots>> = [];
  let loadError: string | null = null;
  try {
    items = await listSnapshots();
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Unknown error';
  }

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-2xl font-bold tracking-tight gradient-text">Snapshots</h1>
        <p className="text-sm text-muted mt-1">
          Pin moment-in-time copies of the insights output. Compare any two
          to see how your AI bill and optimization opportunities moved
          between them — this is how cost-reduction campaigns get reported.
        </p>
      </div>

      <SnapshotCaptureForm />

      {loadError && (
        <div className="card card-pad border-warn/40 bg-warn/5 text-sm text-warn">
          Couldn&apos;t load snapshots: {loadError}
        </div>
      )}

      {!loadError && items.length === 0 && (
        <EmptyState
          title="No snapshots yet"
          subtitle="Capture your first snapshot above. A good first label is something like “Today's baseline” — once you have two, you can compare them to see exactly how your spend and optimization opportunities moved."
          variant="brand"
        />
      )}

      {items.length > 0 && <SnapshotList items={items} />}
    </div>
  );
}
