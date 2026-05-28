import type { ModelPricing } from './types';

export const DEFAULT_PRICING: ModelPricing[] = [
  {
    model: 'claude-opus-4',
    provider: 'anthropic',
    inputCostPer1M: 15,
    outputCostPer1M: 75,
    contextWindow: 200_000,
  },
  {
    model: 'claude-sonnet-4',
    provider: 'anthropic',
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    contextWindow: 200_000,
  },
  {
    model: 'claude-haiku-4',
    provider: 'anthropic',
    inputCostPer1M: 0.8,
    outputCostPer1M: 4,
    contextWindow: 200_000,
  },
  {
    model: 'gpt-4o',
    provider: 'openai',
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
    contextWindow: 128_000,
  },
  {
    model: 'gpt-4o-mini',
    provider: 'openai',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    contextWindow: 128_000,
  },
  {
    model: 'gpt-3.5-turbo',
    provider: 'openai',
    inputCostPer1M: 0.5,
    outputCostPer1M: 1.5,
    contextWindow: 16_000,
  },
  {
    model: 'gemini-1.5-pro',
    provider: 'google',
    inputCostPer1M: 1.25,
    outputCostPer1M: 5,
    contextWindow: 2_000_000,
  },
  {
    model: 'gemini-1.5-flash',
    provider: 'google',
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.3,
    contextWindow: 1_000_000,
  },
  {
    model: 'generic',
    inputCostPer1M: 1,
    outputCostPer1M: 3,
    contextWindow: 32_000,
  },
];

const GENERIC: ModelPricing = DEFAULT_PRICING[DEFAULT_PRICING.length - 1]!;

// Aliases let "claude-3-5-sonnet-20241022" or "gpt-4-turbo" find a reasonable mapping.
const ALIASES: { match: string[]; target: string }[] = [
  { match: ['sonnet'], target: 'claude-sonnet-4' },
  { match: ['haiku'], target: 'claude-haiku-4' },
  { match: ['opus'], target: 'claude-opus-4' },
  { match: ['claude'], target: 'claude-sonnet-4' },
  { match: ['gpt-4o-mini', '4o-mini', 'mini'], target: 'gpt-4o-mini' },
  { match: ['gpt-4o', '4o'], target: 'gpt-4o' },
  { match: ['gpt-4'], target: 'gpt-4o' },
  { match: ['gpt-3.5', 'gpt-35', 'turbo'], target: 'gpt-3.5-turbo' },
  { match: ['flash'], target: 'gemini-1.5-flash' },
  { match: ['gemini'], target: 'gemini-1.5-pro' },
];

// Live pricing cache populated from the ModelPricingConfig database table.
// Route handlers call `ensurePricingLoaded()` before computing cost so that
// edits made in the Settings UI actually take effect. Without this layer the
// Settings table was dead code (audit finding C1).
let _dbCache: ModelPricing[] = [];
let _lastLoadedAt = 0;
const PRICING_TTL_MS = 30_000;

/**
 * Refresh the in-memory pricing cache from the database if it is older than
 * the TTL. Safe to call frequently; only hits the DB once per TTL window.
 * Falls back to DEFAULT_PRICING silently if the DB query fails (e.g. during
 * a deploy when the schema is not yet applied).
 */
export async function ensurePricingLoaded(): Promise<void> {
  const now = Date.now();
  if (now - _lastLoadedAt < PRICING_TTL_MS) return;
  try {
    // Lazy import avoids a circular dep with db.ts at module load time and
    // keeps this module usable from places that don't carry a Prisma binding.
    const { prisma } = await import('./db');
    const rows = await prisma.modelPricingConfig.findMany({
      where: { isActive: true },
    });
    _dbCache = rows.map((r) => ({
      model: r.model,
      ...(r.provider ? { provider: r.provider } : {}),
      inputCostPer1M: r.inputCostPer1M,
      outputCostPer1M: r.outputCostPer1M,
      ...(r.cacheReadCostPer1M !== null ? { cacheReadCostPer1M: r.cacheReadCostPer1M } : {}),
      ...(r.cacheWriteCostPer1M !== null ? { cacheWriteCostPer1M: r.cacheWriteCostPer1M } : {}),
      contextWindow: r.contextWindow,
    }));
    _lastLoadedAt = now;
  } catch {
    // Keep prior cache (or empty) so behaviour degrades gracefully to
    // DEFAULT_PRICING rather than failing the request.
  }
}

/**
 * Test/debug-only: forcibly invalidate the cache so the next call refreshes
 * from the DB. Not currently called by application code.
 */
export function _invalidatePricingCache(): void {
  _lastLoadedAt = 0;
}

export function getPricing(model: string): ModelPricing {
  if (!model) return GENERIC;
  const needle = model.toLowerCase();

  // 1) Live DB cache (user-editable via Settings) takes precedence.
  const dbDirect = _dbCache.find((p) => p.model.toLowerCase() === needle);
  if (dbDirect) return dbDirect;
  const dbSubstring = _dbCache.find(
    (p) => p.model.toLowerCase().length > 3 && needle.includes(p.model.toLowerCase()),
  );
  if (dbSubstring) return dbSubstring;

  // 2) Built-in defaults (shipped with the code).
  const direct = DEFAULT_PRICING.find((p) => p.model.toLowerCase() === needle);
  if (direct) return direct;

  const substring = DEFAULT_PRICING.find(
    (p) => p.model !== 'generic' && needle.includes(p.model.toLowerCase()),
  );
  if (substring) return substring;

  // 3) Family alias resolution.
  for (const alias of ALIASES) {
    if (alias.match.some((m) => needle.includes(m))) {
      const target =
        _dbCache.find((p) => p.model === alias.target) ??
        DEFAULT_PRICING.find((p) => p.model === alias.target);
      if (target) return target;
    }
  }

  // 4) Generic fallback (so cost is never zero on an unknown model).
  return GENERIC;
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = getPricing(model);
  const inputCost = (Math.max(0, inputTokens) / 1_000_000) * pricing.inputCostPer1M;
  const outputCost = (Math.max(0, outputTokens) / 1_000_000) * pricing.outputCostPer1M;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

// Same-family downgrade targets. Only "large" models map to something cheaper.
const DOWNGRADE_MAP: Record<string, string> = {
  'claude-opus-4': 'claude-haiku-4',
  'claude-sonnet-4': 'claude-haiku-4',
  'gpt-4o': 'gpt-4o-mini',
  'gemini-1.5-pro': 'gemini-1.5-flash',
};

export function cheapestEquivalent(model: string): ModelPricing | null {
  if (!model) return null;
  const pricing = getPricing(model);
  const targetName = DOWNGRADE_MAP[pricing.model];
  if (!targetName) return null;
  const target = DEFAULT_PRICING.find((p) => p.model === targetName);
  return target ?? null;
}
