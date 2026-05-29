import { describe, it, expect } from 'vitest';
import { buildPrompt } from '@/lib/promptBuilder';
import type { StudioRequest } from '@/lib/types';

function req(over: Partial<StudioRequest> = {}): StudioRequest {
  return {
    problem: over.problem ?? 'Write a one-paragraph description of the photosynthesis process.',
    desiredOutcome: over.desiredOutcome ?? 'A clear, accurate paragraph explaining the process.',
    targetProvider: over.targetProvider ?? 'gpt',
    ...over,
  };
}

describe('buildPrompt() — provider-specific formatting', () => {
  it('Claude target wraps sections in XML-style tags', () => {
    const result = buildPrompt(req({ targetProvider: 'claude' }));
    const standard = result.variants.find((v) => v.style === 'standard');
    expect(standard).toBeDefined();
    // Section-block emits "<task>...</task>" because PROVIDER_STYLES.claude.likesXmlTags=true.
    expect(standard!.prompt).toContain('<task>');
    expect(standard!.prompt).toContain('</task>');
  });

  it('GPT target uses ## markdown headers', () => {
    const result = buildPrompt(req({ targetProvider: 'gpt' }));
    const standard = result.variants.find((v) => v.style === 'standard');
    expect(standard).toBeDefined();
    expect(standard!.prompt).toContain('## Task');
  });

  it('Gemini target uses LABEL: section headers', () => {
    const result = buildPrompt(req({ targetProvider: 'gemini' }));
    const standard = result.variants.find((v) => v.style === 'standard');
    expect(standard).toBeDefined();
    // Gemini: likesStructuredFormat=true (only) → "TASK:" line emerges.
    expect(standard!.prompt).toContain('TASK:');
  });
});

describe('buildPrompt() — variants', () => {
  it('emits 4 variants when systemPromptSupported is true (terse/standard/detailed/system-and-user)', () => {
    const result = buildPrompt(req({ targetProvider: 'claude' }));
    expect(result.variants).toHaveLength(4);
    expect(result.variants.map((v) => v.style)).toEqual([
      'terse',
      'standard',
      'detailed',
      'system-and-user',
    ]);
  });

  it('omits the system-and-user variant when systemPromptSupported is false (copilot)', () => {
    const result = buildPrompt(req({ targetProvider: 'copilot' }));
    expect(result.variants).toHaveLength(3);
    expect(result.variants.map((v) => v.style)).toEqual(['terse', 'standard', 'detailed']);
  });
});

describe('buildPrompt() — split prompts', () => {
  it('emits splitPrompts only for multidimensional problems with ≥ 3 dimensions', () => {
    const multi = buildPrompt(
      req({
        problem:
          'What are the biggest contributors to last quarter revenue? Why did support tickets spike last month? What pricing changes would improve margins? How should we plan hiring for next quarter?',
        targetProvider: 'gpt',
      }),
    );
    expect(multi.detectedComplexity).toBe('multidimensional');
    expect(multi.splitPrompts).toBeDefined();
    expect(multi.splitPrompts!.length).toBeGreaterThanOrEqual(3);

    const simple = buildPrompt(
      req({
        problem: 'What is the capital of France?',
        targetProvider: 'gpt',
      }),
    );
    expect(simple.splitPrompts).toBeUndefined();
  });
});

describe('buildPrompt() — per-variant model selection (audit H8)', () => {
  it('selects the simpler model from the provider style table when complexity is simple', () => {
    // Simple problem → gpt → gpt-4o-mini per PROVIDER_STYLES.gpt.modelByComplexity.simple.
    const result = buildPrompt(
      req({
        problem: 'Hi',
        desiredOutcome: 'A polite greeting back.',
        targetProvider: 'gpt',
      }),
    );
    expect(result.detectedComplexity).toBe('simple');
    expect(result.recommendedModel).toBe('gpt-4o-mini');
  });

  it('selects the premium model for higher complexities', () => {
    const result = buildPrompt(
      req({
        problem:
          'What are the biggest contributors to last quarter revenue? Why did support tickets spike last month? What pricing changes would improve margins? How should we plan hiring for next quarter?',
        targetProvider: 'gpt',
      }),
    );
    expect(['complex', 'multidimensional']).toContain(result.detectedComplexity);
    expect(result.recommendedModel).toBe('gpt-4o');
  });
});
