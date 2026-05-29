import { describe, it, expect } from 'vitest';
import { fuzzyMatch } from '@/lib/fuzzy';

describe('fuzzyMatch()', () => {
  it('returns matched=true and score=0 for an empty query', () => {
    const r = fuzzyMatch('', 'anything');
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0);
  });

  it('scores an exact match highest among candidates', () => {
    const exact = fuzzyMatch('settings', 'Settings');
    const partial = fuzzyMatch('settings', 'Open settings sidebar');
    expect(exact.score).toBeGreaterThan(partial.score);
  });

  it('scores start-of-string matches higher than later matches', () => {
    // 'set' at the start of 'set page' (ti=0 → START_BONUS) scores higher
    // than 'set' starting at index 5 in 'a__b_set' (word boundary at _ but
    // not start-of-string).
    const startMatch = fuzzyMatch('set', 'set page');
    const laterMatch = fuzzyMatch('set', 'abcde set');
    expect(startMatch.score).toBeGreaterThan(laterMatch.score);
  });

  it('scores consecutive-letter matches higher than spread-out matches', () => {
    // 'abc' matches in 'abc' directly (start + 2 consecutive) → high score.
    // In 'axbxc' the same letters appear in order but not adjacent, and the
    // intervening characters are letters (no word-boundary bonus to offset).
    const consecutive = fuzzyMatch('abc', 'abc');
    const spread = fuzzyMatch('abc', 'axbxc');
    expect(consecutive.score).toBeGreaterThan(spread.score);
  });

  it('returns matched=false when a query character cannot be consumed in order', () => {
    const r = fuzzyMatch('zzz', 'abc');
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });

  it('case-insensitive match still rewards exact case with a small bonus', () => {
    const exactCase = fuzzyMatch('Set', 'Set');
    const wrongCase = fuzzyMatch('set', 'Set');
    expect(exactCase.score).toBeGreaterThan(wrongCase.score);
  });
});
