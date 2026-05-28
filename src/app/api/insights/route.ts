import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { computeInsights } from '@/lib/insights';

export const dynamic = 'force-dynamic';

const PeriodSchema = z.enum(['24h', '7d', '30d', 'all']);

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const periodParam = url.searchParams.get('period') ?? '30d';
    const parsed = PeriodSchema.safeParse(periodParam);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid period; must be 24h | 7d | 30d | all' },
        { status: 400 },
      );
    }
    const insights = await computeInsights(parsed.data);
    return NextResponse.json(insights);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
