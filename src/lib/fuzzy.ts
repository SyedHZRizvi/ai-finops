// Tiny fuzzy matcher for the Cmd+K command palette.
//
// Design goals:
//   - Zero dependencies, ~80 lines.
//   - Forgive typos and missing letters: every query char must appear in
//     the target in order, but adjacent matches and word-boundary matches
//     score higher.
//   - Stable scoring so the same input always sorts the same way.
//
// Returned score is normalized roughly to 0..1+. We only treat a result as
// `matched` if every character of `query` was consumed in order — any
// query character that fails to find a home means we reject the candidate.
// An empty query matches everything with score 0 so callers can use the
// returned `indices` and `matched` flag uniformly.

export interface FuzzyResult {
  /** Higher is better. 0 when the query is empty. */
  score: number;
  /** Whether every query character matched in order. */
  matched: boolean;
  /** Indices into `target` of the matched characters (for highlighting). */
  indices: number[];
}

const WORD_BOUNDARY_BONUS = 0.7;
const CONSECUTIVE_BONUS = 0.5;
const START_BONUS = 1.0;
const EXACT_CASE_BONUS = 0.1;

function isWordBoundary(target: string, idx: number): boolean {
  if (idx === 0) return true;
  const prev = target.charCodeAt(idx - 1);
  // Treat space, punctuation, and case transitions as boundaries.
  const isSep = (prev >= 32 && prev <= 47) || (prev >= 58 && prev <= 64) || (prev >= 91 && prev <= 96) || (prev >= 123 && prev <= 126);
  if (isSep) return true;
  const cur = target.charCodeAt(idx);
  // camelCase boundary: lowercase -> uppercase
  if (prev >= 97 && prev <= 122 && cur >= 65 && cur <= 90) return true;
  return false;
}

/**
 * Greedy in-order match. We always consume the earliest valid character so
 * scoring stays deterministic; the bonuses above bias the score so that
 * obvious matches (start, word-boundary, consecutive) win out over the same
 * letters scattered through a long string when callers compare scores.
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult {
  if (query.length === 0) {
    return { score: 0, matched: true, indices: [] };
  }
  if (target.length === 0) {
    return { score: 0, matched: false, indices: [] };
  }

  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const indices: number[] = [];

  let qi = 0;
  let ti = 0;
  let score = 0;
  let lastMatch = -2;

  while (qi < q.length && ti < t.length) {
    if (q.charCodeAt(qi) === t.charCodeAt(ti)) {
      let bonus = 1;
      if (ti === 0) bonus += START_BONUS;
      else if (isWordBoundary(target, ti)) bonus += WORD_BOUNDARY_BONUS;
      if (lastMatch === ti - 1) bonus += CONSECUTIVE_BONUS;
      if (query.charCodeAt(qi) === target.charCodeAt(ti)) bonus += EXACT_CASE_BONUS;

      score += bonus;
      indices.push(ti);
      lastMatch = ti;
      qi += 1;
    }
    ti += 1;
  }

  if (qi < q.length) {
    return { score: 0, matched: false, indices: [] };
  }

  // Slight penalty for very long targets so "set" matches "Settings" better
  // than it matches "Open production settings page in another tab".
  const lengthPenalty = Math.max(0, target.length - query.length) * 0.005;
  return { score: Math.max(0, score - lengthPenalty), matched: true, indices };
}
