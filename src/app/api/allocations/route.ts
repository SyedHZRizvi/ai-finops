// Cost-allocation rule CRUD.
//
// GET  /api/allocations              → list (all, active and inactive)
// POST /api/allocations              → create new
// PATCH /api/allocations?id=...      → update (full or partial)
// DELETE /api/allocations?id=...     → soft-delete (sets isActive=false)
//
// Rules are stored with their `sourceMatcher` and `targetSplit` JSON-stringified
// into String columns (see prisma/schema.prisma). All payloads on the wire
// use real JSON; we serialize at the boundary so the UI / engine never deal
// with strings.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { AllocationRuleData } from '@/lib/allocation';

export const dynamic = 'force-dynamic';

// Source matcher schema. Every field optional — empty matcher = match all.
// Strings or arrays of strings; an array with zero entries would be a footgun
// (matches nothing, surprising for the user) so disallow it.
const SourceMatcherSchema = z
  .object({
    appName: z.union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).min(1)]).optional(),
    model: z.union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).min(1)]).optional(),
    userId: z.union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).min(1)]).optional(),
  })
  .strict();

// Target split: { [appName]: percent }. Percents must sum to ~100% (5%
// tolerance for rounding) so totals don't silently grow or shrink. We
// validate sum here so the engine can stay simple — by the time a rule
// reaches `applyAllocation` we trust its split.
const TargetSplitSchema = z
  .record(z.string().min(1).max(200), z.number().min(0).max(100))
  .refine((m) => Object.keys(m).length >= 1, { message: 'targetSplit needs at least one recipient' })
  .refine(
    (m) => {
      const sum = Object.values(m).reduce((a, b) => a + b, 0);
      return sum >= 95 && sum <= 105;
    },
    { message: 'targetSplit percents must sum to 100% (95-105% accepted for rounding)' },
  );

const PostBodySchema = z.object({
  name: z.string().min(1).max(200),
  sourceMatcher: SourceMatcherSchema,
  targetSplit: TargetSplitSchema,
  priority: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});

// PATCH is partial — any subset of the create fields. We still require sum
// validation when the split is supplied.
const PatchBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    sourceMatcher: SourceMatcherSchema.optional(),
    targetSplit: TargetSplitSchema.optional(),
    priority: z.number().int().min(0).max(100000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'patch body must contain at least one field' });

const IdQuerySchema = z.object({ id: z.string().min(1).max(200) });

// Convert a DB row into the wire format the UI / engine consume.
function toData(row: {
  id: string;
  name: string;
  sourceMatcher: string;
  targetSplit: string;
  isActive: boolean;
  priority: number;
}): AllocationRuleData | null {
  try {
    const sourceMatcher = JSON.parse(row.sourceMatcher) as AllocationRuleData['sourceMatcher'];
    const targetSplit = JSON.parse(row.targetSplit) as AllocationRuleData['targetSplit'];
    return {
      id: row.id,
      name: row.name,
      sourceMatcher,
      targetSplit,
      isActive: row.isActive,
      priority: row.priority,
    };
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await prisma.allocationRule.findMany({
      orderBy: [{ isActive: 'desc' }, { priority: 'asc' }, { createdAt: 'asc' }],
    });
    const items = rows.map(toData).filter((x): x is AllocationRuleData => x !== null);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = PostBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await prisma.allocationRule.create({
      data: {
        name: parsed.data.name,
        sourceMatcher: JSON.stringify(parsed.data.sourceMatcher),
        targetSplit: JSON.stringify(parsed.data.targetSplit),
        priority: parsed.data.priority ?? 100,
        isActive: parsed.data.isActive ?? true,
      },
    });
    const data = toData(created);
    return NextResponse.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const idParsed = IdQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!idParsed.success) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
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
      { error: 'invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Build the partial update. Only include fields the caller actually
  // supplied — undefined would clobber existing values.
  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.sourceMatcher !== undefined) {
    data.sourceMatcher = JSON.stringify(parsed.data.sourceMatcher);
  }
  if (parsed.data.targetSplit !== undefined) {
    data.targetSplit = JSON.stringify(parsed.data.targetSplit);
  }
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

  try {
    const updated = await prisma.allocationRule.update({
      where: { id: idParsed.data.id },
      data,
    });
    return NextResponse.json({ item: toData(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    const isMissing =
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: unknown }).code === 'P2025';
    return NextResponse.json({ error: message }, { status: isMissing ? 404 : 500 });
  }
}

// Soft-delete: set isActive=false rather than dropping the row. Keeps the
// rule visible in history so operators can re-enable it without losing the
// split they configured.
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = IdQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  try {
    const updated = await prisma.allocationRule.update({
      where: { id: parsed.data.id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true, item: toData(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    const isMissing =
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: unknown }).code === 'P2025';
    return NextResponse.json({ error: message }, { status: isMissing ? 404 : 500 });
  }
}
