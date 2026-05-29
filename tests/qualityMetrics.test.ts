import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    promptLog: {
      findMany: vi.fn(),
    },
  },
}));

import { computeQuality } from '@/lib/qualityMetrics';
import { prisma } from '@/lib/db';

interface Row {
  model: string;
  latencyMs: number | null;
  outputTokens: number;
  callCount: number;
}

function mockRows(rows: Row[]): void {
  (prisma.promptLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeQuality() — empty period', () => {
  it('returns a well-formed response with zeros when no rows exist', async () => {
    mockRows([]);
    const q = await computeQuality('30d');
    expect(q.latencyByModel).toEqual([]);
    expect(q.outputDistribution).toEqual([]);
    expect(q.errorRates).toEqual([]);
    expect(q.overallStats.totalCalls).toBe(0);
    expect(q.overallStats.avgLatencyMs).toBe(0);
    expect(q.overallStats.emptyRatePercent).toBe(0);
  });
});

describe('computeQuality() — latency math', () => {
  it('computes p50/p95/p99 with nearest-rank percentile', async () => {
    // Build 100 samples: 1..100 ms. p50 = ms at floor(100*0.5) = 50 → value 51.
    // p95 = floor(100*0.95) = 95 → value 96. p99 = floor(100*0.99) = 99 → value 100.
    const rows: Row[] = [];
    for (let i = 1; i <= 100; i++) {
      rows.push({ model: 'gpt-4o', latencyMs: i, outputTokens: 100, callCount: 1 });
    }
    mockRows(rows);
    const q = await computeQuality('30d');
    const m = q.latencyByModel.find((x) => x.model === 'gpt-4o');
    expect(m).toBeDefined();
    expect(m!.p50).toBe(51);
    expect(m!.p95).toBe(96);
    expect(m!.p99).toBe(100);
  });
});

describe('computeQuality() — output distribution', () => {
  it('bucket percentages sum to 100% per model (within rounding tolerance)', async () => {
    const rows: Row[] = [];
    // Spread tokens across all 5 buckets, 10 samples each.
    const outputs = [50, 200, 700, 1500, 3000];
    for (const out of outputs) {
      for (let i = 0; i < 10; i++) {
        rows.push({ model: 'gpt-4o', latencyMs: 100, outputTokens: out, callCount: 1 });
      }
    }
    mockRows(rows);
    const q = await computeQuality('30d');
    const total = q.outputDistribution
      .filter((d) => d.model === 'gpt-4o')
      .reduce((s, d) => s + d.pctOfModel, 0);
    expect(total).toBeCloseTo(100, 1);
  });
});

describe('computeQuality() — empty rate clamp', () => {
  it('empty rate is clamped to the [0, 100] range', async () => {
    // 5 calls, all empty.
    const rows: Row[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push({ model: 'gpt-4o', latencyMs: 100, outputTokens: 0, callCount: 1 });
    }
    mockRows(rows);
    const q = await computeQuality('30d');
    const er = q.errorRates.find((x) => x.model === 'gpt-4o');
    expect(er).toBeDefined();
    expect(er!.emptyRate).toBe(100);
    expect(er!.emptyRate).toBeLessThanOrEqual(100);
    expect(er!.emptyRate).toBeGreaterThanOrEqual(0);
  });
});

describe('computeQuality() — minimum sample threshold', () => {
  it('filters out models with < 5 calls', async () => {
    const rows: Row[] = [];
    // 2 samples for "rare-model" — below threshold.
    rows.push({ model: 'rare-model', latencyMs: 100, outputTokens: 100, callCount: 1 });
    rows.push({ model: 'rare-model', latencyMs: 200, outputTokens: 200, callCount: 1 });
    // 6 samples for "common-model" — above threshold.
    for (let i = 0; i < 6; i++) {
      rows.push({ model: 'common-model', latencyMs: 100 + i, outputTokens: 100, callCount: 1 });
    }
    mockRows(rows);
    const q = await computeQuality('30d');
    expect(q.latencyByModel.some((m) => m.model === 'rare-model')).toBe(false);
    expect(q.latencyByModel.some((m) => m.model === 'common-model')).toBe(true);
    expect(q.errorRates.some((m) => m.model === 'rare-model')).toBe(false);
    expect(q.outputDistribution.some((d) => d.model === 'rare-model')).toBe(false);
  });
});

describe('computeQuality() — callCount weighting', () => {
  it('weights totals by callCount (import-aggregate rows count once per real call)', async () => {
    mockRows([
      // 1 DB row representing 1000 real calls (e.g. an import-aggregate row).
      { model: 'claude-opus-4', latencyMs: null, outputTokens: 100, callCount: 1000 },
      // Top up to clear the 5-sample threshold.
      ...Array.from({ length: 5 }, () => ({
        model: 'claude-opus-4',
        latencyMs: null,
        outputTokens: 100,
        callCount: 1,
      })),
    ]);
    const q = await computeQuality('30d');
    // 1000 + 5 = 1005 real calls.
    expect(q.overallStats.totalCalls).toBe(1005);
  });
});
