import { describe, it, expect } from 'vitest';
import { comparePrompts, diffWordLevel } from '@/lib/compare';

describe('comparePrompts() — verdict', () => {
  it('returns tie when A and B are identical', () => {
    const text = 'Summarize the document into three bullet points.';
    const r = comparePrompts({ a: { prompt: text }, b: { prompt: text }, model: 'gpt-4o' });
    expect(r.verdict).toBe('tie');
    expect(r.savings.tokens).toBe(0);
    expect(r.savings.cost).toBe(0);
  });

  it('returns b-better when B is shorter (same model)', () => {
    const a =
      'I would really appreciate it if you could in order to be sure please could you kindly summarize the meeting notes for me.';
    const b = 'Summarize the meeting notes.';
    const r = comparePrompts({ a: { prompt: a }, b: { prompt: b }, model: 'gpt-4o' });
    expect(r.verdict).toBe('b-better');
    expect(r.savings.tokens).toBeGreaterThan(0);
  });
});

describe('diffWordLevel()', () => {
  it('classifies tokens as added / removed / unchanged', () => {
    const segs = diffWordLevel('alpha beta gamma', 'alpha delta gamma');
    const kinds = segs.map((s) => s.kind);
    expect(kinds).toContain('unchanged');
    expect(kinds).toContain('added');
    expect(kinds).toContain('removed');
  });

  it('falls back to a gross diff for inputs above the LCS cap', () => {
    // Above LCS_TOKEN_CAP (8000 tokens) → falls back to "remove all of A,
    // add all of B".
    const a = 'word '.repeat(9000);
    const b = 'other '.repeat(9000);
    const segs = diffWordLevel(a, b);
    // Exactly two segments: one removed (all of A), one added (all of B).
    expect(segs).toHaveLength(2);
    expect(segs.map((s) => s.kind).sort()).toEqual(['added', 'removed']);
  });
});

describe('comparePrompts() — analysis notes', () => {
  it('flags category shift between A and B', () => {
    // A = factual question; B = creative task.
    const a = 'What is the capital of France?';
    const b = 'Write a short story about Paris.';
    const r = comparePrompts({ a: { prompt: a }, b: { prompt: b }, model: 'gpt-4o' });
    const note = r.analysisNotes.find((n) => n.includes('Category shifted'));
    expect(note).toBeDefined();
  });

  it('flags complexity shift between A and B', () => {
    const a = 'Hi.';
    const b =
      'What are the biggest contributors to last quarter revenue? Why did support tickets spike last month? What pricing changes would improve margins? How should we plan hiring for next quarter?';
    const r = comparePrompts({ a: { prompt: a }, b: { prompt: b }, model: 'gpt-4o' });
    const note = r.analysisNotes.find((n) => n.includes('Complexity shifted'));
    expect(note).toBeDefined();
  });
});
