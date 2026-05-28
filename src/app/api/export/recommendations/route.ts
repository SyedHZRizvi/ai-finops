import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { computeInsights } from '@/lib/insights';
import { ensurePricingLoaded } from '@/lib/pricing';
import { toCsv, type CsvColumn } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d', 'all']).default('30d'),
  format: z.enum(['csv', 'json']).default('csv'),
});

function todayStamp(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const COLUMNS: CsvColumn[] = [
  { key: 'id', label: 'id' },
  { key: 'title', label: 'title' },
  { key: 'rationale', label: 'rationale' },
  { key: 'action', label: 'action' },
  { key: 'estimatedMonthlySavings', label: 'estimatedMonthlySavings' },
  { key: 'estimatedAnnualSavings', label: 'estimatedAnnualSavings' },
  { key: 'affectedCalls', label: 'affectedCalls' },
  { key: 'confidence', label: 'confidence' },
  { key: 'category', label: 'category' },
];

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid query', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { period, format } = parsed.data;

    await ensurePricingLoaded();
    const insights = await computeInsights(period);
    const recs = insights.recommendations;
    const filename = `recommendations-${period}-${todayStamp()}.${format}`;

    if (format === 'json') {
      return new NextResponse(JSON.stringify(recs, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const rows = recs.map((r) => ({
      id: r.id,
      title: r.title,
      rationale: r.rationale,
      action: r.action,
      estimatedMonthlySavings: r.estimatedMonthlySavings,
      estimatedAnnualSavings: r.estimatedAnnualSavings,
      affectedCalls: r.affectedCalls,
      confidence: r.confidence,
      category: r.category,
    }));
    const csv = toCsv(rows, COLUMNS);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
