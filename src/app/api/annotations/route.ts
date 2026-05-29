// Annotations API.
//
//   GET /api/annotations?promptLogIds=a,b,c
//     Returns { items: Annotation[] } — the most recent annotation per
//     promptLogId. Without the query param, returns every annotation in
//     the DB (use sparingly; intended for small admin contexts).
//
//   POST /api/annotations
//     Body: { promptLogId, status, note?, createdBy? }
//     Upserts the annotation for a single prompt. Returns { item }.
//
// Per-prompt DELETE lives at /api/annotations/[promptLogId]/route.ts —
// REST clients DELETE by the prompt being annotated, not by annotation id.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ANNOTATION_STATUSES,
  getAnnotations,
  upsertAnnotation,
  type Annotation,
  type AnnotationStatus,
} from '@/lib/annotations';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';

function coerceStatus(value: string): AnnotationStatus {
  return (ANNOTATION_STATUSES as readonly string[]).includes(value)
    ? (value as AnnotationStatus)
    : 'open';
}

export const dynamic = 'force-dynamic';

const StatusSchema = z.enum(
  ANNOTATION_STATUSES as readonly [string, ...string[]],
);

const PostBodySchema = z.object({
  promptLogId: z.string().min(1).max(200),
  status: StatusSchema,
  note: z.string().max(4000).nullable().optional(),
  createdBy: z.string().max(200).optional(),
});

const GetQuerySchema = z.object({
  promptLogIds: z.string().optional(),
});

function serializeAnnotation(a: Annotation) {
  return {
    id: a.id,
    promptLogId: a.promptLogId,
    status: a.status,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    createdBy: a.createdBy,
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = GetQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid query', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.promptLogIds) {
      const ids = parsed.data.promptLogIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const map = await getAnnotations(ids);
      const items = Array.from(map.values()).map(serializeAnnotation);
      return NextResponse.json({ items });
    }

    // No filter: return every annotation, most-recent-first. Capped at a
    // reasonable ceiling so this endpoint can't be used to dump the DB.
    const rows = await prisma.promptAnnotation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    // Deduplicate by promptLogId — keep only the latest annotation per
    // prompt to match the contract elsewhere in the codebase.
    const seen = new Set<string>();
    const items: ReturnType<typeof serializeAnnotation>[] = [];
    for (const row of rows) {
      if (seen.has(row.promptLogId)) continue;
      seen.add(row.promptLogId);
      // We trust the DB row shape; toAnnotation() inside getAnnotations()
      // would coerce status, but here we go via serializeAnnotation
      // directly since rows are already strongly typed by Prisma.
      items.push({
        id: row.id,
        promptLogId: row.promptLogId,
        status: coerceStatus(row.status),
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        createdBy: row.createdBy,
      });
    }

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    if (json === null) {
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
    }
    const parsed = PostBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const saved = await upsertAnnotation({
      promptLogId: parsed.data.promptLogId,
      // Cast: zod has already narrowed this to the union of our statuses.
      status: parsed.data.status as Annotation['status'],
      note: parsed.data.note ?? null,
      createdBy: parsed.data.createdBy,
    });

    await recordAudit({
      req,
      action: 'annotation.upsert',
      targetKind: 'annotation',
      targetId: saved.promptLogId,
      payload: {
        promptLogId: saved.promptLogId,
        status: saved.status,
        hasNote: typeof saved.note === 'string' && saved.note.length > 0,
      },
    });

    return NextResponse.json({ item: serializeAnnotation(saved) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
