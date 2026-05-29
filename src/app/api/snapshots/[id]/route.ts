// Snapshot detail — read + delete.
//
//   GET /api/snapshots/[id]
//     Returns { item: SnapshotDetail } including the full payload, or 404
//     if the snapshot doesn't exist (or its persisted JSON is corrupt and
//     can't be parsed — same surface to the caller).
//
//   DELETE /api/snapshots/[id]
//     Hard-delete. Idempotent — returns { ok: true } whether or not the
//     row existed. Snapshots have no downstream foreign keys, and "I
//     mislabeled it" is the dominant delete reason.

import { NextRequest, NextResponse } from 'next/server';
import { deleteSnapshot, getSnapshot } from '@/lib/snapshots';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: 'missing id' }, { status: 400 });
    }
    const item = await getSnapshot(id);
    if (!item) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: 'missing id' }, { status: 400 });
    }
    await deleteSnapshot(id);
    await recordAudit({
      req,
      action: 'snapshot.delete',
      targetKind: 'snapshot',
      targetId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
