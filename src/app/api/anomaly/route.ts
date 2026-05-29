// Anomaly list + resolve endpoint.
//
// GET /api/anomaly?severity=&kind=&since=&limit=&unresolved=
//   Returns the most recent AnomalyEvent rows matching the filters.
// POST /api/anomaly
//   body: { id, action: 'resolve' } → sets resolvedAt = now() on that row.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const SeveritySchema = z.enum(['info', 'warn', 'critical']);
const KindSchema = z.enum([
  'cost-spike',
  'new-model',
  'expensive-prompt',
  'budget-breach',
  'latency-spike',
]);

const QuerySchema = z.object({
  severity: SeveritySchema.optional(),
  kind: KindSchema.optional(),
  // Accept ISO timestamps (preferred) or anything Date.parse() understands.
  since: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'invalid date' })
    .optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
  // Accept truthy strings: "1", "true", "yes". Anything else → false.
  unresolved: z
    .union([z.literal('1'), z.literal('true'), z.literal('yes'), z.literal('0'), z.literal('false')])
    .optional(),
});

const PostBodySchema = z.object({
  id: z.string().min(1).max(200),
  action: z.literal('resolve'),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid query', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { severity, kind, since, limit, unresolved } = parsed.data;

    const where: Prisma.AnomalyEventWhereInput = {};
    if (severity) where.severity = severity;
    if (kind) where.kind = kind;
    if (since) {
      const ts = new Date(since);
      if (!Number.isNaN(ts.getTime())) where.detectedAt = { gte: ts };
    }
    if (unresolved === '1' || unresolved === 'true' || unresolved === 'yes') {
      where.resolvedAt = null;
    }

    const items = await prisma.anomalyEvent.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      take: limit,
    });

    // Decode metadata so consumers (UI, webhook caller) don't all reparse.
    // Keep the original `metadata` string out — the parsed view is friendlier.
    const decoded = items.map((it) => ({
      ...it,
      metadata: safeParse(it.metadata),
    }));

    return NextResponse.json({ items: decoded, total: decoded.length });
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
    const updated = await prisma.anomalyEvent.update({
      where: { id: parsed.data.id },
      data: { resolvedAt: new Date() },
    });
    await recordAudit({
      req,
      action: 'anomaly.resolve',
      targetKind: 'anomaly',
      targetId: updated.id,
      payload: { kind: updated.kind, severity: updated.severity },
    });
    return NextResponse.json({
      item: { ...updated, metadata: safeParse(updated.metadata) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    // Prisma throws "record not found" as P2025 — surface as 404 so the
    // client knows the id is stale rather than the server being broken.
    const isMissing =
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: unknown }).code === 'P2025';
    return NextResponse.json({ error: message }, { status: isMissing ? 404 : 500 });
  }
}

function safeParse(value: string | null): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
