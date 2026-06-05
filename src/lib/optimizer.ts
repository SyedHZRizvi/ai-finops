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

export function optimizePrompt(
  prompt: string,
  model: string = 'generic',
  // Audit H9: if the caller knows the actual output token count from a logged
  // call, pass it here. cap-output then fires only when output truly bloated,
  // not when our heuristic estimate was high.
  actualOutputTokens?: number,
): OptimizationResult {
  const original = prompt ?? '';
  const originalTokens = countTokens(original, model);
  const analysis = analyzePrompt(original, model);
  const pricing = getPricing(model);
  const suggestions: OptimizationSuggestion[] = [];

  // Use actual output tokens when supplied, fall back to estimate otherwise.
  const effectiveOutputTokens =
    actualOutputTokens !== undefined && actualOutputTokens > 0
      ? actualOutputTokens
      : analysis.estimatedOutputTokens;

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
    // Audit C7: previously this projected sharedContext * (parts - 1) which
    // could exceed the original prompt's token count entirely. Cap savings at
    // 60% of original — splitting + caching realistically pays back about
    // half to two-thirds of repeated context tokens, never more.
    const sharedContext = Math.round(originalTokens * 0.5);
    const estimatedSavings = Math.min(
      Math.round(originalTokens * 0.6),
      sharedContext * (parts - 1),
    );
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
  // Fix: count actual example BLOCKS, not just "e.g." occurrences. Real few-shot
  // prompts use structured patterns: "Example N:", "Input:/Output:" pairs,
  // "---" block separators, or repeated "Q:/A:" blocks. Counting "e.g." was
  // giving false positives on prompts that merely referenced a model name
  // (e.g. Claude, e.g. GPT-4) without any examples.
  if (analysis.characteristics.hasExamples) {
    const text = original;
    // Block-level example markers — each is one actual example
    const blockMarkers = (text.match(
      /\bexample\s*\d+\s*[:\-]|\binput\s*\d*\s*[:\-]\s*|\boutput\s*\d*\s*[:\-]\s*|^Q\s*[:]\s*|^A\s*[:]\s*/gim
    ) ?? []).length;
    // Inline "e.g." only counts if followed by at least 20 chars of content
    const inlineEg = (text.match(/(?:for example|e\.g\.)\s*[:\-]?\s*.{20,}/gi) ?? []).length;
    const exampleCount = Math.max(blockMarkers, inlineEg);
    if (exampleCount > 2) {
      const estimatedSavings = Math.round(originalTokens * 0.15);
      const { totalCost } = calculateCost(estimatedSavings, 0, model);
      suggestions.push({
        type: 'few-shot-reduction',
        title: 'Reduce the number of examples',
        description: `Detected ${exampleCount} example blocks. Modern frontier models (GPT-4, Claude 3+, Gemini 1.5+) generalize reliably from 1–2 well-chosen examples — cut the rest to reduce input tokens on every call.`,
        estimatedTokenSavings: estimatedSavings,
        estimatedCostSavings: totalCost,
        confidence: 0.7,
      });
    }
  }

  // 6. system-prompt-extraction
  // Fix: previously fired on ANY prompt >800 tokens, projecting 54% savings
  // (0.6 reusable × 0.9 discount) even on one-off prompts that have nothing
  // reusable. Now only fires when there are CLEAR indicators of stable context:
  //   a) hasContextDump from categorizer (role, persona, or background block)
  //   b) OR explicit role/instruction markers in the text
  // Also reduced reusable estimate from 60% → 40% to be conservative.
  const hasRoleMarkers = /\b(you are|act as|your role|your job is|as a|as an)\b/i.test(original);
  if (analysis.characteristics.hasContextDump || hasRoleMarkers) {
    const reusable = Math.round(originalTokens * 0.4);
    const estimatedSavings = Math.round(reusable * 0.9);
    const { totalCost } = calculateCost(estimatedSavings, 0, model);
    suggestions.push({
      type: 'system-prompt-extraction',
      title: 'Move stable instructions to a cached system prompt',
      description:
        'This prompt contains role or context instructions that are likely identical across many calls. Moving them to a system prompt and enabling caching reduces input cost to ~10% on every repeat. ' +
        'How: separate "You are X, your role is Y" into the system message; keep only the per-call variable content in the user message.',
      estimatedTokenSavings: estimatedSavings,
      estimatedCostSavings: totalCost,
      confidence: 0.65,
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
      const savingsPct = current > 0 ? Math.round((costSavings / current) * 100) : 0;
      suggestions.push({
        type: 'use-cheaper-model',
        title: `Route to ${cheaper.model} — ${savingsPct}% cheaper per call`,
        description:
          `Complexity is ${analysis.complexity} — ${cheaper.model} handles this category reliably at a fraction of the cost. ` +
          `How to implement: update the \`model\` parameter in your API call from "${model}" to "${cheaper.model}". ` +
          `Validate quality on a representative sample of your real outputs before rolling out to 100%.`,
        estimatedTokenSavings: 0,
        estimatedCostSavings: costSavings,
        confidence: 0.6,
      });
    }
  }

  // 8. cap-output
  // Fix: previously hardcoded 300 words for ALL prompts over 1,500 output tokens.
  // 300 words is ~390 tokens — fine for a quick factual answer but would truncate
  // a code review, detailed analysis, or multi-part response mid-way. Now:
  //   - Target = 50% of estimated/actual output, clamped 150–800 words
  //   - This preserves enough room for the task while still meaningfully cutting bloat
  //   - The appended instruction names the unit that works best for the prompt type
  if (
    effectiveOutputTokens > 1500 &&
    analysis.complexity !== 'multidimensional'
  ) {
    // tokens × 0.75 ≈ words (conservative). Target 50% reduction, clamp to 150–800.
    const currentWords = Math.round(effectiveOutputTokens * 0.75);
    const targetWords = Math.max(150, Math.min(800, Math.round(currentWords * 0.5)));
    const cappedTokens = Math.round(targetWords / 0.75);
    const estimatedSavings = Math.max(0, effectiveOutputTokens - cappedTokens);
    const { totalCost } = calculateCost(0, estimatedSavings, model);
    const sourceWord = actualOutputTokens !== undefined ? 'Actual' : 'Estimated';
    // For code-category prompts, lines is more meaningful than words
    const unit = analysis.category === 'code' ? 'lines of code' : 'words';
    const constraint = analysis.category === 'code'
      ? `Limit your response to ${targetWords} lines of code. Include no explanation unless asked.`
      : `Respond in at most ${targetWords} words. Be direct — no preamble or summary.`;
    suggestions.push({
      type: 'cap-output',
      title: `Cap response length (~${targetWords} ${unit})`,
      description:
        `${sourceWord} output is ~${effectiveOutputTokens} tokens (~${currentWords} ${unit}). ` +
        `Adding a length constraint halves output cost while keeping the response complete. ` +
        `Adjust the cap upward if your task genuinely needs a longer answer.`,
      after: `…\n\n${constraint}`,
      estimatedTokenSavings: estimatedSavings,
      estimatedCostSavings: totalCost,
      confidence: 0.8,
    });
  }

  const optimizedTokens = countTokens(working, model);
  const savedTokens = Math.max(0, originalTokens - optimizedTokens);
  const savedPercent =
    originalTokens > 0 ? Math.round((savedTokens / originalTokens) * 1000) / 10 : 0;

  // Audit C6: previously this summed savings across ALL suggestions, but the
  // advisory strategies (split, system-prompt-extraction, use-cheaper-model,
  // cap-output, few-shot-reduction, restructure) overlap — they cannot be
  // stacked. Adding them inflated headline savings 2-3x. The defensible
  // headline is:
  //   - auto-applied strategies (remove-redundancy, compression): sum
  //   - + the single highest-saving advisory (representative, not stackable)
  // Strategies beyond the highest advisory remain as suggestions but their
  // dollars are NOT added to the headline (otherwise we'd be promising
  // savings the user cannot realise without contradicting other suggestions).
  const APPLIED_TYPES = new Set(['remove-redundancy', 'compression']);
  const applied = suggestions.filter((s) => APPLIED_TYPES.has(s.type));
  const advisory = suggestions.filter((s) => !APPLIED_TYPES.has(s.type));
  const appliedSum = applied.reduce((sum, s) => sum + s.estimatedCostSavings, 0);
  const topAdvisory = advisory.reduce(
    (max, s) => (s.estimatedCostSavings > max ? s.estimatedCostSavings : max),
    0,
  );
  // Cap at the cost of the original call — savings can never exceed the bill.
  const originalCost = calculateCost(originalTokens, effectiveOutputTokens, model).totalCost;
  const estimatedCostSavings = Math.min(originalCost * 0.95, appliedSum + topAdvisory);

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
