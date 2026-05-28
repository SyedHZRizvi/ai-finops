import type {
  Category,
  Complexity,
  PromptAnalysis,
  PromptCharacteristics,
} from './types';
import { countTokens, estimateOutputTokens } from './tokenizer';

const QUESTION_WORDS = ['what', 'who', 'when', 'where', 'why', 'how', 'which', 'can', 'could', 'should', 'would', 'is', 'are', 'do', 'does'];

const IMPERATIVE_VERBS = [
  'write', 'explain', 'list', 'create', 'build', 'implement', 'analyze',
  'compare', 'summarize', 'translate', 'review', 'generate', 'draft',
  'compose', 'design', 'refactor', 'debug', 'fix', 'optimize', 'describe',
  'outline', 'evaluate', 'assess', 'rewrite', 'convert', 'extract',
  'propose', 'recommend', 'identify', 'plan', 'develop', 'produce',
  'prepare', 'find', 'choose', 'select', 'suggest', 'classify', 'rank',
  'predict', 'forecast', 'estimate', 'calculate', 'measure', 'investigate',
];

const CODE_KEYWORDS = [
  'function', 'class ', 'def ', 'select ', 'import ', 'const ', 'let ',
  'return ', 'public ', 'private ', 'interface ', 'export ', 'async ',
];

// Audit L1: language hints must require a strong programming context
// to avoid false positives like "let's go" or "Java the city". Each entry
// is paired with a regex requiring the term to appear near a programming
// keyword (code|function|script|library|framework|api|build|write|run).
const LANGUAGE_HINTS_STRONG = [
  // Unambiguous — these are programming-only terms.
  'python', 'javascript', 'typescript', 'rust', 'golang', 'kotlin',
  'swift', 'node.js', 'nodejs', 'django', 'flask', 'next.js', 'nextjs',
  'graphql', 'rest api', 'postgres', 'mysql', 'mongodb',
  // C++/C# unambiguous via the special chars.
  'c++', 'c#',
];

// Audit L1: ambiguous tokens require a programming-context neighbor.
const AMBIGUOUS_LANGUAGE_HINTS = [
  ' go ', 'java ', 'ruby', 'php', 'sql', 'react', 'vue', 'angular',
];

const PROGRAMMING_CONTEXT_RE =
  /\b(code|coding|function|class|method|script|library|framework|api|build|compile|deploy|programming|developer|developing|debug|refactor|implement|module|package|import|repo|repository|commit|deploy|backend|frontend)\b/;

const REDUNDANCY_FILLERS = [
  'as i mentioned earlier', 'as you know', 'basically', 'essentially',
  'please could you kindly', 'i was wondering if', 'just', 'really',
  'actually',
];

const EXAMPLE_MARKERS = ['for example', 'e.g.', 'such as', 'like this:'];

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

function countQuestions(text: string): number {
  const punctuation = (text.match(/\?/g) || []).length;
  const lines = text.split(/\n+/);
  let leadingQuestionWords = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const first = trimmed.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    // Audit L2: a leading question-word only counts as a question when the
    // line actually ends with "?". Otherwise "Is is a verb." (declarative)
    // would be counted as a question. Strong question words (what/who/etc)
    // still count without a "?" since they're rarely declarative.
    const STRONG_Q = ['what', 'who', 'when', 'where', 'why', 'how', 'which'];
    if (first && QUESTION_WORDS.includes(first)) {
      if (STRONG_Q.includes(first) || trimmed.endsWith('?')) {
        leadingQuestionWords += 1;
      }
    }
  }
  // de-overcount: a question line typically has both a leading word AND a "?"
  return Math.max(punctuation, leadingQuestionWords);
}

function detectCode(text: string): boolean {
  if (/```/.test(text)) return true;
  // indented code block: 4+ spaces or tab at start of any line that also looks codey
  if (/(^|\n)( {4,}|\t)\S/.test(text) && /[;{}()=]/.test(text)) return true;
  const lower = text.toLowerCase();
  if (CODE_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  return false;
}

function detectMultipleQuestions(text: string, questionCount: number): boolean {
  if (questionCount >= 2) return true;
  // comma- or "and"-separated sub-questions inside a single line
  const lower = text.toLowerCase();
  const conjunctionAsks = lower.match(/(,|\band\b)\s+(also|then|what|why|how|when|where|which)\b/g);
  return (conjunctionAsks?.length ?? 0) >= 2;
}

function detectContextDump(text: string, wordCount: number): boolean {
  if (wordCount <= 300) return false;
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return false;
  let asks = 0;
  for (const s of sentences) {
    const lower = s.toLowerCase();
    if (/\?$/.test(s)) {
      asks += 1;
      continue;
    }
    const first = lower.split(/\s+/)[0] ?? '';
    if (IMPERATIVE_VERBS.includes(first)) asks += 1;
  }
  const ratio = asks / sentences.length;
  return ratio < 0.2;
}

function detectRedundancy(text: string): boolean {
  const lower = text.toLowerCase();
  if (REDUNDANCY_FILLERS.some((f) => lower.includes(f))) return true;

  const words = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;

  const grams = new Map<string, number>();
  for (let i = 0; i <= words.length - 3; i++) {
    const g = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  for (const count of grams.values()) {
    if (count >= 2) return true;
  }
  return false;
}

function detectExamples(text: string): boolean {
  const lower = text.toLowerCase();
  return EXAMPLE_MARKERS.some((m) => lower.includes(m));
}

function countImperativeVerbs(text: string): number {
  // Count at start of any clause: sentence start, newline, after a sentence
  // terminator, AND after a comma or " and " inside the same sentence.
  // "Build X, write Y, draft Z, and propose W" → 4.
  const clauses = text
    .split(/(?:^|\n+|[.!?]\s+|,\s+|;\s+|\s+and\s+)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  let count = 0;
  for (const seg of clauses) {
    const first = seg.toLowerCase().split(/\s+/)[0]?.replace(/[^a-z]/g, '') ?? '';
    if (IMPERATIVE_VERBS.includes(first)) count += 1;
  }
  return count;
}

function extractCharacteristics(text: string): PromptCharacteristics {
  const wordCount = countWords(text);
  const sentenceCount = countSentences(text);
  const questionCount = countQuestions(text);
  return {
    wordCount,
    sentenceCount,
    questionCount,
    hasCode: detectCode(text),
    hasMultipleQuestions: detectMultipleQuestions(text, questionCount),
    hasContextDump: detectContextDump(text, wordCount),
    hasRedundancy: detectRedundancy(text),
    hasExamples: detectExamples(text),
    imperativeVerbs: countImperativeVerbs(text),
  };
}

function imperativeSet(text: string): Set<string> {
  const out = new Set<string>();
  const segments = text.split(/(?:^|\n+|[.!?]\s+)/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const first = seg.toLowerCase().split(/\s+/)[0]?.replace(/[^a-z]/g, '') ?? '';
    if (IMPERATIVE_VERBS.includes(first)) out.add(first);
  }
  return out;
}

export function categorize(text: string): Category {
  if (!text || !text.trim()) return 'other';
  const lower = text.toLowerCase();
  const chars = extractCharacteristics(text);
  const verbs = imperativeSet(text);

  // Audit L1: strong language hints alone → code. Ambiguous ones require
  // a programming-context neighbor so "let's go" / "Java the city" don't
  // misclassify.
  const mentionsStrongLanguage = LANGUAGE_HINTS_STRONG.some((l) => lower.includes(l));
  const mentionsAmbiguousLanguage = AMBIGUOUS_LANGUAGE_HINTS.some((l) => lower.includes(l));
  const inProgrammingContext = PROGRAMMING_CONTEXT_RE.test(lower);
  const mentionsLanguage =
    mentionsStrongLanguage || (mentionsAmbiguousLanguage && inProgrammingContext);
  if (
    chars.hasCode ||
    verbs.has('implement') ||
    verbs.has('refactor') ||
    verbs.has('debug') ||
    mentionsLanguage
  ) {
    return 'code';
  }

  const creativeVerbs = ['write', 'draft', 'compose'];
  const creativeNouns = /\b(story|poem|novel|song|lyrics|narrative|screenplay|essay|blog)\b/;
  if ((creativeVerbs.some((v) => verbs.has(v)) || creativeNouns.test(lower)) && !chars.hasCode) {
    return 'creative';
  }

  const analyticalVerbs = ['analyze', 'compare', 'evaluate', 'assess'];
  if (analyticalVerbs.some((v) => verbs.has(v)) || /\bbreakdown\b/.test(lower)) {
    return 'analytical';
  }

  if (/\bwhy\b|\bhow does\b|\bexplain the reasoning\b|\bprove\b|\bderive\b/.test(lower)) {
    return 'reasoning';
  }

  const isShort = chars.wordCount < 20;
  if (
    !chars.hasMultipleQuestions &&
    (/^\s*(what|who|when|where|which) (is|are|was|were|did|do|does)\b/i.test(text) ||
      (isShort && chars.questionCount === 1))
  ) {
    return 'factual';
  }

  if (/\bhow to\b|\bsteps to\b|\bguide me through\b|\bwalk me through\b/.test(lower)) {
    return 'instructional';
  }

  if (chars.wordCount < 15 && chars.imperativeVerbs === 0) {
    return 'conversational';
  }

  return 'other';
}

function extractDimensions(text: string, chars: PromptCharacteristics): string[] {
  const dims: string[] = [];

  if (chars.hasMultipleQuestions) {
    const questionMatches = text.match(/[^.!?\n]*\?/g) ?? [];
    for (const q of questionMatches) {
      const cleaned = q.trim().replace(/\s+/g, ' ');
      if (cleaned.length > 0) dims.push(cleaned.slice(0, 80));
    }
  }

  if (dims.length === 0) {
    const splits = text.split(/\b(?:and also|additionally|furthermore|moreover)\b|\n\s*\d+[.)]\s+/i);
    if (splits.length > 1) {
      for (const piece of splits) {
        const trimmed = piece.trim().replace(/\s+/g, ' ');
        if (trimmed.length > 5) dims.push(trimmed.slice(0, 80));
      }
    }
  }

  // Comma- or "and"-separated imperative chains:
  // "Build X, write Y, draft Z, and propose W" → 4 dimensions.
  // Splits the text at boundaries that look like ", <imperative>" or " and <imperative>",
  // then keeps any chunk that itself starts with an imperative.
  if (dims.length === 0) {
    const verbAlt = IMPERATIVE_VERBS.join('|');
    const splitRe = new RegExp(`(?:,|\\band\\b|;)\\s+(?=(?:${verbAlt})\\b)`, 'gi');
    const startRe = new RegExp(`^(?:${verbAlt})\\b`, 'i');
    const pieces = text.split(splitRe).map((p) => p.trim()).filter(Boolean);
    if (pieces.length >= 2) {
      const verbStarts = pieces.filter((p) => startRe.test(p));
      if (verbStarts.length >= 2) {
        for (const p of verbStarts) {
          dims.push(p.replace(/\s+/g, ' ').slice(0, 80));
        }
      }
    }
  }

  const dedup: string[] = [];
  const seen = new Set<string>();
  for (const d of dims) {
    const key = d.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(d);
    }
  }
  return dedup.slice(0, 6);
}

export function scoreComplexity(
  text: string,
  characteristics: PromptCharacteristics,
): { score: number; complexity: Complexity; dimensions: string[] } {
  const c = characteristics;

  const wordScore = Math.min(30, c.wordCount / 20);
  const questionScore = Math.min(15, c.questionCount * 5);
  const sentenceScore = Math.min(10, c.sentenceCount * 1.5);
  const imperativeScore = Math.min(15, c.imperativeVerbs * 5);
  const codeScore = c.hasCode ? 10 : 0;
  const contextScore = c.hasContextDump ? 15 : 0;
  const multiScore = c.hasMultipleQuestions ? 10 : 0;

  const dimensions = extractDimensions(text, c);
  const dimensionScore = Math.min(15, Math.max(0, dimensions.length - 1) * 5);

  let score =
    wordScore +
    questionScore +
    sentenceScore +
    imperativeScore +
    codeScore +
    contextScore +
    multiScore +
    dimensionScore;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let complexity: Complexity;
  if (score < 25) complexity = 'simple';
  else if (score < 50) complexity = 'moderate';
  else if (score < 75) complexity = 'complex';
  else complexity = 'multidimensional';

  // Multi-question / multi-dimension always lifts to at least multidimensional.
  // Either question marks OR a chain of three or more distinct imperatives counts.
  if (dimensions.length >= 3 && (c.hasMultipleQuestions || c.imperativeVerbs >= 3)) {
    complexity = 'multidimensional';
  }

  return { score, complexity, dimensions };
}

export function analyzePrompt(text: string, model?: string): PromptAnalysis {
  const safeText = text ?? '';
  const characteristics = extractCharacteristics(safeText);
  const inputTokens = countTokens(safeText, model);
  const category = categorize(safeText);
  const { score, complexity, dimensions } = scoreComplexity(safeText, characteristics);
  const estimatedOutputTokens = estimateOutputTokens(safeText, model);

  return {
    inputTokens,
    estimatedOutputTokens,
    category,
    complexity,
    complexityScore: score,
    dimensions,
    characteristics,
  };
}
