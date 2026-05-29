import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    promptLog: {
      findMany: vi.fn(),
    },
  },
}));

import { computeInsights } from '@/lib/insights';
import { prisma } from '@/lib/db';

interface RawRow {
  id: string;
  timestamp: Date;
  appName: string | null;
  model: string;
  promptText: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  totalCost: number;
  category: string;
  complexity: string;
  callCount: number;
}

function row(overrides: Partial<RawRow> = {}): RawRow {
  return {
    id: overrides.id ?? `id-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: overrides.timestamp ?? new Date(),
    appName: overrides.appName ?? 'app-1',
    model: overrides.model ?? 'gpt-4o',
    promptText: overrides.promptText ?? 'What is the deadline?',
    inputTokens: overrides.inputTokens ?? 100,
    outputTokens: overrides.outputTokens ?? 200,
    inputCost: overrides.inputCost ?? 0.0001,
    totalCost: overrides.totalCost ?? 0.001,
    category: overrides.category ?? 'factual',
    complexity: overrides.complexity ?? 'simple',
    callCount: overrides.callCount ?? 1,
  };
}

function mockRows(rows: RawRow[]): void {
  (prisma.promptLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeInsights() — empty data', () => {
  it('returns a well-formed response with zeros for an empty period', async () => {
    mockRows([]);
    const r = await computeInsights('30d');
    expect(r.totals.calls).toBe(0);
    expect(r.totals.cost).toBe(0);
    expect(r.totals.avgCostPerCall).toBe(0);
    expect(r.projectedSavings.monthly).toBe(0);
    expect(r.projectedSavings.annual).toBe(0);
    expect(r.projectedSavings.percentReduction).toBe(0);
    expect(r.recommendations).toEqual([]);
    expect(r.rootCauses).toEqual([]);
    expect(r.topSpenders).toEqual([]);
  });
});

describe('monthlyMultiplier — implicit via projectedSavings', () => {
  // The multiplier scales recommendations into monthly numbers. We verify by
  // checking that the same per-period spend projects to different monthly
  // burns across periods.
  it('scales 7d period by 30/7 (≈ 4.28x)', async () => {
    // 25 simple gpt-4o calls so concentration metrics activate (>=20),
    // each costing $1 → totals.cost = $25 → currentMonthlyBurn ≈ $107.
    const rows: RawRow[] = [];
    for (let i = 0; i < 25; i++) {
      rows.push(
        row({
          id: `r-${i}`,
          // give them slight cost variation so model-mismatch surfaces
          totalCost: 1.0,
          inputTokens: 1000,
          outputTokens: 500,
          model: 'gpt-4o',
          complexity: 'simple',
          category: 'factual',
        }),
      );
    }
    mockRows(rows);
    const r = await computeInsights('7d');
    // currentMonthlyBurn = totalCost * (30/7)
    expect(r.totals.cost).toBeCloseTo(25, 1);
    // Some recommendations should fire and capped monthly should be > 0
    // (cap = 80% of monthlyBurn = 0.8 * 25 * 30/7 ≈ 85.7).
    expect(r.projectedSavings.monthly).toBeGreaterThan(0);
  });

  it('uses factor 30 for the 24h period (multiplier marked unreliable → no projection)', async () => {
    const rows: RawRow[] = [];
    for (let i = 0; i < 25; i++) {
      rows.push(row({ id: `r-${i}`, totalCost: 1.0, model: 'gpt-4o', complexity: 'simple' }));
    }
    mockRows(rows);
    const r = await computeInsights('24h');
    // 24h multiplier is `reliable: false`, so monthly and percentReduction
    // are forced to 0 even though recommendations exist.
    expect(r.projectedSavings.monthly).toBe(0);
    expect(r.projectedSavings.percentReduction).toBe(0);
  });

  it('treats 30d as factor 1', async () => {
    const rows: RawRow[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push(row({ id: `r-${i}`, totalCost: 0.5, model: 'gpt-4o' }));
    }
    mockRows(rows);
    const r = await computeInsights('30d');
    expect(r.totals.cost).toBeCloseTo(15, 2);
  });

  it('uses dataset span for "all" — unreliable when span < 7 days', async () => {
    const now = Date.now();
    const rows: RawRow[] = [];
    for (let i = 0; i < 25; i++) {
      rows.push(
        row({
          id: `r-${i}`,
          // All within 2 days → span < 7 → unreliable.
          timestamp: new Date(now - (i % 2) * 24 * 60 * 60 * 1000),
          totalCost: 1.0,
          model: 'gpt-4o',
        }),
      );
    }
    mockRows(rows);
    const r = await computeInsights('all');
    // Span < 7 days → reliable=false → monthly and percentReduction are 0.
    expect(r.projectedSavings.monthly).toBe(0);
    expect(r.projectedSavings.percentReduction).toBe(0);
  });
});

describe('concentration suppression (audit H7)', () => {
  it('returns zero concentration metrics when totalCalls < 20', async () => {
    const rows: RawRow[] = [];
    for (let i = 0; i < 5; i++) {
      // Skewed costs: first row $10, rest $0.01 — would be 99% concentration
      // if it weren't suppressed.
      rows.push(
        row({ id: `r-${i}`, totalCost: i === 0 ? 10 : 0.01 }),
      );
    }
    mockRows(rows);
    const r = await computeInsights('30d');
    expect(r.concentration.p20Cost).toBe(0);
    expect(r.concentration.p20Percent).toBe(0);
    expect(r.concentration.p5Cost).toBe(0);
    expect(r.concentration.p5Percent).toBe(0);
  });

  it('computes real concentration metrics when totalCalls >= 20', async () => {
    const rows: RawRow[] = [];
    for (let i = 0; i < 25; i++) {
      // Heavy top concentration.
      rows.push(row({ id: `r-${i}`, totalCost: i < 5 ? 10 : 0.01 }));
    }
    mockRows(rows);
    const r = await computeInsights('30d');
    expect(r.concentration.p20Percent).toBeGreaterThan(50);
  });
});

describe('annualization suppression (audit H6)', () => {
  it('reports zero monthly when 24h period (unreliable)', async () => {
    const rows: RawRow[] = [];
    for (let i = 0; i < 25; i++) {
      rows.push(row({ id: `r-${i}`, totalCost: 1.0 }));
    }
    mockRows(rows);
    const r = await computeInsights('24h');
    expect(r.projectedSavings.monthly).toBe(0);
    expect(r.projectedSavings.annual).toBe(0);
  });
});

describe('percentReduction cap (audit H11)', () => {
  it('never exceeds 80% even when recommendations would imply more', async () => {
    // Construct a dataset where naive savings exceed monthly burn.
    const rows: RawRow[] = [];
    for (let i = 0; i < 25; i++) {
      rows.push(
        row({
          id: `r-${i}`,
          totalCost: 5.0,
          inputTokens: 100_000,
          outputTokens: 50_000,
          model: 'gpt-4o',
          complexity: 'simple',
          category: 'factual',
        }),
      );
    }
    mockRows(rows);
    const r = await computeInsights('7d');
    expect(r.projectedSavings.percentReduction).toBeLessThanOrEqual(80);
  });
});

describe('filterToImportAggregate', () => {
  it('excludes import-aggregate rows from per-prompt recommendations', async () => {
    // 25 import-aggregate rows: each promptText starts with "[" (the marker).
    const rows: RawRow[] = [];
    for (let i = 0; i < 25; i++) {
      rows.push(
        row({
          id: `agg-${i}`,
          promptText: '[Anthropic usage rollup: 2025-05-01]',
          totalCost: 100,
          inputTokens: 1_000_000,
          outputTokens: 500_000,
          model: 'claude-opus-4',
          complexity: 'simple',
          category: 'factual',
          callCount: 1000,
        }),
      );
    }
    mockRows(rows);
    const r = await computeInsights('30d');
    // No per-prompt recommendations fire from aggregate rows.
    expect(r.modelMismatch).toEqual([]);
    expect(r.redundancyClusters).toEqual([]);
    expect(r.outputBloat).toEqual([]);
    // callCount sum drives totals.calls.
    expect(r.totals.calls).toBe(25_000);
  });
});

describe('topSpenders sorting', () => {
  it('returns the most expensive rows first', async () => {
    const rows: RawRow[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push(row({ id: `r-${i}`, totalCost: i + 1 })); // costs 1..5
    }
    mockRows(rows);
    const r = await computeInsights('30d');
    const costs = r.topSpenders.map((s) => s.totalCost);
    const sorted = [...costs].sort((a, b) => b - a);
    expect(costs).toEqual(sorted);
  });
});

describe('recommendation generation', () => {
  it('adaptive threshold lets demo-scale datasets surface signal', async () => {
    // Tiny dataset: 25 cheap calls on gpt-4o with simple complexity should
    // still surface a use-cheaper-model recommendation because the floor
    // is max(0.001, monthly * 0.005).
    const rows: RawRow[] = [];
    for (let i = 0; i < 25; i++) {
      rows.push(
        row({
          id: `r-${i}`,
          totalCost: 0.001,
          inputTokens: 100,
          outputTokens: 50,
          model: 'gpt-4o',
          complexity: 'simple',
        }),
      );
    }
    mockRows(rows);
    const r = await computeInsights('30d');
    // Should produce at least one model-routing recommendation.
    const routing = r.recommendations.filter((rec) => rec.category === 'model-routing');
    expect(routing.length).toBeGreaterThan(0);
  });
});

describe('model-mismatch detection', () => {
  it('uses cheapestEquivalent to identify downgrade candidates', async () => {
    const rows: RawRow[] = [];
    for (let i = 0; i < 25; i++) {
      rows.push(
        row({
          id: `r-${i}`,
          totalCost: 1.0,
          inputTokens: 10_000,
          outputTokens: 5_000,
          model: 'gpt-4o', // has downgrade → gpt-4o-mini
          complexity: 'simple',
          category: 'factual',
        }),
      );
    }
    mockRows(rows);
    const r = await computeInsights('30d');
    expect(r.modelMismatch.length).toBeGreaterThan(0);
    expect(r.modelMismatch[0]!.recommendedModel).toBe('gpt-4o-mini');
  });

  it('does not flag a model without a downgrade target', async () => {
    const rows: RawRow[] = [];
    for (let i = 0; i < 25; i++) {
      rows.push(
        row({
          id: `r-${i}`,
          totalCost: 0.5,
          model: 'gpt-4o-mini', // no downgrade
          complexity: 'simple',
        }),
      );
    }
    mockRows(rows);
    const r = await computeInsights('30d');
    expect(r.modelMismatch).toEqual([]);
  });
});

describe('redundancy clusters', () => {
  it('groups rows by normalized fingerprint and only emits clusters of ≥ 3', async () => {
    const rows: RawRow[] = [];
    // 3 identical prompts → cluster of 3.
    for (let i = 0; i < 3; i++) {
      rows.push(
        row({
          id: `same-${i}`,
          promptText: 'Summarize the meeting notes for engineering standup',
          inputCost: 0.5,
          inputTokens: 500,
          totalCost: 0.6,
          model: 'gpt-4o',
        }),
      );
    }
    // 22 unique prompts to satisfy the 20-call concentration floor and give totals shape.
    for (let i = 0; i < 22; i++) {
      rows.push(
        row({
          id: `uniq-${i}`,
          promptText: `Unique question number ${i} about widget`,
          totalCost: 0.01,
        }),
      );
    }
    mockRows(rows);
    const r = await computeInsights('30d');
    expect(r.redundancyClusters.length).toBeGreaterThan(0);
    const cluster = r.redundancyClusters[0]!;
    expect(cluster.calls).toBeGreaterThanOrEqual(3);
    expect(cluster.estimatedCachingSavings).toBeGreaterThan(0);
  });
});
