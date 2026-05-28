import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { StatsResponse, Category, Complexity } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PeriodSchema = z.enum(['24h', '7d', '30d', 'all']);
type Period = z.infer<typeof PeriodSchema>;
type Bucket = 'hour' | 'day' | 'week';

function periodToSince(period: Period): Date | null {
  const now = Date.now();
  switch (period) {
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case 'all':
      return null;
  }
}

function bucketFor(period: Period): Bucket {
  if (period === '24h') return 'hour';
  if (period === 'all') return 'week';
  return 'day';
}

function bucketStart(ts: Date, bucket: Bucket): Date {
  const d = new Date(ts);
  if (bucket === 'hour') {
    d.setUTCMinutes(0, 0, 0);
    return d;
  }
  if (bucket === 'day') {
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  // week: round down to Monday 00:00 UTC.
  d.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = d.getUTCDay();
  const offsetToMonday = (dayOfWeek + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  return d;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const periodParam = url.searchParams.get('period') ?? '7d';
    const parsed = PeriodSchema.safeParse(periodParam);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid period; must be 24h | 7d | 30d | all' },
        { status: 400 },
      );
    }
    const period = parsed.data;
    const since = periodToSince(period);

    const where = since ? { timestamp: { gte: since } } : {};

    const logs = await prisma.promptLog.findMany({
      where,
      select: {
        timestamp: true,
        model: true,
        category: true,
        complexity: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        totalCost: true,
        latencyMs: true,
        potentialSavedTokens: true,
        potentialSavedCost: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    let calls = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let cost = 0;
    let latencySum = 0;
    let latencyCount = 0;
    let savedTokens = 0;
    let savedCost = 0;

    const byCategoryMap = new Map<string, { calls: number; tokens: number; cost: number }>();
    const byComplexityMap = new Map<string, { calls: number; tokens: number; cost: number }>();
    const byModelMap = new Map<string, { calls: number; tokens: number; cost: number }>();
    const bucket = bucketFor(period);
    const tsMap = new Map<string, { calls: number; tokens: number; cost: number }>();

    for (const log of logs) {
      calls++;
      inputTokens += log.inputTokens;
      outputTokens += log.outputTokens;
      totalTokens += log.totalTokens;
      cost += log.totalCost;
      if (log.latencyMs !== null && log.latencyMs !== undefined) {
        latencySum += log.latencyMs;
        latencyCount++;
      }
      savedTokens += log.potentialSavedTokens;
      savedCost += log.potentialSavedCost;

      const cat = byCategoryMap.get(log.category) ?? { calls: 0, tokens: 0, cost: 0 };
      cat.calls++;
      cat.tokens += log.totalTokens;
      cat.cost += log.totalCost;
      byCategoryMap.set(log.category, cat);

      const cx = byComplexityMap.get(log.complexity) ?? { calls: 0, tokens: 0, cost: 0 };
      cx.calls++;
      cx.tokens += log.totalTokens;
      cx.cost += log.totalCost;
      byComplexityMap.set(log.complexity, cx);

      const m = byModelMap.get(log.model) ?? { calls: 0, tokens: 0, cost: 0 };
      m.calls++;
      m.tokens += log.totalTokens;
      m.cost += log.totalCost;
      byModelMap.set(log.model, m);

      const key = bucketStart(log.timestamp, bucket).toISOString();
      const slot = tsMap.get(key) ?? { calls: 0, tokens: 0, cost: 0 };
      slot.calls++;
      slot.tokens += log.totalTokens;
      slot.cost += log.totalCost;
      tsMap.set(key, slot);
    }

    const percent = cost > 0 ? (savedCost / cost) * 100 : 0;

    const response: StatsResponse = {
      totals: {
        calls,
        inputTokens,
        outputTokens,
        totalTokens,
        cost,
        avgLatencyMs: latencyCount > 0 ? latencySum / latencyCount : 0,
      },
      potentialSavings: {
        tokens: savedTokens,
        cost: savedCost,
        percent,
      },
      byCategory: Array.from(byCategoryMap.entries()).map(([category, v]) => ({
        category: category as Category,
        calls: v.calls,
        tokens: v.tokens,
        cost: v.cost,
      })),
      byComplexity: Array.from(byComplexityMap.entries()).map(([complexity, v]) => ({
        complexity: complexity as Complexity,
        calls: v.calls,
        tokens: v.tokens,
        cost: v.cost,
      })),
      byModel: Array.from(byModelMap.entries()).map(([model, v]) => ({
        model,
        calls: v.calls,
        tokens: v.tokens,
        cost: v.cost,
      })),
      timeseries: Array.from(tsMap.entries())
        .map(([ts, v]) => ({ ts, calls: v.calls, tokens: v.tokens, cost: v.cost }))
        .sort((a, b) => a.ts.localeCompare(b.ts)),
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
