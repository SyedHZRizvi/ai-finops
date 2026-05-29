// Snapshots API — list + capture.
//
//   GET /api/snapshots
//     Returns { items: SnapshotMeta[] } — most recent first. Lightweight;
//     does NOT include the full payload (use GET /api/snapshots/:id for that).
//
//   POST /api/snapshots
//     Body: { label, note?, period, capturedBy? }
//     Computes insights for the given period right now and persists the
//     full response as JSON. Returns { item: SnapshotDetail } including
//     the parsed payload so the caller can immediately render it.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { captureSnapshot, listSnapshots } from '@/lib/snapshots';
import { ensurePricingLoaded } from '@/lib/pricing';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const MAX_LABEL_CHARS = 120;
const MAX_NOTE_CHARS = 4000;
const MAX_CAPTURED_BY_CHARS = 200;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

const PeriodSchema = z.enum(['24h', '7d', '30d', 'all']);

const PostBodySchema = z.object({
  label: z.string().min(1, 'label is required').max(MAX_LABEL_CHARS),
  note: z.string().max(MAX_NOTE_CHARS).optional(),
  period: PeriodSchema,
  capturedBy: z.string().max(MAX_CAPTURED_BY_CHARS).optional(),
});

const GetQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'limit must be a positive integer')
    .optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const parsed = GetQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid query', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const limit = parsed.data.limit
      ? Math.min(MAX_LIST_LIMIT, Math.max(1, parseInt(parsed.data.limit, 10)))
      : DEFAULT_LIST_LIMIT;

    const items = await listSnapshots(limit);
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
      { error: 'validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  try {
    // Pricing must be loaded before computeInsights so model→cost lookups
    // resolve. Matches the /api/insights pattern.
    await ensurePricingLoaded();
    const item = await captureSnapshot({
      label: body.label,
      note: body.note,
      period: body.period,
      capturedBy: body.capturedBy,
    });
    await recordAudit({
      req,
      action: 'snapshot.capture',
      targetKind: 'snapshot',
      targetId: item.id,
      payload: { label: item.label, period: item.period },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
