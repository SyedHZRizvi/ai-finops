import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma binding before importing pricing — pricing.ts does a lazy
// dynamic import in ensurePricingLoaded(), so we hook into that path here.
vi.mock('@/lib/db', () => ({
  prisma: {
    modelPricingConfig: {
      findMany: vi.fn(),
    },
  },
}));

import {
  DEFAULT_PRICING,
  calculateCost,
  cheapestEquivalent,
  ensurePricingLoaded,
  getPricing,
  _invalidatePricingCache,
} from '@/lib/pricing';
import { prisma } from '@/lib/db';

beforeEach(() => {
  vi.clearAllMocks();
  _invalidatePricingCache();
});

describe('getPricing()', () => {
  it('returns the exact entry for a known model', () => {
    const p = getPricing('gpt-4o');
    expect(p.model).toBe('gpt-4o');
    expect(p.provider).toBe('openai');
  });

  it('returns a substring match for a longer model identifier', () => {
    // "gpt-4o-2024-08-06" includes "gpt-4o" → matches the gpt-4o row.
    const p = getPricing('gpt-4o-2024-08-06');
    expect(p.model).toBe('gpt-4o');
  });

  it('resolves an alias (haiku in the name → claude-haiku-4)', () => {
    const p = getPricing('claude-3-5-haiku-20241022');
    // No direct/substring match against DEFAULT_PRICING. Alias resolution
    // sees "haiku" inside the needle and maps to claude-haiku-4.
    expect(p.model).toBe('claude-haiku-4');
  });

  it('resolves the bare "claude" alias to claude-sonnet-4', () => {
    // 'claude-something-new' that does not include "sonnet/haiku/opus" still
    // matches the catch-all 'claude' alias → claude-sonnet-4.
    const p = getPricing('claude-instant');
    expect(p.model).toBe('claude-sonnet-4');
  });

  it('falls back to GENERIC for a completely unknown model', () => {
    const p = getPricing('totally-made-up-model-name');
    expect(p.model).toBe('generic');
  });

  it('returns GENERIC for an empty model string', () => {
    expect(getPricing('').model).toBe('generic');
  });
});

describe('calculateCost()', () => {
  it('returns zero across the board when both token counts are zero', () => {
    const c = calculateCost(0, 0, 'gpt-4o');
    expect(c.inputCost).toBe(0);
    expect(c.outputCost).toBe(0);
    expect(c.totalCost).toBe(0);
  });

  it('handles large token counts without overflow', () => {
    const c = calculateCost(10_000_000, 10_000_000, 'gpt-4o');
    // gpt-4o: $2.5/M input + $10/M output = $25 + $100 = $125.
    expect(c.totalCost).toBeCloseTo(125, 4);
    expect(Number.isFinite(c.totalCost)).toBe(true);
  });

  it('clamps negative token counts to zero', () => {
    const c = calculateCost(-100, -100, 'gpt-4o');
    expect(c.totalCost).toBe(0);
  });
});

describe('cheapestEquivalent()', () => {
  it('returns the documented downgrade for a known premium model', () => {
    const c = cheapestEquivalent('gpt-4o');
    expect(c).not.toBeNull();
    expect(c!.model).toBe('gpt-4o-mini');
  });

  it('returns null when the model has no defined downgrade target', () => {
    // gpt-4o-mini is already the cheapest in its family — no downgrade exists.
    expect(cheapestEquivalent('gpt-4o-mini')).toBeNull();
  });

  it('returns null for an empty model string', () => {
    expect(cheapestEquivalent('')).toBeNull();
  });
});

describe('ensurePricingLoaded() — DB cache (audit C1)', () => {
  it('reloads pricing from the database after invalidation', async () => {
    const findMany = prisma.modelPricingConfig.findMany as ReturnType<typeof vi.fn>;
    findMany.mockResolvedValue([
      {
        model: 'custom-overpriced-model',
        provider: 'mystery-co',
        inputCostPer1M: 99,
        outputCostPer1M: 999,
        cacheReadCostPer1M: null,
        cacheWriteCostPer1M: null,
        contextWindow: 32_000,
        isActive: true,
      },
    ]);

    await ensurePricingLoaded();
    expect(findMany).toHaveBeenCalledTimes(1);

    // DB cache takes precedence over DEFAULT_PRICING when names collide / match.
    const p = getPricing('custom-overpriced-model');
    expect(p.model).toBe('custom-overpriced-model');
    expect(p.inputCostPer1M).toBe(99);
    expect(p.outputCostPer1M).toBe(999);
  });

  it('DB-cache precedence overrides the built-in default for an identical model name (audit C1)', async () => {
    const findMany = prisma.modelPricingConfig.findMany as ReturnType<typeof vi.fn>;
    findMany.mockResolvedValue([
      {
        model: 'gpt-4o',
        provider: 'openai',
        inputCostPer1M: 1.5, // user-overridden, different from the 2.5 default
        outputCostPer1M: 6,
        cacheReadCostPer1M: null,
        cacheWriteCostPer1M: null,
        contextWindow: 128_000,
        isActive: true,
      },
    ]);
    await ensurePricingLoaded();
    const p = getPricing('gpt-4o');
    expect(p.inputCostPer1M).toBe(1.5);
    expect(p.outputCostPer1M).toBe(6);
  });
});

describe('DEFAULT_PRICING constant', () => {
  it('always exposes a "generic" fallback row', () => {
    expect(DEFAULT_PRICING.some((p) => p.model === 'generic')).toBe(true);
  });
});
