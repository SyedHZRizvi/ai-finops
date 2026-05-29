import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    allocationRule: {
      findMany: vi.fn(),
    },
  },
}));

import {
  type AllocationRuleData,
  applyAllocation,
  matches,
  reallocateRows,
} from '@/lib/allocation';
import { prisma } from '@/lib/db';

function rule(over: Partial<AllocationRuleData> = {}): AllocationRuleData {
  return {
    id: over.id ?? 'r-1',
    name: over.name ?? 'rule',
    sourceMatcher: over.sourceMatcher ?? {},
    targetSplit: over.targetSplit ?? { 'team-a': 100 },
    isActive: over.isActive ?? true,
    priority: over.priority ?? 100,
  };
}

describe('matches() — source matchers', () => {
  it('treats undefined matcher fields as wildcards (matches anything)', () => {
    expect(matches({ appName: 'foo', model: 'gpt-4o', userId: null }, {})).toBe(true);
  });

  it('treats an array as an OR set across allowed values', () => {
    expect(
      matches(
        { appName: 'foo', model: 'gpt-4o', userId: null },
        { appName: ['foo', 'bar'] },
      ),
    ).toBe(true);
    expect(
      matches(
        { appName: 'baz', model: 'gpt-4o', userId: null },
        { appName: ['foo', 'bar'] },
      ),
    ).toBe(false);
  });

  it('null on the row never matches an explicit matcher value', () => {
    expect(matches({ appName: null, model: 'gpt-4o', userId: null }, { appName: 'foo' })).toBe(false);
  });
});

describe('applyAllocation()', () => {
  it('passes through unchanged when no rule applies', () => {
    const out = applyAllocation({ appName: 'foo', model: 'gpt-4o', userId: null, totalCost: 1 }, []);
    expect(out).toHaveLength(1);
    expect(out[0].ruleId).toBeNull();
    expect(out[0].allocatedAppName).toBe('foo');
    expect(out[0].allocatedCost).toBe(1);
  });

  it('1-to-N splits cost by exact percent', () => {
    const r = rule({
      sourceMatcher: { appName: 'pool' },
      targetSplit: { 'team-a': 60, 'team-b': 30, 'team-c': 10 },
    });
    const out = applyAllocation({ appName: 'pool', model: 'gpt-4o', userId: null, totalCost: 10 }, [r]);
    expect(out).toHaveLength(3);
    const byName = Object.fromEntries(out.map((o) => [o.allocatedAppName, o.allocatedCost]));
    expect(byName['team-a']).toBeCloseTo(6, 6);
    expect(byName['team-b']).toBeCloseTo(3, 6);
    expect(byName['team-c']).toBeCloseTo(1, 6);
  });

  it('preserves total cost across the split (within FP tolerance)', () => {
    const r = rule({
      sourceMatcher: { appName: 'pool' },
      targetSplit: { 'a': 50, 'b': 50 },
    });
    const out = applyAllocation({ appName: 'pool', model: 'gpt-4o', userId: null, totalCost: 7.77 }, [r]);
    const sum = out.reduce((s, o) => s + o.allocatedCost, 0);
    expect(sum).toBeCloseTo(7.77, 6);
  });

  it('respects priority ordering — lowest priority number wins', () => {
    const ruleHigh = rule({
      id: 'high-priority',
      sourceMatcher: { appName: 'pool' },
      targetSplit: { 'high-team': 100 },
      priority: 10, // numerically lower → matches first
    });
    const ruleLow = rule({
      id: 'low-priority',
      sourceMatcher: { appName: 'pool' },
      targetSplit: { 'low-team': 100 },
      priority: 100,
    });
    // Pre-sort by priority asc (the engine assumes pre-sorted input).
    const sorted = [ruleHigh, ruleLow].sort((a, b) => a.priority - b.priority);
    const out = applyAllocation({ appName: 'pool', model: 'gpt-4o', userId: null, totalCost: 5 }, sorted);
    expect(out).toHaveLength(1);
    expect(out[0].allocatedAppName).toBe('high-team');
    expect(out[0].ruleId).toBe('high-priority');
  });
});

describe('reallocateRows() — batch application', () => {
  it('aggregates allocated costs back to the original row total', async () => {
    (prisma.allocationRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'r-1',
        name: 'pool-split',
        sourceMatcher: JSON.stringify({ appName: 'pool' }),
        targetSplit: JSON.stringify({ a: 60, b: 40 }),
        isActive: true,
        priority: 100,
      },
    ]);

    const rows = [
      { appName: 'pool', model: 'gpt-4o', userId: null, totalCost: 10 },
      { appName: 'pool', model: 'gpt-4o', userId: null, totalCost: 5 },
      { appName: 'other', model: 'gpt-4o', userId: null, totalCost: 3 },
    ];
    const out = await reallocateRows(rows);

    const totalOriginal = rows.reduce((s, r) => s + r.totalCost, 0); // 18
    const totalAllocated = out.reduce((s, r) => s + r.allocatedCost, 0);
    expect(totalAllocated).toBeCloseTo(totalOriginal, 6);
  });
});
