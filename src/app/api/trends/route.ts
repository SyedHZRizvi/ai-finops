import { NextResponse } from 'next/server';
import { computeAppTrends, type AppTrend } from '@/lib/trends';

export const dynamic = 'force-dynamic';

interface TrendsResponse {
  items: AppTrend[];
}

export async function GET(): Promise<NextResponse> {
  try {
    const items = await computeAppTrends();
    const body: TrendsResponse = { items };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}
