// Feedback admin mutations.
//
//   PATCH  /api/feedback/[id]  — update status + triageNote.
//   DELETE /api/feedback/[id]  — hard-delete the row.
//
// Hard delete (not soft) because the dominant delete reason is spam /
// duplicate noise — keeping a flagged row around adds nothing. Real
// triage outcomes ride on `status` (addressed / wont-do / duplicate)
// rather than deletion.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const STATUSES = ['open', 'triaged', 'addressed', 'wont-do', 'duplicate'] as const;
const MAX_TRIAGE_NOTE_CHARS = 4000;

const PatchBodySchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    triageNote: z.string().max(MAX_TRIAGE_NOTE_CHARS).nullable().optional(),
  })
  .refine(
    (b) => b.status !== undefined || b.triageNote !== undefined,
    { message: 'at least one of status, triageNote must be provided' },
  );

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'missing id' }, { status: 400 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
    }

    const parsed = PatchBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const existing = await prisma.feedback.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Build only the fields we want to update so we don't accidentally
    // wipe sibling columns that weren't in the request body.
    const data: { status?: string; triageNote?: string | null } = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.triageNote !== undefined) {
      data.triageNote =
        body.triageNote && body.triageNote.trim().length > 0
          ? body.triageNote
          : null;
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ok: true,
      item: {
        id: updated.id,
        kind: updated.kind,
        message: updated.message,
        path: updated.path,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        createdBy: updated.createdBy,
        triageNote: updated.triageNote,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'missing id' }, { status: 400 });
    }

    // Idempotent — return ok whether or not the row existed. This matches
    // the snapshot DELETE behavior and means callers can retry safely.
    await prisma.feedback.deleteMany({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
