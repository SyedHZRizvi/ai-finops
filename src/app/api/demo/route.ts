// Demo data API.
//
//   POST /api/demo  { action: 'seed', count?: number }
//     Inserts synthetic PromptLog rows. Idempotent: if demo rows already
//     exist, the route inserts only the delta needed to reach `count`. If
//     enough rows already exist, it is a no-op. We never delete real data
//     in this path.
//
//   POST /api/demo  { action: 'clear' }
//     Deletes only rows whose metadata JSON contains "source":"demo". Real
//     data (no metadata, or metadata with a different source) is untouched.
//
//   GET /api/demo
//     Returns { active, demoRowCount, realRowCount } where `active` means at
//     least one demo row exists. UI uses this to render banners + status.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ensurePricingLoaded } from '@/lib/pricing';
import { generateDemoPrompts, type DemoPromptRow } from '@/lib/demoData';

export const dynamic = 'force-dynamic';

const SeedSchema = z.object({
  action: z.literal('seed'),
  count: z.number().int().positive().max(2000).optional(),
});

const ClearSchema = z.object({
  action: z.literal('clear'),
});

const BodySchema = z.union([SeedSchema, ClearSchema]);

// Substring used to identify demo rows in the metadata JSON column. Stored as
// a single canonical key/value so we can detect demo rows with a SQL
// `contains` filter without parsing JSON in the DB.
const DEMO_MARKER = '"source":"demo"';

async function countDemoRows(): Promise<number> {
  return prisma.promptLog.count({
    where: { metadata: { contains: DEMO_MARKER } },
  });
}

async function countRealRows(): Promise<number> {
  const total = await prisma.promptLog.count();
  const demo = await countDemoRows();
  return Math.max(0, total - demo);
}

export async function GET() {
  try {
    const [demoRowCount, realRowCount] = await Promise.all([
      countDemoRows(),
      countRealRows(),
    ]);
    return NextResponse.json({
      active: demoRowCount > 0,
      demoRowCount,
      realRowCount,
    });
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
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.action === 'clear') {
      const result = await prisma.promptLog.deleteMany({
        where: { metadata: { contains: DEMO_MARKER } },
      });
      return NextResponse.json({ deleted: result.count });
    }

    // action === 'seed'
    const target = parsed.data.count ?? 300;

    // Refresh pricing so cost columns line up with whatever the user edited.
    await ensurePricingLoaded();

    // Idempotency: count existing demo rows and add only the delta. If we
    // already meet the target, no-op (returns inserted=0). This matches the
    // "second call detects existing demo rows and adds delta" behavior
    // documented to the caller.
    const existing = await countDemoRows();
    const toGenerate = Math.max(0, target - existing);
    if (toGenerate === 0) {
      return NextResponse.json({
        inserted: 0,
        skipped: existing,
        total: existing,
        note: `${existing} demo rows already present (target ${target})`,
      });
    }

    const rows: DemoPromptRow[] = generateDemoPrompts({ count: toGenerate });

    // Use createMany for speed — falls back to per-row if the provider rejects
    // it. createMany on Postgres is significantly faster for hundreds of rows.
    try {
      await prisma.promptLog.createMany({ data: rows });
    } catch {
      // Fallback path: rare, but guards against driver edge-cases.
      for (const row of rows) {
        await prisma.promptLog.create({ data: row });
      }
    }

    return NextResponse.json({
      inserted: rows.length,
      skipped: existing,
      total: existing + rows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
