import { describe, it, expect } from 'vitest';
import { optimizePrompt } from '@/lib/optimizer';
import { calculateCost } from '@/lib/pricing';
import { countTokens } from '@/lib/tokenizer';

describe('optimizePrompt() — auto-applied strategies', () => {
  it('removes filler phrases like "basically" and "as I mentioned earlier"', () => {
    const before = 'As I mentioned earlier, basically I just want a summary of the quarterly report.';
    const r = optimizePrompt(before, 'gpt-4o');
    const removed = r.suggestions.find((s) => s.type === 'remove-redundancy');
    expect(removed).toBeDefined();
    expect(r.optimizedPrompt.toLowerCase()).not.toContain('basically');
    expect(r.optimizedPrompt.toLowerCase()).not.toContain('as i mentioned earlier');
  });

  it('compresses verbose phrasing like "in order to" → "to"', () => {
    const before =
      'I would like to use the tool in order to extract data from the table due to the fact that the source is locked.';
    const r = optimizePrompt(before, 'gpt-4o');
    const compression = r.suggestions.find((s) => s.type === 'compression');
    expect(compression).toBeDefined();
    expect(r.optimizedPrompt.toLowerCase()).not.toContain('in order to');
    expect(r.optimizedPrompt.toLowerCase()).not.toContain('due to the fact that');
  });
});

describe('optimizePrompt() — advisory strategies', () => {
  it('suggests restructure when the prompt has multiple questions and ≥ 2 dimensions', () => {
    const text = 'What is the project deadline? Who owns the design review? Where is the spec stored?';
    const r = optimizePrompt(text, 'gpt-4o');
    const restructure = r.suggestions.find((s) => s.type === 'restructure');
    expect(restructure).toBeDefined();
  });

  it('suggests split when complexity is multidimensional', () => {
    // 4 distinct questions = >=3 dims + hasMultipleQuestions → multidimensional.
    const text =
      'What are the biggest contributors to last quarter revenue? Why did support tickets spike last month? What pricing changes would improve margins? How should we plan hiring for next quarter?';
    const r = optimizePrompt(text, 'gpt-4o');
    expect(r.analysis.complexity).toBe('multidimensional');
    const split = r.suggestions.find((s) => s.type === 'split');
    expect(split).toBeDefined();
  });

  it('suggests use-cheaper-model when complexity ≤ moderate AND a downgrade exists', () => {
    // Short factual ask on a premium model — gpt-4o has a downgrade to gpt-4o-mini.
    const r = optimizePrompt('What time is sunset in Tokyo?', 'gpt-4o');
    expect(['simple', 'moderate']).toContain(r.analysis.complexity);
    const downgrade = r.suggestions.find((s) => s.type === 'use-cheaper-model');
    expect(downgrade).toBeDefined();
    expect(downgrade?.title).toMatch(/gpt-4o-mini/);
  });

  it('suggests cap-output when expected output > 1500 AND complexity ≤ complex', () => {
    // Force the cap to fire by passing a large actualOutputTokens.
    const r = optimizePrompt('Summarize the meeting notes.', 'gpt-4o', 2400);
    const cap = r.suggestions.find((s) => s.type === 'cap-output');
    expect(cap).toBeDefined();
    expect(cap?.estimatedTokenSavings).toBeGreaterThan(0);
  });
});

describe('optimizePrompt() — audit-regression locks', () => {
  it('caps headline estimatedCostSavings at 95% of the original cost (audit C6)', () => {
    const before =
      'As I mentioned earlier, basically, due to the fact that I was wondering if you could help me, in order to be sure, please could you kindly summarize the report?';
    const r = optimizePrompt(before, 'gpt-4o');
    const originalCost = calculateCost(
      r.originalTokens,
      r.analysis.estimatedOutputTokens,
      'gpt-4o',
    ).totalCost;
    expect(r.estimatedCostSavings).toBeLessThanOrEqual(originalCost * 0.95 + 1e-9);
  });

  it('caps split-strategy savings at 60% of the original tokens (audit C7)', () => {
    const text =
      'What are the biggest contributors to last quarter revenue? Why did support tickets spike last month? What pricing changes would improve margins? How should we plan hiring for next quarter?';
    const r = optimizePrompt(text, 'gpt-4o');
    const split = r.suggestions.find((s) => s.type === 'split');
    expect(split).toBeDefined();
    expect(split!.estimatedTokenSavings).toBeLessThanOrEqual(Math.round(r.originalTokens * 0.6));
  });

  it('honours actualOutputTokens overriding the estimate (audit H9)', () => {
    const text = 'Summarize the meeting notes briefly.';
    // Without actual, output estimate is small → no cap-output suggestion.
    const noActual = optimizePrompt(text, 'gpt-4o');
    expect(noActual.suggestions.find((s) => s.type === 'cap-output')).toBeUndefined();
    // With a high actual, cap-output fires and labels itself "Actual".
    const withActual = optimizePrompt(text, 'gpt-4o', 3000);
    const cap = withActual.suggestions.find((s) => s.type === 'cap-output');
    expect(cap).toBeDefined();
    expect(cap?.description.toLowerCase()).toContain('actual');
  });
});

describe('optimizePrompt() — token bookkeeping', () => {
  it('produces non-negative savedTokens and a savedPercent in [0, 100]', () => {
    const before = 'In order to be sure, basically just summarize the report due to the fact that it is long.';
    const r = optimizePrompt(before, 'gpt-4o');
    expect(r.savedTokens).toBeGreaterThanOrEqual(0);
    expect(r.savedPercent).toBeGreaterThanOrEqual(0);
    expect(r.savedPercent).toBeLessThanOrEqual(100);
  });

  it('returns the original prompt unchanged when no patterns match', () => {
    const before = 'Describe how chlorophyll absorbs sunlight.';
    const r = optimizePrompt(before, 'gpt-4o');
    // The remove-redundancy/compression suggestions only fire when patterns match.
    expect(r.suggestions.some((s) => s.type === 'remove-redundancy')).toBe(false);
    expect(r.suggestions.some((s) => s.type === 'compression')).toBe(false);
    expect(r.optimizedPrompt.trim()).toBe(before.trim());
  });

  it('always includes the underlying analysis with stable shape', () => {
    const r = optimizePrompt('Write a haiku about latency.', 'claude-sonnet-4');
    expect(r.analysis).toBeDefined();
    expect(r.analysis.inputTokens).toBeGreaterThan(0);
    expect(['simple', 'moderate', 'complex', 'multidimensional']).toContain(r.analysis.complexity);
  });

  it('records remove-redundancy savings consistent with the token delta', () => {
    const before = 'Basically, actually, I really just wanted to ask for the summary.';
    const r = optimizePrompt(before, 'gpt-4o');
    const sug = r.suggestions.find((s) => s.type === 'remove-redundancy');
    expect(sug).toBeDefined();
    const beforeTokens = countTokens(before, 'gpt-4o');
    const afterTokens = countTokens(r.optimizedPrompt, 'gpt-4o');
    expect(sug!.estimatedTokenSavings).toBe(Math.max(0, beforeTokens - afterTokens));
  });

  it('never returns a negative estimatedCostSavings', () => {
    const r = optimizePrompt('hello world', 'gpt-4o');
    expect(r.estimatedCostSavings).toBeGreaterThanOrEqual(0);
  });

  it('does not suggest use-cheaper-model when the model has no downgrade target', () => {
    // gpt-4o-mini is already the cheapest in its family.
    const r = optimizePrompt('What time is it in Lagos?', 'gpt-4o-mini');
    expect(r.suggestions.find((s) => s.type === 'use-cheaper-model')).toBeUndefined();
  });
});
