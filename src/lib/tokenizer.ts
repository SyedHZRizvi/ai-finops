import { encode } from 'gpt-tokenizer';

let cachedEncoder: ((text: string) => number[]) | null = null;

function getEncoder(): (text: string) => number[] {
  if (!cachedEncoder) {
    cachedEncoder = encode;
  }
  return cachedEncoder;
}

export function countTokens(text: string, _model?: string): number {
  if (!text) return 0;
  const enc = getEncoder();
  return enc(text).length;
}

type OutputProfile = 'creative' | 'reasoning' | 'factual' | 'code' | 'conversational' | 'default';

function classifyOutputProfile(prompt: string): OutputProfile {
  const lower = prompt.toLowerCase();

  if (
    /```|\bfunction\s|\bclass\s|\bdef\s|\bselect\s+.*\bfrom\b|\bimport\s|\bconst\s|\blet\s|\bvar\s|=>/.test(
      prompt,
    ) ||
    /\b(implement|refactor|debug|compile|write\s+(a\s+)?(function|class|method|script|code|program))\b/.test(
      lower,
    )
  ) {
    return 'code';
  }

  if (
    /\b(write|draft|compose|story|poem|novel|narrative|screenplay|brainstorm|imagine|invent)\b/.test(
      lower,
    )
  ) {
    return 'creative';
  }

  if (
    /\b(analyze|compare|evaluate|assess|reason|prove|derive|explain (the )?reasoning|why does|why is|how does|step by step|breakdown)\b/.test(
      lower,
    )
  ) {
    return 'reasoning';
  }

  if (
    /^\s*(what|who|when|where|which)\s+(is|are|was|were|did|do|does)\b/.test(lower) ||
    (lower.length < 120 && /\?/.test(prompt))
  ) {
    return 'factual';
  }

  if (prompt.trim().length < 60 || /\b(hi|hello|hey|thanks|thank you|ok|sure)\b/.test(lower)) {
    return 'conversational';
  }

  return 'default';
}

export function estimateOutputTokens(prompt: string, model?: string): number {
  if (!prompt) return 50;
  const inputTokens = countTokens(prompt, model);

  const multipliers: Record<OutputProfile, number> = {
    creative: 1.5,
    reasoning: 1.2,
    code: 1.0,
    default: 0.8,
    conversational: 0.5,
    factual: 0.3,
  };

  const profile = classifyOutputProfile(prompt);
  const raw = inputTokens * multipliers[profile];
  return Math.max(50, Math.min(4000, Math.round(raw)));
}
