import { NextResponse } from 'next/server';
import { computeAppForecasts, type AppForecast } from '@/lib/perAppForecast';

export const dynamic = 'force-dynamic';

interface ForecastPerAppResponse {
  items: AppForecast[];
}

export async function GET(): Promise<NextResponse> {
  try {
    const items = await computeAppForecasts();
    const body: ForecastPerAppResponse = { items };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}
