// A/B prompt compare engine.
//
// Given two prompts, this module produces:
//   - per-side analysis (tokens, estimated output, cost, classification)
//   - a word-level diff (clean LCS, no npm deps)
//   - savings deltas (tokens + cost in absolute and percent)
//   - a verdict (which side is "better" — lower cost wins)
//   - human-readable analysis notes describing classification shifts.
//
// `comparePrompts` is intentionally synchronous so it composes cleanly with
// other pure helpers. The caller (e.g. the /api/compare route handler) is
// responsible for invoking `ensurePricingLoaded()` first so cost calculations
// reflect any user-edited pricing in the Settings table.
import { analyzePrompt } from './categorizer';
import { countTokens, estimateOutputTokens } from './tokenizer';
import { calculateCost } from './pricing';

export interface CompareInput {
  a: { prompt: string; label?: string };
  b: { prompt: string; label?: string };
  model?: string;
}

export interface DiffSegment {
  kind: 'unchanged' | 'added' | 'removed';
  text: string;
}

export interface ComparedSide {
  prompt: string;
  tokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  category: string;
  complexity: string;
  complexityScore: number;
  dimensions: string[];
}

export interface CompareResult {
  a: ComparedSide;
  b: ComparedSide;
  diff: DiffSegment[]; // segment-level diff from A → B
  savings: { tokens: number; tokensPercent: number; cost: number; costPercent: number };
  verdict: 'b-better' | 'a-better' | 'tie';
  analysisNotes: string[];
}

// --- Word-level LCS diff ---------------------------------------------------
//
// Split each side on whitespace boundaries so tokens are preserved together
// with the whitespace that follows them. This way the rendered diff can lay
// out without losing line breaks or runs of spaces, and small edits inside a
// paragraph don't look like a wholesale rewrite.
//
// We cap LCS work at a soft input ceiling — beyond that, we fall back to a
// trivial "remove all of A, add all of B" diff so the algorithm stays linear
// on pathologically large inputs (50k+ chars).
const LCS_TOKEN_CAP = 8000;

function splitWithWs(text: string): string[] {
  if (!text) return [];
  // Tokenize into [word][trailing-whitespace?] chunks so whitespace stays
  // attached to the preceding word — keeps rendered output stable.
  const out: string[] = [];
  const re = /\S+\s*|\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[0]);
  }
  return out;
}

/**
 * Pure word-level LCS: returns a list of diff segments. Equal tokens are
 * coalesced into a single 'unchanged' segment, runs of removed-only tokens
 * become 'removed', runs of added-only tokens become 'added'.
 *
 * Uses the standard dynamic-programming LCS table. O(n*m) time and space.
 */
function lcsDiff(aTokens: string[], bTokens: string[]): DiffSegment[] {
  const n = aTokens.length;
  const m = bTokens.length;

  // Fast path: identical → all unchanged.
  if (n === 0 && m === 0) return [];
  if (n === 0) return [{ kind: 'added', text: bTokens.join('') }];
  if (m === 0) return [{ kind: 'removed', text: aTokens.join('') }];

  // Bail out on huge inputs — quadratic memory is the killer here.
  if (n > LCS_TOKEN_CAP || m > LCS_TOKEN_CAP) {
    return [
      { kind: 'removed', text: aTokens.join('') },
      { kind: 'added', text: bTokens.join('') },
    ];
  }

  // dp[i][j] = LCS length of a[0..i] and b[0..j]. Use Int32Array rows to keep
  // allocation low. Width = m + 1.
  const width = m + 1;
  const dp = new Int32Array((n + 1) * width);
  for (let i = 1; i <= n; i++) {
    const ai = aTokens[i - 1];
    const rowI = i * width;
    const rowP = (i - 1) * width;
    for (let j = 1; j <= m; j++) {
      if (ai === bTokens[j - 1]) {
        dp[rowI + j] = dp[rowP + (j - 1)] + 1;
      } else {
        const up = dp[rowP + j] ?? 0;
        const left = dp[rowI + (j - 1)] ?? 0;
        dp[rowI + j] = up >= left ? up : left;
      }
    }
  }

  // Backtrack from (n, m) to (0, 0) building segments in reverse, then flip.
  const segs: DiffSegment[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (aTokens[i - 1] === bTokens[j - 1]) {
      segs.push({ kind: 'unchanged', text: aTokens[i - 1]! });
      i--;
      j--;
    } else {
      const up = dp[(i - 1) * width + j] ?? 0;
      const left = dp[i * width + (j - 1)] ?? 0;
      if (up >= left) {
        segs.push({ kind: 'removed', text: aTokens[i - 1]! });
        i--;
      } else {
        segs.push({ kind: 'added', text: bTokens[j - 1]! });
        j--;
      }
    }
  }
  while (i > 0) {
    segs.push({ kind: 'removed', text: aTokens[i - 1]! });
    i--;
  }
  while (j > 0) {
    segs.push({ kind: 'added', text: bTokens[j - 1]! });
    j--;
  }
  segs.reverse();

  // Coalesce runs of the same kind so consumers get tidy segments.
  const out: DiffSegment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.kind === s.kind) {
      last.text += s.text;
    } else {
      out.push({ kind: s.kind, text: s.text });
    }
  }
  return out;
}

export function diffWordLevel(a: string, b: string): DiffSegment[] {
  return lcsDiff(splitWithWs(a), splitWithWs(b));
}

// --- Verdict + analysis notes ---------------------------------------------

const COMPLEXITY_RANK: Record<string, number> = {
  simple: 0,
  moderate: 1,
  complex: 2,
  multidimensional: 3,
};

function analyzeSide(prompt: string, model: string | undefined): ComparedSide {
  const analysis = analyzePrompt(prompt, model);
  const tokens = countTokens(prompt, model);
  const estOut = estimateOutputTokens(prompt, model);
  const { totalCost } = calculateCost(tokens, estOut, model ?? 'generic');
  return {
    prompt,
    tokens,
    estimatedOutputTokens: estOut,
    estimatedCost: totalCost,
    category: analysis.category,
    complexity: analysis.complexity,
    complexityScore: analysis.complexityScore,
    dimensions: analysis.dimensions,
  };
}

function buildNotes(a: ComparedSide, b: ComparedSide, identical: boolean): string[] {
  const notes: string[] = [];
  if (identical) {
    notes.push('Prompts are identical — no changes detected.');
    return notes;
  }
  if (a.category !== b.category) {
    notes.push(`Category shifted from ${a.category} → ${b.category}.`);
  }
  if (a.complexity !== b.complexity) {
    notes.push(`Complexity shifted from ${a.complexity} → ${b.complexity}.`);
  }
  const scoreDelta = b.complexityScore - a.complexityScore;
  if (Math.abs(scoreDelta) >= 5) {
    const dir = scoreDelta < 0 ? 'down' : 'up';
    notes.push(
      `Complexity score moved ${dir} by ${Math.abs(scoreDelta)} points (${a.complexityScore} → ${b.complexityScore}).`,
    );
  }
  if (a.dimensions.length !== b.dimensions.length) {
    notes.push(
      `Dimensions changed: ${a.dimensions.length} → ${b.dimensions.length} distinct facets.`,
    );
  }
  const tokenDelta = a.tokens - b.tokens;
  if (tokenDelta > 0) {
    const pct = a.tokens > 0 ? (tokenDelta / a.tokens) * 100 : 0;
    notes.push(`B is ${tokenDelta} tokens shorter than A (${pct.toFixed(1)}% reduction).`);
  } else if (tokenDelta < 0) {
    const pct = a.tokens > 0 ? (-tokenDelta / a.tokens) * 100 : 0;
    notes.push(`B is ${-tokenDelta} tokens longer than A (${pct.toFixed(1)}% increase).`);
  } else if (a.tokens > 0) {
    notes.push('Both prompts use the same number of tokens.');
  }
  const outDelta = a.estimatedOutputTokens - b.estimatedOutputTokens;
  if (Math.abs(outDelta) >= 25) {
    const dir = outDelta > 0 ? 'shorter' : 'longer';
    notes.push(
      `Estimated output is ${Math.abs(outDelta)} tokens ${dir} on B (${a.estimatedOutputTokens} → ${b.estimatedOutputTokens}).`,
    );
  }
  if (COMPLEXITY_RANK[a.complexity] !== undefined && COMPLEXITY_RANK[b.complexity] !== undefined) {
    const aRank = COMPLEXITY_RANK[a.complexity]!;
    const bRank = COMPLEXITY_RANK[b.complexity]!;
    if (bRank < aRank) {
      notes.push('B simplifies the request — likely cheaper and lower-latency.');
    } else if (bRank > aRank) {
      notes.push('B adds complexity — confirm the extra detail is worth the cost.');
    }
  }
  return notes;
}

/**
 * Compare two prompts side by side. Pure and synchronous. Callers that need
 * the live pricing table should call `ensurePricingLoaded()` first.
 */
export function comparePrompts(input: CompareInput): CompareResult {
  const aPrompt = input.a?.prompt ?? '';
  const bPrompt = input.b?.prompt ?? '';
  const model = input.model;

  const a = analyzeSide(aPrompt, model);
  const b = analyzeSide(bPrompt, model);
  const diff = diffWordLevel(aPrompt, bPrompt);

  const tokenSaving = a.tokens - b.tokens;
  const costSaving = a.estimatedCost - b.estimatedCost;
  const tokenPct = a.tokens > 0 ? (tokenSaving / a.tokens) * 100 : 0;
  const costPct = a.estimatedCost > 0 ? (costSaving / a.estimatedCost) * 100 : 0;

  const identical = aPrompt === bPrompt;
  let verdict: CompareResult['verdict'];
  if (identical) {
    verdict = 'tie';
  } else if (costSaving > 0.0000001 || (costSaving === 0 && tokenSaving > 0)) {
    verdict = 'b-better';
  } else if (costSaving < -0.0000001 || (costSaving === 0 && tokenSaving < 0)) {
    verdict = 'a-better';
  } else {
    verdict = 'tie';
  }

  return {
    a,
    b,
    diff,
    savings: {
      tokens: tokenSaving,
      tokensPercent: Number.isFinite(tokenPct) ? tokenPct : 0,
      cost: costSaving,
      costPercent: Number.isFinite(costPct) ? costPct : 0,
    },
    verdict,
    analysisNotes: buildNotes(a, b, identical),
  };
}
