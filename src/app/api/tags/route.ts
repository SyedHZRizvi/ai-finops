// Tags API.
//
//   GET /api/tags
//     Returns { items: { tag, count, totalCost }[] } — distinct tags
//     observed across PromptLog rows, with a row-count and aggregate cost
//     for each. Sorted by totalCost desc. Used by TagInput's autocomplete
//     and (eventually) by report-grouping UIs.
//
// Tags are stored as a comma-separated free-form string on each PromptLog
// row. They are NOT a separate table — the value of this endpoint is to
// give the UI a denormalized aggregate without forcing every consumer to
// re-aggregate the column themselves.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface TagAgg {
  tag: string;
  count: number;
  totalCost: number;
}

export async function GET() {
  try {
    // Pull only what we need. `tags` is the comma-separated string; we sum
    // cost per distinct tag in app-code because Postgres can't SUM across
    // an unnest of a single TEXT column without raw SQL — and the row
    // counts here are bounded (UI uses this for autocomplete).
    const rows = await prisma.promptLog.findMany({
      where: { tags: { not: null } },
      select: { tags: true, totalCost: true },
    });

    if (rows.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const agg = new Map<string, TagAgg>();
    for (const row of rows) {
      const raw = row.tags ?? '';
      if (!raw.trim()) continue;
      // Split on comma, trim, dedup within the row so a malformed
      // "prod, prod" doesn't double-count.
      const tags = Array.from(
        new Set(
          raw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      );
      for (const tag of tags) {
        const cur = agg.get(tag);
        if (cur) {
          cur.count += 1;
          cur.totalCost += row.totalCost ?? 0;
        } else {
          agg.set(tag, { tag, count: 1, totalCost: row.totalCost ?? 0 });
        }
      }
    }

    const items = Array.from(agg.values()).sort((a, b) => b.totalCost - a.totalCost);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
