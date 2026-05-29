// Dry-run allocation preview.
//
// POST /api/allocations/preview
//   body: { rules: AllocationRuleData[]; period: '7d' | '30d' }
//
// Pulls real PromptLog rows in the requested window, applies the supplied
// rules (NOT the saved ones — this is a preview), and returns per-app
// rollups before and after. The UI uses this to show what saving the rules
// would actually do, without committing the change.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { applyAllocation, type AllocationRuleData } from '@/lib/allocation';

export const dynamic = 'force-dynamic';

const SourceMatcherSchema = z
  .object({
    appName: z.union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).min(1)]).optional(),
    model: z.union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).min(1)]).optional(),
    userId: z.union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).min(1)]).optional(),
  })
  .strict();

const TargetSplitSchema = z
  .record(z.string().min(1).max(200), z.number().min(0).max(100))
  .refine((m) => Object.keys(m).length >= 1, {
    message: 'targetSplit needs at least one recipient',
  })
  .refine(
    (m) => {
      const sum = Object.values(m).reduce((a, b) => a + b, 0);
      return sum >= 95 && sum <= 105;
    },
    { message: 'targetSplit percents must sum to 100% (95-105% accepted for rounding)' },
  );

const RuleSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  sourceMatcher: SourceMatcherSchema,
  targetSplit: TargetSplitSchema,
  isActive: z.boolean(),
  priority: z.number().int().min(0).max(100000),
});

const BodySchema = z.object({
  rules: z.array(RuleSchema).max(200),
  period: z.enum(['7d', '30d']),
});

function periodToSince(period: '7d' | '30d'): Date {
  const now = Date.now();
  const days = period === '7d' ? 7 : 30;
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

export interface AllocationPreviewItem {
  appName: string;
  before: number;
  after: number;
  delta: number;
}

export interface AllocationPreviewResponse {
  period: '7d' | '30d';
  totalCost: number;
  items: AllocationPreviewItem[];
  // How many rows in the window had at least one rule applied. Useful as
  // a sanity check — if the user expects their rule to fire but this is 0,
  // their matcher is too narrow.
  rowsMatched: number;
  rowsTotal: number;
}

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
      { error: 'invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const since = periodToSince(parsed.data.period);

  try {
    // We only need the four columns the engine consumes — keep the
    // payload off the wire small and let Postgres skip the prompt text.
    const rows = await prisma.promptLog.findMany({
      where: { timestamp: { gte: since } },
      select: { appName: true, model: true, userId: true, totalCost: true },
    });

    // Caller-supplied rules. Sort by priority asc so the engine picks the
    // first match — same evaluation order as listActiveRules.
    const rules: AllocationRuleData[] = [...parsed.data.rules]
      .filter((r) => r.isActive)
      .sort((a, b) => a.priority - b.priority);

    const beforeMap = new Map<string, number>();
    const afterMap = new Map<string, number>();
    let rowsMatched = 0;
    let totalCost = 0;

    for (const row of rows) {
      totalCost += row.totalCost;
      const beforeKey = row.appName ?? 'unknown';
      beforeMap.set(beforeKey, (beforeMap.get(beforeKey) ?? 0) + row.totalCost);

      const allocated = applyAllocation(row, rules);
      let touched = false;
      for (const a of allocated) {
        afterMap.set(a.allocatedAppName, (afterMap.get(a.allocatedAppName) ?? 0) + a.allocatedCost);
        if (a.ruleId !== null) touched = true;
      }
      if (touched) rowsMatched++;
    }

    // Union of all app names appearing on either side so the chart shows
    // rows that vanish (allocated away to zero) and rows that appear new
    // (a target with no prior direct spend).
    const allNames = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);
    const items: AllocationPreviewItem[] = Array.from(allNames).map((appName) => {
      const before = round2(beforeMap.get(appName) ?? 0);
      const after = round2(afterMap.get(appName) ?? 0);
      return { appName, before, after, delta: round2(after - before) };
    });
    // Sort by absolute delta desc so the biggest shifts surface first;
    // ties fall back to current after-spend.
    items.sort((a, b) => {
      const adiff = Math.abs(b.delta) - Math.abs(a.delta);
      if (adiff !== 0) return adiff;
      return b.after - a.after;
    });

    const response: AllocationPreviewResponse = {
      period: parsed.data.period,
      totalCost: round2(totalCost),
      items,
      rowsMatched,
      rowsTotal: rows.length,
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
