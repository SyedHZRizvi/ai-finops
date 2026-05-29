// POST /api/prompts/bulk
//
// Apply a single operation to many prompts at once. Body:
//
//   { action: 'annotate', promptLogIds: string[], payload: { status, note? } }
//     Upserts the same annotation on every prompt in the list.
//
//   { action: 'tag', promptLogIds: string[], payload: { tags: string } }
//     REPLACES the comma-separated `tags` column on every prompt with the
//     given value. Empty string clears the tags.
//
//   { action: 'delete', promptLogIds: string[], payload?: {} }
//     Soft-delete: sets metadata.deleted = true on each row. Real rows
//     are never removed — analysts need an audit trail. The /api/prompts
//     listing is responsible for filtering these out.
//
// Returns { updated: number, failed: number, errors?: string[] } where
// `errors` collects the first few failure messages for diagnosis. The
// batch is atomic *per row* — one failing row does NOT abort the others.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  ANNOTATION_STATUSES,
  upsertAnnotation,
  type Annotation,
} from '@/lib/annotations';

export const dynamic = 'force-dynamic';

const StatusSchema = z.enum(
  ANNOTATION_STATUSES as readonly [string, ...string[]],
);

// Cap the batch size so a malicious or buggy client can't lock up the
// process for minutes. 500 covers every realistic analyst workflow (full
// page selection at the largest paginated limit is 200).
const MAX_BATCH = 500;

const PromptIdsSchema = z
  .array(z.string().min(1).max(200))
  .min(1)
  .max(MAX_BATCH);

const AnnotateBodySchema = z.object({
  action: z.literal('annotate'),
  promptLogIds: PromptIdsSchema,
  payload: z.object({
    status: StatusSchema,
    note: z.string().max(4000).nullable().optional(),
    createdBy: z.string().max(200).optional(),
  }),
});

const TagBodySchema = z.object({
  action: z.literal('tag'),
  promptLogIds: PromptIdsSchema,
  payload: z.object({
    // Free-form, comma-separated. Empty string is allowed and means "clear".
    tags: z.string().max(2000),
  }),
});

const DeleteBodySchema = z.object({
  action: z.literal('delete'),
  promptLogIds: PromptIdsSchema,
  // payload is unused but accepted for symmetry — clients can send {}.
  payload: z.record(z.unknown()).optional(),
});

const BodySchema = z.union([AnnotateBodySchema, TagBodySchema, DeleteBodySchema]);

interface BatchResult {
  updated: number;
  failed: number;
  errors: string[];
}

const MAX_ERRORS_RETURNED = 5;

function recordError(result: BatchResult, message: string) {
  result.failed += 1;
  if (result.errors.length < MAX_ERRORS_RETURNED) {
    result.errors.push(message);
  }
}

async function applyAnnotate(
  ids: string[],
  payload: { status: Annotation['status']; note?: string | null; createdBy?: string },
): Promise<BatchResult> {
  const result: BatchResult = { updated: 0, failed: 0, errors: [] };
  for (const id of ids) {
    try {
      await upsertAnnotation({
        promptLogId: id,
        status: payload.status,
        note: payload.note ?? null,
        createdBy: payload.createdBy,
      });
      result.updated += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordError(result, `${id}: ${message}`);
    }
  }
  return result;
}

async function applyTag(ids: string[], tags: string): Promise<BatchResult> {
  const result: BatchResult = { updated: 0, failed: 0, errors: [] };
  // Empty string is allowed and means "clear" — persist null in that case
  // so the column matches how unannotated rows look in the DB.
  const normalized = tags.trim().length === 0 ? null : tags.trim();
  for (const id of ids) {
    try {
      await prisma.promptLog.update({
        where: { id },
        data: { tags: normalized },
      });
      result.updated += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordError(result, `${id}: ${message}`);
    }
  }
  return result;
}

// Soft-delete marker. Matches the DEMO_MARKER convention used elsewhere
// (see /api/demo) so the listing layer can detect deleted rows with a
// plain `metadata.contains` filter — no JSON parsing in SQL.
//
// The listing layer (/api/prompts) is responsible for excluding rows
// whose metadata contains this marker. That's documented in the report
// the orchestrator receives.
const SOFT_DELETE_MARKER_KEY = 'deleted';
const SOFT_DELETE_MARKER_VALUE = true;

function mergeSoftDeleteMarker(metadata: string | null): string {
  if (!metadata) {
    return JSON.stringify({ [SOFT_DELETE_MARKER_KEY]: SOFT_DELETE_MARKER_VALUE });
  }
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    parsed[SOFT_DELETE_MARKER_KEY] = SOFT_DELETE_MARKER_VALUE;
    return JSON.stringify(parsed);
  } catch {
    // Existing metadata isn't valid JSON; wrap it in a fresh object to
    // preserve the original blob alongside the marker.
    return JSON.stringify({
      [SOFT_DELETE_MARKER_KEY]: SOFT_DELETE_MARKER_VALUE,
      original: metadata,
    });
  }
}

async function applySoftDelete(ids: string[]): Promise<BatchResult> {
  const result: BatchResult = { updated: 0, failed: 0, errors: [] };
  for (const id of ids) {
    try {
      const row = await prisma.promptLog.findUnique({
        where: { id },
        select: { metadata: true },
      });
      if (!row) {
        recordError(result, `${id}: not found`);
        continue;
      }
      const next = mergeSoftDeleteMarker(row.metadata);
      await prisma.promptLog.update({
        where: { id },
        data: { metadata: next },
      });
      result.updated += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordError(result, `${id}: ${message}`);
    }
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    if (json === null) {
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // De-dupe ids so duplicates in the payload don't double-apply or
    // double-count toward the result totals.
    const ids = Array.from(new Set(parsed.data.promptLogIds));

    let result: BatchResult;
    switch (parsed.data.action) {
      case 'annotate':
        result = await applyAnnotate(ids, {
          status: parsed.data.payload.status as Annotation['status'],
          note: parsed.data.payload.note,
          createdBy: parsed.data.payload.createdBy,
        });
        break;
      case 'tag':
        result = await applyTag(ids, parsed.data.payload.tags);
        break;
      case 'delete':
        result = await applySoftDelete(ids);
        break;
    }

    return NextResponse.json({
      updated: result.updated,
      failed: result.failed,
      // Omit the errors array when empty so the response stays terse.
      ...(result.errors.length > 0 ? { errors: result.errors } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
