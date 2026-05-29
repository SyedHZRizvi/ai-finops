// DELETE /api/annotations/[promptLogId]
//
// Clear the annotation for a single prompt. Idempotent — succeeds with
// { ok: true } whether or not an annotation existed for the prompt.
//
// We key on promptLogId (the prompt being annotated) rather than the
// annotation row id because clients of this endpoint think in terms of
// "remove the tag from this prompt", not "delete annotation row xyz".

import { NextRequest, NextResponse } from 'next/server';
import { deleteAnnotation } from '@/lib/annotations';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { promptLogId: string } },
) {
  try {
    const id = params.promptLogId;
    if (!id) {
      return NextResponse.json({ error: 'missing promptLogId' }, { status: 400 });
    }
    await deleteAnnotation(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
