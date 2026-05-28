import type { OptimizationResult, OptimizationSuggestion } from './types';
import { countTokens } from './tokenizer';
import { calculateCost, cheapestEquivalent, getPricing } from './pricing';
import { analyzePrompt } from './categorizer';

const FILLER_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\bplease could you kindly\b/gi, replacement: 'please' },
  { pattern: /\bas i mentioned earlier,?\s*/gi, replacement: '' },
  { pattern: /\bas you (?:already )?know,?\s*/gi, replacement: '' },
  { pattern: /\b(?:basically|essentially|actually|really)\b,?\s*/gi, replacement: '' },
  // "just" as filler — be conservative, only when followed by another adverb or "want"
  { pattern: /\bjust\s+(?=want|need|wanted|wondering|curious)\b/gi, replacement: '' },
];

const COMPRESSION_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\bin order to\b/gi, replacement: 'to' },
  { pattern: /\bdue to the fact that\b/gi, replacement: 'because' },
  { pattern: /\bat this point in time\b/gi, replacement: 'now' },
  { pattern: /\ba large number of\b/gi, replacement: 'many' },
  { pattern: /\bin the event that\b/gi, replacement: 'if' },
  { pattern: /\bfor the purpose of\b/gi, replacement: 'for' },
  { pattern: /\bwith regard to\b/gi, replacement: 'about' },
  { pattern: /\bwith regards to\b/gi, replacement: 'about' },
  { pattern: /\bmake use of\b/gi, replacement: 'use' },
  { pattern: /\bis able to\b/gi, replacement: 'can' },
  { pattern: /\bare able to\b/gi, replacement: 'can' },
  { pattern: /\bi was wondering if you could\b/gi, replacement: 'please' },
  { pattern: /\bwould you be so kind as to\b/gi, replacement: 'please' },
  { pattern: /\bi would (?:really )?appreciate it if you could\b/gi, replacement: 'please' },
  { pattern: /\bat the present time\b/gi, replacement: 'now' },
  { pattern: /\bin spite of the fact that\b/gi, replacement: 'although' },
];

function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function applyPatterns(
  text: string,
  patterns: { pattern: RegExp; replacement: string }[],
): { result: string; changed: boolean } {
  let result = text;
  let changed = false;
  for (const { pattern, replacement } of patterns) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) changed = true;
  }
  const collapsed = collapseWhitespace(result);
  if (collapsed !== text) changed = true;
  return { result: collapsed, changed };
}

function snippet(text: string, max = 140): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function optimizePrompt(prompt: string, model: string = 'generic'): OptimizationResult {
  const original = prompt ?? '';
  const originalTokens = countTokens(original, model);
  const analysis = analyzePrompt(original, model);
  const pricing = getPricing(model);
  const suggestions: OptimizationSuggestion[] = [];

  let working = original;

  // 1. remove-redundancy (auto-applied)
  const beforeRedundancy = working;
  const redundancyStep = applyPatterns(working, FILLER_PATTERNS);
  if (redundancyStep.changed) {
    working = redundancyStep.result;
    const before = countTokens(beforeRedundancy, model);
    const after = countTokens(working, model);
    const saved = Math.max(0, before - after);
    const { totalCost } = calculateCost(saved, 0, model);
    suggestions.push({
      type: 'remove-redundancy',
      title: 'Remove filler phrases',
      description:
        'Strips politeness padding, hedges ("basically", "essentially"), and back-references ("as I mentioned earlier") that the model already accounts for.',
      before: snippet(beforeRedundancy),
      after: snippet(working),
      estimatedTokenSavings: saved,
      estimatedCostSavings: totalCost,
      confidence: 0.95,
    });
  }

  // 2. compression (auto-applied)
  const beforeCompression = working;
  const compressionStep = applyPatterns(working, COMPRESSION_PATTERNS);
  if (compressionStep.changed) {
    working = compressionStep.result;
    const before = countTokens(beforeCompression, model);
    const after = countTokens(working, model);
    const saved = Math.max(0, before - after);
    const { totalCost } = calculateCost(saved, 0, model);
    suggestions.push({
      type: 'compression',
      title: 'Compress verbose phrasing',
      description:
        'Replaces wordy patterns ("in order to" → "to", "due to the fact that" → "because") and softens polite preambles into direct imperatives.',
      before: snippet(beforeCompression),
      after: snippet(working),
      estimatedTokenSavings: saved,
      estimatedCostSavings: totalCost,
      confidence: 0.95,
    });
  }

  // 3. restructure — suggestion only
  if (analysis.characteristics.hasMultipleQuestions && analysis.dimensions.length >= 2) {
    const numbered = analysis.dimensions
      .map((d, i) => `${i + 1}. ${d.replace(/\?$/, '')}`)
      .join('\n');
    // Asking the model to answer a numbered list produces tighter output than open prose.
    const estimatedSavings = Math.round(analysis.estimatedOutputTokens * 0.2);
    const { totalCost } = calculateCost(0, estimatedSavings, model);
    suggestions.push({
      type: 'restructure',
      title: 'Restructure as a numbered list',
      description:
        'Multi-part questions phrased as a single paragraph encourage a discursive answer. A numbered list nudges the model toward a concise, point-by-point response.',
      before: snippet(original),
      after: numbered,
      estimatedTokenSavings: estimatedSavings,
      estimatedCostSavings: totalCost,
      confidence: 0.7,
    });
  }

  // 4. split — multidimensional only
  if (analysis.complexity === 'multidimensional') {
    const parts = Math.max(2, Math.min(analysis.dimensions.length, 5));
    // crude proxy for "context tokens shared across asks": ~half of input is reusable preamble
    const sharedContext = Math.round(originalTokens * 0.5);
    const estimatedSavings = sharedContext * (parts - 1);
    const { totalCost } = calculateCost(estimatedSavings, 0, model);
    suggestions.push({
      type: 'split',
      title: `Split into ${parts} focused prompts`,
      description:
        'Bundling unrelated asks forces the model to re-load context for each one. Splitting them and reusing a shared system prompt (cacheable) cuts repeated input.',
      estimatedTokenSavings: estimatedSavings,
      estimatedCostSavings: totalCost,
      confidence: 0.6,
    });
  }

  // 5. few-shot-reduction
  if (analysis.characteristics.hasExamples) {
    const exampleCount =
      (original.toLowerCase().match(/for example|e\.g\./g) ?? []).length;
    if (exampleCount > 2) {
      const estimatedSavings = Math.round(originalTokens * 0.15);
      const { totalCost } = calculateCost(estimatedSavings, 0, model);
      suggestions.push({
        type: 'few-shot-reduction',
        title: 'Reduce the number of examples',
        description: `Detected ${exampleCount} example markers. Modern frontier models generalize from 1–2 well-chosen examples; trim the rest.`,
        estimatedTokenSavings: estimatedSavings,
        estimatedCostSavings: totalCost,
        confidence: 0.7,
      });
    }
  }

  // 6. system-prompt-extraction
  if (analysis.characteristics.hasContextDump || originalTokens > 800) {
    // assume ~60% of input is reusable role/context across requests; with caching only 10% of that is re-billed
    const reusable = Math.round(originalTokens * 0.6);
    const estimatedSavings = Math.round(reusable * 0.9);
    const { totalCost } = calculateCost(estimatedSavings, 0, model);
    suggestions.push({
      type: 'system-prompt-extraction',
      title: 'Hoist context into a cached system prompt',
      description:
        'Stable role and background instructions can be moved into a system prompt and cached. With prompt caching, repeat reads cost a fraction of the per-1M input rate.',
      estimatedTokenSavings: estimatedSavings,
      estimatedCostSavings: totalCost,
      confidence: 0.5,
    });
  }

  // 7. use-cheaper-model
  if (analysis.complexity === 'simple' || analysis.complexity === 'moderate') {
    const cheaper = cheapestEquivalent(model);
    if (cheaper && cheaper.model !== pricing.model) {
      const inputCount = originalTokens;
      const outputCount = analysis.estimatedOutputTokens;
      const current = calculateCost(inputCount, outputCount, pricing.model).totalCost;
      const proposed =
        (inputCount / 1_000_000) * cheaper.inputCostPer1M +
        (outputCount / 1_000_000) * cheaper.outputCostPer1M;
      const costSavings = Math.max(0, current - proposed);
      suggestions.push({
        type: 'use-cheaper-model',
        title: `Downgrade to ${cheaper.model}`,
        description: `Complexity is ${analysis.complexity}; ${cheaper.model} handles this tier well at a fraction of the cost.`,
        estimatedTokenSavings: 0,
        estimatedCostSavings: costSavings,
        confidence: 0.6,
      });
    }
  }

  // 8. cap-output
  if (
    analysis.estimatedOutputTokens > 1500 &&
    analysis.complexity !== 'multidimensional'
  ) {
    const targetWords = 300;
    const cappedTokens = Math.round(targetWords * 1.3);
    const estimatedSavings = Math.max(0, analysis.estimatedOutputTokens - cappedTokens);
    const { totalCost } = calculateCost(0, estimatedSavings, model);
    suggestions.push({
      type: 'cap-output',
      title: 'Cap response length',
      description: `Estimated output is ~${analysis.estimatedOutputTokens} tokens. Appending "Respond in at most ${targetWords} words." caps output cost.`,
      after: `…\n\nRespond in at most ${targetWords} words.`,
      estimatedTokenSavings: estimatedSavings,
      estimatedCostSavings: totalCost,
      confidence: 0.8,
    });
  }

  const optimizedTokens = countTokens(working, model);
  const savedTokens = Math.max(0, originalTokens - optimizedTokens);
  const savedPercent =
    originalTokens > 0 ? Math.round((savedTokens / originalTokens) * 1000) / 10 : 0;
  const estimatedCostSavings = suggestions.reduce(
    (sum, s) => sum + s.estimatedCostSavings,
    0,
  );

  return {
    originalPrompt: original,
    optimizedPrompt: working,
    originalTokens,
    optimizedTokens,
    savedTokens,
    savedPercent,
    estimatedCostSavings,
    suggestions,
    analysis,
  };
}
