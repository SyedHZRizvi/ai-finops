// POST /api/snapshots/diff
//
// Body: { aId, bId }
// Returns: { diff: SnapshotDiff }
//
// Compares two snapshots. `a` is the baseline ("before"); `b` is the
// comparison target ("after"). The diff itself is computed by a pure
// function in src/lib/snapshots.ts — this endpoint just loads the two
// snapshots and hands them off.
//
// POST (not GET) so the two ids can travel in the body rather than ballooning
// the querystring, and so this endpoint can later be extended with diff
// options (filters, sort, etc.) without an API break.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { diffSnapshots, getSnapshot } from '@/lib/snapshots';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  aId: z.string().min(1, 'aId is required'),
  bId: z.string().min(1, 'bId is required'),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { aId, bId } = parsed.data;

  if (aId === bId) {
    return NextResponse.json(
      { error: 'aId and bId must reference different snapshots' },
      { status: 400 },
    );
  }

  try {
    // Load both in parallel — they're independent.
    const [a, b] = await Promise.all([getSnapshot(aId), getSnapshot(bId)]);

    if (!a) {
      return NextResponse.json(
        { error: `snapshot ${aId} not found` },
        { status: 404 },
      );
    }
    if (!b) {
      return NextResponse.json(
        { error: `snapshot ${bId} not found` },
        { status: 404 },
      );
    }

    const diff = diffSnapshots(a, b);
    return NextResponse.json({ diff });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
