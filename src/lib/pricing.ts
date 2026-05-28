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

export function getPricing(model: string): ModelPricing {
  if (!model) return GENERIC;
  const needle = model.toLowerCase();

  const direct = DEFAULT_PRICING.find((p) => p.model.toLowerCase() === needle);
  if (direct) return direct;

  const substring = DEFAULT_PRICING.find(
    (p) => p.model !== 'generic' && needle.includes(p.model.toLowerCase()),
  );
  if (substring) return substring;

  for (const alias of ALIASES) {
    if (alias.match.some((m) => needle.includes(m))) {
      const target = DEFAULT_PRICING.find((p) => p.model === alias.target);
      if (target) return target;
    }
  }

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
