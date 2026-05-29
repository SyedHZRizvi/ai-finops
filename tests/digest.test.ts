import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    promptLog: {
      findMany: vi.fn(),
    },
    anomalyEvent: {
      findMany: vi.fn(),
    },
    modelPricingConfig: {
      findMany: vi.fn(),
    },
  },
}));

import { buildDigest } from '@/lib/digest';
import { renderDigestHtml } from '@/lib/digestHtml';
import { prisma } from '@/lib/db';

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.promptLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.anomalyEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.modelPricingConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe('buildDigest() — empty data shape', () => {
  it('returns a well-formed DigestData for an empty period', async () => {
    const data = await buildDigest('weekly', new Date('2025-05-15T00:00:00Z'));
    expect(data.period).toBe('weekly');
    expect(data.totals.calls).toBe(0);
    expect(data.totals.cost).toBe(0);
    expect(data.totals.tokens).toBe(0);
    expect(data.totals.vsPrevPeriod).toBe(0);
    expect(data.totals.vsPrevPercent).toBe(0);
    expect(data.topApps).toEqual([]);
    expect(data.topModels).toEqual([]);
    expect(data.topRecommendations).toEqual([]);
  });
});

describe('buildDigest() — vs-previous-period calculation', () => {
  it('computes a positive delta correctly when current > prior', async () => {
    // buildDigest calls promptLog.findMany 4 times via separate code paths:
    //   1. aggregateRange — has timestamp.gte AND timestamp.lt; gte = weekAgo
    //   2. previousPeriodTotals — has gte AND lt; gte = 2-weeks-ago
    //   3. buildForecast — has only gte, no lt; gte = 30-days-ago
    //   4. computeInsights — has only gte, no lt; gte = 7-days-ago
    // Dispatch by presence of `lt` and the value of `gte`.
    const now = new Date('2025-05-15T00:00:00Z');
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    (prisma.promptLog.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      (args: any) => {
        const w = args?.where ?? {};
        const gte = w.timestamp?.gte instanceof Date ? w.timestamp.gte.getTime() : undefined;
        const lt = w.timestamp?.lt instanceof Date ? w.timestamp.lt.getTime() : undefined;
        // aggregateRange: has lt, gte=weekAgo
        if (lt !== undefined && gte !== undefined && Math.abs(gte - weekAgo.getTime()) < 1000) {
          return Promise.resolve([
            {
              id: 'cur-1',
              appName: 'app-a',
              model: 'gpt-4o',
              totalCost: 30,
              totalTokens: 1000,
              callCount: 5,
              promptText: 'current prompt',
              timestamp: now,
            },
          ]);
        }
        // previousPeriodTotals: has lt (lt=weekAgo, gte=2-weeks-ago)
        if (lt !== undefined && gte !== undefined && gte < weekAgo.getTime()) {
          return Promise.resolve([
            {
              id: 'prev-1',
              appName: 'app-a',
              model: 'gpt-4o',
              totalCost: 10,
              totalTokens: 500,
              callCount: 2,
              promptText: 'prev',
              timestamp: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
            },
          ]);
        }
        // buildForecast or computeInsights: no lt → return [] (irrelevant to this test).
        return Promise.resolve([]);
      },
    );
    const data = await buildDigest('weekly', now);
    expect(data.totals.cost).toBeCloseTo(30, 1);
    expect(data.totals.vsPrevPeriod).toBeCloseTo(20, 1); // 30 - 10
    expect(data.totals.vsPrevPercent).toBeCloseTo(200, 1); // (20/10) * 100
  });

  it('reports 0% vsPrev when there is no prior-period data', async () => {
    const now = new Date('2025-05-15T00:00:00Z');
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    (prisma.promptLog.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      (args: any) => {
        const w = args?.where ?? {};
        const gte = w.timestamp?.gte instanceof Date ? w.timestamp.gte.getTime() : undefined;
        const lt = w.timestamp?.lt instanceof Date ? w.timestamp.lt.getTime() : undefined;
        if (lt !== undefined && gte !== undefined && Math.abs(gte - weekAgo.getTime()) < 1000) {
          return Promise.resolve([
            {
              id: 'cur-1',
              appName: 'app-a',
              model: 'gpt-4o',
              totalCost: 5,
              totalTokens: 100,
              callCount: 1,
              promptText: 'p',
              timestamp: now,
            },
          ]);
        }
        // Prior period and others: empty.
        return Promise.resolve([]);
      },
    );
    const data = await buildDigest('weekly', now);
    expect(data.totals.vsPrevPeriod).toBe(0);
    expect(data.totals.vsPrevPercent).toBe(0);
  });
});

describe('renderDigestHtml() — self-contained HTML', () => {
  it('produces an HTML document with no external resource references', async () => {
    const data = await buildDigest('weekly', new Date('2025-05-15T00:00:00Z'));
    const html = renderDigestHtml(data);
    // Document shape.
    expect(html).toMatch(/<!DOCTYPE html>/i);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    // No external CSS/JS/image references — email clients block these.
    // We allow data: URIs but check that no http(s) src/href exists for assets.
    expect(html).not.toMatch(/<link[^>]+href="https?:\/\//i);
    expect(html).not.toMatch(/<script[^>]+src="https?:\/\//i);
    expect(html).not.toMatch(/<img[^>]+src="https?:\/\//i);
  });
});
