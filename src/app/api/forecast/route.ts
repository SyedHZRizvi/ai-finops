import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { forecastMonthEnd } from '@/lib/forecasting';

export const dynamic = 'force-dynamic';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const appNameRaw = url.searchParams.get('appName');
    const appName = appNameRaw && appNameRaw.length > 0 ? appNameRaw : null;

    // Pull last 30 days; the forecaster will filter to current-month points
    // itself, but we keep the wider window so EMA seeding stays warm even
    // when we run very early in a month.
    const since = new Date(Date.now() - 30 * MS_PER_DAY);
    const where: Prisma.PromptLogWhereInput = { timestamp: { gte: since } };
    if (appName) where.appName = appName;

    const rows = await prisma.promptLog.findMany({
      where,
      select: { timestamp: true, totalCost: true },
      orderBy: { timestamp: 'asc' },
    });

    const points = rows.map((r) => ({ ts: r.timestamp, cost: r.totalCost }));
    const forecast = forecastMonthEnd(points, new Date());

    return NextResponse.json({ ...forecast, scope: appName ?? 'global' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
