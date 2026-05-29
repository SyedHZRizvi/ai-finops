import { describe, it, expect } from 'vitest';
import { countTokens, estimateOutputTokens, tokenizerConfidence } from '@/lib/tokenizer';

describe('countTokens()', () => {
  it('returns a cl100k_base count when no model is provided', () => {
    const n = countTokens('The quick brown fox jumps over the lazy dog.');
    // Empirically ~10 tokens on cl100k_base.
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(20);
  });

  it('returns a non-zero count for non-empty text', () => {
    expect(countTokens('hello world')).toBeGreaterThan(0);
  });

  it('returns 0 for empty text', () => {
    expect(countTokens('')).toBe(0);
  });

  it('uses o200k_base for gpt-4o and differs from the cl100k count', () => {
    // o200k_base typically has a denser vocab than cl100k_base, so for the
    // same input it tends to produce a *different* (often smaller) count.
    // We only assert "different" since vocab evolutions could swing either
    // way, and "same model family = same exact count" would still let us
    // catch a missing family switch.
    const text =
      'TypeScript is a language for application-scale JavaScript. It is open source and developed by Microsoft.';
    const cl100k = countTokens(text); // no model → cl100k
    const gpt4o = countTokens(text, 'gpt-4o');
    expect(gpt4o).not.toBe(cl100k);
  });

  it('applies the 1.15x correction factor for Claude models', () => {
    const text = 'The quick brown fox jumps over the lazy dog twice in succession.';
    const raw = countTokens(text); // cl100k baseline with factor 1.0
    const claude = countTokens(text, 'claude-sonnet-4');
    // Claude correction is 1.15; allow rounding to wobble by ±1.
    expect(claude).toBeCloseTo(Math.round(raw * 1.15), 0);
  });

  it('applies the 0.85x correction factor for Gemini models', () => {
    const text = 'The quick brown fox jumps over the lazy dog twice in succession.';
    const raw = countTokens(text);
    const gemini = countTokens(text, 'gemini-1.5-pro');
    expect(gemini).toBeCloseTo(Math.round(raw * 0.85), 0);
  });
});

describe('estimateOutputTokens()', () => {
  it('clamps the estimate between 50 and 4000', () => {
    expect(estimateOutputTokens('hi')).toBeGreaterThanOrEqual(50);
    const enormous = 'word '.repeat(20000);
    expect(estimateOutputTokens(enormous)).toBeLessThanOrEqual(4000);
  });

  it('returns 50 (the minimum) on an empty prompt', () => {
    expect(estimateOutputTokens('')).toBe(50);
  });

  it('classifies a code prompt with the code profile (1.0x multiplier)', () => {
    // Code profile = 1.0x; creative profile = 1.5x. With inputs large enough
    // to escape the 50-token floor clamp, creative output must exceed code.
    const big = ' '.padEnd(50, 'context word ');
    const codePrompt =
      'Implement a function that debounces an input handler. Use a setTimeout-based clock with proper cleanup, edge cases, and tests. ' +
      big.repeat(3);
    const creativePrompt =
      'Write a long narrative about a robot who learns to paint with the brush of a master, struggles, and ultimately finds its voice. ' +
      big.repeat(3);
    const codeOut = estimateOutputTokens(codePrompt, 'gpt-4o');
    const creativeOut = estimateOutputTokens(creativePrompt, 'gpt-4o');
    expect(creativeOut).toBeGreaterThan(codeOut);
  });

  it('rounds the raw estimate to an integer', () => {
    const out = estimateOutputTokens('Tell me a short story about cats.');
    expect(Number.isInteger(out)).toBe(true);
  });
});

describe('tokenizerConfidence()', () => {
  it('returns "exact" for the OpenAI families', () => {
    expect(tokenizerConfidence('gpt-4o')).toBe('exact');
    expect(tokenizerConfidence('gpt-3.5-turbo')).toBe('exact');
  });

  it('returns "approximate" for Claude and Gemini families', () => {
    expect(tokenizerConfidence('claude-sonnet-4')).toBe('approximate');
    expect(tokenizerConfidence('gemini-1.5-pro')).toBe('approximate');
  });
});
