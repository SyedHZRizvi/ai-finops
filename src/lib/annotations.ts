// Server-side helpers for the PromptAnnotation table.
//
// A prompt has at most ONE annotation. The schema stores one row per
// (promptLogId, annotation) and we treat the *most recent* row as the
// authoritative annotation for that prompt. Upsert writes a new row when
// none exists and updates the existing one in place when it does — the
// caller never has to think about ids.
//
// Statuses model the analyst workflow on /prompts:
//
//   open          → default, nothing decided yet
//   investigating → someone is actively looking at this prompt
//   optimized     → already reduced cost / restructured
//   wont-fix      → known-bad pattern but intentional or out-of-scope
//
// Notes are free-form text for context like "ticket FINOPS-142" or
// "needed by Q3 launch — won't touch".
//
// getAnnotations() is the workhorse for list pages — call it once with
// every promptLogId on the current page and consult the returned Map.
// It is intentionally a SINGLE prisma.findMany() so the /prompts page
// stays at O(1) DB roundtrips regardless of page size.

import { prisma } from './db';

export type AnnotationStatus = 'open' | 'investigating' | 'optimized' | 'wont-fix';

export const ANNOTATION_STATUSES: readonly AnnotationStatus[] = [
  'open',
  'investigating',
  'optimized',
  'wont-fix',
] as const;

export interface Annotation {
  id: string;
  promptLogId: string;
  status: AnnotationStatus;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

interface AnnotationRow {
  id: string;
  promptLogId: string;
  status: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

function isAnnotationStatus(value: string): value is AnnotationStatus {
  return (ANNOTATION_STATUSES as readonly string[]).includes(value);
}

// Coerce a raw DB row (with `status: string`) to our narrowed type. The
// schema stores status as a free-form String column (no native enum), so
// we narrow at the boundary. Anything unrecognized is mapped to 'open'
// so a stale value never crashes the UI.
function toAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    promptLogId: row.promptLogId,
    status: isAnnotationStatus(row.status) ? row.status : 'open',
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

/**
 * Fetch the most recent annotation for each of the given promptLogIds in
 * a single query. Returns a Map keyed by promptLogId. Prompts without an
 * annotation are simply absent from the Map — callers check with .get().
 *
 * O(1) DB roundtrips. Safe to call with hundreds of ids per page.
 */
export async function getAnnotations(
  promptLogIds: string[],
): Promise<Map<string, Annotation>> {
  const out = new Map<string, Annotation>();
  if (promptLogIds.length === 0) return out;

  // De-dupe so a caller that passes the same id twice doesn't fan out
  // into a larger IN-list than necessary.
  const ids = Array.from(new Set(promptLogIds));

  const rows = await prisma.promptAnnotation.findMany({
    where: { promptLogId: { in: ids } },
    orderBy: { updatedAt: 'desc' },
  });

  // Because we order by updatedAt desc, the first row we see per
  // promptLogId is the most recent. Skip subsequent rows for the same
  // prompt — they're historical and shouldn't shadow the latest write.
  for (const row of rows) {
    if (out.has(row.promptLogId)) continue;
    out.set(row.promptLogId, toAnnotation(row));
  }

  return out;
}

export interface UpsertAnnotationInput {
  promptLogId: string;
  status: AnnotationStatus;
  note?: string | null;
  createdBy?: string;
}

/**
 * Insert or update the annotation for a single prompt. If an annotation
 * row already exists for the given promptLogId, it is updated in place
 * (so updatedAt advances). Otherwise a new row is created.
 *
 * We avoid prisma.upsert() here because PromptAnnotation has no unique
 * index on promptLogId (only a plain index — the schema allows history),
 * and we want "replace the latest" semantics rather than "create another
 * historical row". Done as findFirst + update/create in a transaction
 * so a concurrent writer can't slip in between.
 */
export async function upsertAnnotation(
  input: UpsertAnnotationInput,
): Promise<Annotation> {
  const promptLogId = input.promptLogId.trim();
  if (!promptLogId) {
    throw new Error('promptLogId is required');
  }
  if (!isAnnotationStatus(input.status)) {
    throw new Error(`invalid status: ${input.status}`);
  }

  // Normalize note: undefined and empty string both mean "no note". null
  // is the canonical empty value in the DB.
  const note =
    input.note === undefined || input.note === null || input.note === ''
      ? null
      : input.note;
  const createdBy = input.createdBy ?? null;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.promptAnnotation.findFirst({
      where: { promptLogId },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      // updatedAt is auto-managed by Prisma's @updatedAt.
      // Preserve the original createdBy if the caller didn't supply one —
      // we don't want to clobber attribution on a status edit.
      return tx.promptAnnotation.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          note,
          createdBy: createdBy ?? existing.createdBy,
        },
      });
    }

    return tx.promptAnnotation.create({
      data: {
        promptLogId,
        status: input.status,
        note,
        createdBy,
      },
    });
  });

  return toAnnotation(result);
}

/**
 * Remove the annotation for a given prompt. Deletes every PromptAnnotation
 * row referencing the prompt (there should only be one with our upsert
 * semantics, but a deleteMany handles legacy/history rows defensively).
 *
 * Idempotent: calling on a prompt with no annotation is a no-op.
 */
export async function deleteAnnotation(promptLogId: string): Promise<void> {
  const id = promptLogId.trim();
  if (!id) return;
  await prisma.promptAnnotation.deleteMany({
    where: { promptLogId: id },
  });
}
