// GET /api/quality?period=24h|7d|30d|all
//
// Returns a QualityResponse — latency percentiles per model, output length
// distribution, and empty-response rates for the requested window. See
// `src/lib/qualityMetrics.ts` for the metric definitions.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { computeQuality, type QualityResponse } from '@/lib/qualityMetrics';

export const dynamic = 'force-dynamic';

const PeriodSchema = z.enum(['24h', '7d', '30d', 'all']);

export async function GET(req: NextRequest): Promise<NextResponse<QualityResponse | { error: string }>> {
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
    const quality = await computeQuality(parsed.data);
    return NextResponse.json(quality);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
