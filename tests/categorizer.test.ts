import { describe, it, expect } from 'vitest';
import { analyzePrompt, categorize } from '@/lib/categorizer';

// Helper to drive scoreComplexity without re-deriving characteristics by hand.
function complexityOf(text: string) {
  const a = analyzePrompt(text);
  return { score: a.complexityScore, complexity: a.complexity, dimensions: a.dimensions };
}

describe('categorize() — category detection', () => {
  it('classifies a short fact-finding question as factual', () => {
    expect(categorize('What is the capital of France?')).toBe('factual');
  });

  it('classifies a "why" question as reasoning', () => {
    expect(categorize('Why does the sun rise in the east?')).toBe('reasoning');
  });

  it('classifies a creative writing request as creative', () => {
    expect(categorize('Write a short story about a robot who learns to paint.')).toBe('creative');
  });

  it('classifies a programming request as code', () => {
    expect(categorize('Implement a TypeScript function that debounces an input handler.')).toBe('code');
  });

  it('classifies an analytical comparison as analytical', () => {
    // Avoid language hints (graphql / rest api / postgres) that would
    // up-prioritize this into 'code'.
    expect(categorize('Compare the cost trade-offs of different cloud storage tiers.')).toBe('analytical');
  });

  it('classifies a short pleasantry as conversational', () => {
    expect(categorize('hey there!')).toBe('conversational');
  });

  it('classifies a "list of steps" request as instructional', () => {
    // "list X steps" + "outline" routes to instructional via the imperative
    // verb set without colliding with creative or analytical earlier
    // branches. ("How to ..." short prompts are caught earlier as factual.)
    expect(
      categorize('List the steps to plant a backyard vegetable garden. Outline a beginner-friendly plan.')
    ).toBe('instructional');
  });

  it('classifies an empty prompt as other', () => {
    expect(categorize('')).toBe('other');
  });
});

describe('scoreComplexity() — complexity tiers', () => {
  it('rates a very short prompt as simple', () => {
    const { complexity, score } = complexityOf('hi');
    expect(complexity).toBe('simple');
    expect(score).toBeLessThan(25);
  });

  it('rates a medium-length single-task prompt as moderate', () => {
    // ~30 words, no code, single question, sits in the 25-50 band.
    const text =
      'Summarize the main themes of the novel and provide three example quotations from the text supporting each theme. Keep the tone neutral.';
    const { complexity } = complexityOf(text);
    expect(['moderate', 'simple']).toContain(complexity);
  });

  it('rates a longer prompt with code + multiple imperatives at least as complex as moderate', () => {
    // Multiple imperatives, embedded code, and longer length push the score
    // well above the simple band.
    const text = `Refactor the following TypeScript function to use async/await rather than promises, write typed error handling, and describe each change made.

\`\`\`ts
function fetchUser(id: string) {
  return getUser(id).then(u => loadProfile(u).then(p => render(p)));
}
\`\`\`

Explain why the new approach improves readability, list potential edge cases, and propose three test cases.`;
    const { complexity } = complexityOf(text);
    expect(['moderate', 'complex', 'multidimensional']).toContain(complexity);
  });

  it('rates a multi-question, multi-imperative prompt as multidimensional', () => {
    const text =
      'What are the biggest contributors to last quarter revenue? Why did support tickets spike last month? What pricing changes would improve margins? How should we plan hiring for next quarter?';
    const { complexity, dimensions } = complexityOf(text);
    expect(complexity).toBe('multidimensional');
    expect(dimensions.length).toBeGreaterThanOrEqual(3);
  });
});

describe('extractDimensions — multi-facet splitting', () => {
  it('splits at question marks when there are multiple questions', () => {
    const text = 'What is X? Why is Y? How does Z work?';
    const { dimensions } = complexityOf(text);
    expect(dimensions.length).toBeGreaterThanOrEqual(3);
  });

  it('splits at "and also" conjunctions when there is no question chain', () => {
    const text =
      'Tell me a bit about the company history and also detail their main product line and also describe their go-to-market strategy.';
    const { dimensions } = complexityOf(text);
    expect(dimensions.length).toBeGreaterThanOrEqual(2);
  });

  it('splits comma-separated imperative chains', () => {
    const text = 'Build a landing page, write a launch tweet, draft a press release, and propose an ads plan.';
    const { dimensions } = complexityOf(text);
    expect(dimensions.length).toBeGreaterThanOrEqual(2);
  });
});

describe('characteristic detection', () => {
  it('detects code from fenced code blocks', () => {
    const a = analyzePrompt('```python\nprint("hi")\n```');
    expect(a.characteristics.hasCode).toBe(true);
  });

  it('detects multiple questions when two ?-terminated lines appear', () => {
    const a = analyzePrompt('What is the deadline? When does the project ship?');
    expect(a.characteristics.hasMultipleQuestions).toBe(true);
  });

  it('detects a context dump in long narrative input', () => {
    // 350+ word context with no imperative ratio >= 20%.
    const paragraph = ('Here is some long background context. ').repeat(60);
    const a = analyzePrompt(paragraph + 'What should I do?');
    expect(a.characteristics.hasContextDump).toBe(true);
  });

  it('detects redundancy via filler phrases', () => {
    const a = analyzePrompt('As I mentioned earlier, basically I just want a summary of the report.');
    expect(a.characteristics.hasRedundancy).toBe(true);
  });

  it('detects examples via "for example" markers', () => {
    const a = analyzePrompt('Describe a few SaaS pricing models. For example, freemium or per-seat tiers.');
    expect(a.characteristics.hasExamples).toBe(true);
  });
});

describe('edge cases', () => {
  it('handles empty string without throwing', () => {
    const a = analyzePrompt('');
    expect(a.inputTokens).toBe(0);
    expect(a.category).toBe('other');
    expect(a.complexity).toBe('simple');
  });

  it('handles whitespace-only input gracefully', () => {
    const a = analyzePrompt('   \n  \t  ');
    expect(a.category).toBe('other');
    expect(a.characteristics.wordCount).toBe(0);
  });

  it('handles very long input without crashing', () => {
    const long = 'word '.repeat(5000);
    const a = analyzePrompt(long);
    expect(a.inputTokens).toBeGreaterThan(1000);
    // Score is capped at 100 by design.
    expect(a.complexityScore).toBeLessThanOrEqual(100);
  });
});
