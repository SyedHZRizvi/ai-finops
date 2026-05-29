import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    promptLog: {
      findMany: vi.fn(),
    },
  },
}));

import { computeAppTrends } from '@/lib/trends';
import { prisma } from '@/lib/db';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface Row {
  appName: string | null;
  timestamp: Date;
  totalCost: number;
}

function mockRows(rows: Row[]): void {
  (prisma.promptLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
});

const NOW = new Date('2025-05-20T12:00:00Z');

describe('computeAppTrends() — direction classification', () => {
  it('classifies > +50% as up-fast', async () => {
    mockRows([
      // last 7d: $10
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 1 * MS_PER_DAY), totalCost: 10 },
      // prior 7d: $1 → +900%
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 10 * MS_PER_DAY), totalCost: 1 },
    ]);
    const trends = await computeAppTrends(NOW);
    expect(trends[0]!.direction).toBe('up-fast');
  });

  it('classifies +10% to +50% as up', async () => {
    mockRows([
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 1 * MS_PER_DAY), totalCost: 1.2 },
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 10 * MS_PER_DAY), totalCost: 1.0 },
    ]);
    const trends = await computeAppTrends(NOW);
    expect(trends[0]!.direction).toBe('up');
  });

  it('classifies -10% to +10% as flat', async () => {
    mockRows([
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 1 * MS_PER_DAY), totalCost: 1.0 },
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 10 * MS_PER_DAY), totalCost: 1.0 },
    ]);
    const trends = await computeAppTrends(NOW);
    expect(trends[0]!.direction).toBe('flat');
  });

  it('classifies -10% to -50% as down', async () => {
    mockRows([
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 1 * MS_PER_DAY), totalCost: 0.7 },
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 10 * MS_PER_DAY), totalCost: 1.0 },
    ]);
    const trends = await computeAppTrends(NOW);
    expect(trends[0]!.direction).toBe('down');
  });

  it('classifies < -50% as down-fast', async () => {
    mockRows([
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 1 * MS_PER_DAY), totalCost: 0.2 },
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 10 * MS_PER_DAY), totalCost: 1.0 },
    ]);
    const trends = await computeAppTrends(NOW);
    expect(trends[0]!.direction).toBe('down-fast');
  });
});

describe('computeAppTrends() — divide-by-zero handling', () => {
  it('returns 9999 sentinel when prior=0 and last>0', async () => {
    mockRows([
      // Only last 7d has spend; prior 7d is zero.
      { appName: 'app-new', timestamp: new Date(NOW.getTime() - 1 * MS_PER_DAY), totalCost: 5 },
    ]);
    const trends = await computeAppTrends(NOW);
    expect(trends[0]!.changePercent).toBe(9999);
    // classifyDirection treats Infinity as 'flat' (see source: !isFinite → 'flat').
    // The 9999 sentinel surfaces in the row payload so the UI can render
    // "+∞%" while the direction chip still reads neutral.
    expect(trends[0]!.direction).toBe('flat');
  });
});

describe('computeAppTrends() — filtering', () => {
  it('skips apps with < $0.01 in BOTH windows', async () => {
    mockRows([
      { appName: 'stale', timestamp: new Date(NOW.getTime() - 1 * MS_PER_DAY), totalCost: 0.001 },
      { appName: 'stale', timestamp: new Date(NOW.getTime() - 10 * MS_PER_DAY), totalCost: 0.002 },
      // Real app, kept.
      { appName: 'real', timestamp: new Date(NOW.getTime() - 1 * MS_PER_DAY), totalCost: 5 },
      { appName: 'real', timestamp: new Date(NOW.getTime() - 10 * MS_PER_DAY), totalCost: 4 },
    ]);
    const trends = await computeAppTrends(NOW);
    expect(trends.map((t) => t.appName)).toEqual(['real']);
  });
});

describe('computeAppTrends() — window split', () => {
  it('places a row exactly 7 days ago in the prior window (>=, not in last 7d)', async () => {
    // Row exactly at sevenDaysAgo boundary: timestamp >= sevenDaysAgo → "last".
    // Slightly older: "prior".
    mockRows([
      // 8 days ago → prior
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 8 * MS_PER_DAY), totalCost: 5 },
      // 6 days ago → last
      { appName: 'app-a', timestamp: new Date(NOW.getTime() - 6 * MS_PER_DAY), totalCost: 5 },
    ]);
    const trends = await computeAppTrends(NOW);
    expect(trends[0]!.last7DaysCost).toBeCloseTo(5, 4);
    expect(trends[0]!.prior7DaysCost).toBeCloseTo(5, 4);
  });
});

describe('computeAppTrends() — sorting', () => {
  it('returns apps sorted by dailyAvgCost descending', async () => {
    mockRows([
      { appName: 'small', timestamp: new Date(NOW.getTime() - 1 * MS_PER_DAY), totalCost: 1 },
      { appName: 'small', timestamp: new Date(NOW.getTime() - 10 * MS_PER_DAY), totalCost: 1 },
      { appName: 'big', timestamp: new Date(NOW.getTime() - 1 * MS_PER_DAY), totalCost: 100 },
      { appName: 'big', timestamp: new Date(NOW.getTime() - 10 * MS_PER_DAY), totalCost: 100 },
      { appName: 'medium', timestamp: new Date(NOW.getTime() - 1 * MS_PER_DAY), totalCost: 10 },
      { appName: 'medium', timestamp: new Date(NOW.getTime() - 10 * MS_PER_DAY), totalCost: 10 },
    ]);
    const trends = await computeAppTrends(NOW);
    expect(trends.map((t) => t.appName)).toEqual(['big', 'medium', 'small']);
  });
});
