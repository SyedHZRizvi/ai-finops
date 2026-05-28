import { analyzePrompt } from './categorizer';
import { calculateCost } from './pricing';
import { PROVIDER_STYLES, getRecommendedModel } from './providerStyles';
import { countTokens, estimateOutputTokens } from './tokenizer';
import type {
  AudienceLevel,
  Complexity,
  OutcomeFormat,
  OutputLength,
  StudioRequest,
  StudioResult,
  StudioVariant,
  TargetProvider,
  Tone,
  VariantStyle,
} from './types';

// --- Clause helpers -----------------------------------------------------

const FORMAT_INSTRUCTIONS: Record<OutcomeFormat, string> = {
  'free-text': 'Respond as natural prose.',
  'bullet-list': 'Respond as a markdown bullet list.',
  'numbered-list': 'Respond as a numbered list.',
  'table': 'Respond as a markdown table with clearly labelled columns.',
  'code': 'Return only code, no commentary.',
  'json': 'Return only valid JSON. Do not include any text outside the JSON object.',
  'markdown': 'Respond in well-structured markdown with headings.',
  'essay': 'Respond as a cohesive multi-paragraph essay.',
  'summary': 'Respond as a tight summary.',
  'qa-pairs': 'Respond as Q&A pairs, one question and one answer per item.',
  'step-by-step': 'Respond as a numbered step-by-step walkthrough.',
};

const LENGTH_INSTRUCTIONS: Record<OutputLength, string> = {
  brief: 'Respond in at most 150 words.',
  medium: 'Respond in 250-500 words.',
  long: 'Be thorough. There is no length cap, but every sentence must add value.',
};

const AUDIENCE_INSTRUCTIONS: Record<AudienceLevel, string> = {
  beginner: 'Explain any technical terms you use.',
  general: '',
  expert: 'Skip introductory explanation; assume domain knowledge.',
  executive: 'Lead with a one-sentence summary, then supporting detail.',
};

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  neutral: '',
  formal: 'Use a formal register. No contractions.',
  casual: 'Use a conversational tone. Contractions are fine.',
  technical: 'Use precise technical terminology.',
  persuasive: 'Be action-oriented and persuasive.',
};

function formatClause(format: OutcomeFormat | undefined): string {
  if (!format) return '';
  return FORMAT_INSTRUCTIONS[format] ?? '';
}

function lengthClause(length: OutputLength | undefined): string {
  if (!length) return '';
  return LENGTH_INSTRUCTIONS[length] ?? '';
}

function audienceClause(audience: AudienceLevel | undefined): string {
  if (!audience) return '';
  return AUDIENCE_INSTRUCTIONS[audience] ?? '';
}

function toneClause(tone: Tone | undefined): string {
  if (!tone || tone === 'neutral') return '';
  return TONE_INSTRUCTIONS[tone] ?? '';
}

function joinNonEmpty(parts: string[], sep = '\n'): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(sep);
}

function bulletList(items: string[]): string {
  return items.map((i) => `- ${i.trim()}`).filter((l) => l.length > 2).join('\n');
}

// Provider-specific section formatting. Keeps the same logical layout
// while emitting whichever syntax the model prefers.
function sectionBlock(
  provider: TargetProvider,
  label: string,
  body: string,
): string {
  if (!body.trim()) return '';
  const style = PROVIDER_STYLES[provider];
  if (style.preferences.likesXmlTags) {
    const tag = label.toLowerCase().replace(/\s+/g, '-');
    return `<${tag}>\n${body.trim()}\n</${tag}>`;
  }
  if (style.preferences.likesMarkdownHeaders) {
    return `## ${label}\n${body.trim()}`;
  }
  if (style.preferences.likesStructuredFormat) {
    return `${label.toUpperCase()}:\n${body.trim()}`;
  }
  return `${label}: ${body.trim()}`;
}

// --- Variant assembly ---------------------------------------------------

interface VariantContext {
  req: StudioRequest;
  provider: TargetProvider;
  role: string;
  task: string;
  formatHint: string;
  lengthHint: string;
  audienceHint: string;
  toneHint: string;
  mustIncludeList: string[];
  mustAvoidList: string[];
  examples: { input: string; output: string }[];
  // Audit H8: pass detected complexity through so per-variant model selection
  // matches the analysis (was hard-coded to 'moderate', overstating cost 4-17x
  // for simple prompts on cheaper sibling models).
  complexity: Complexity;
}

function buildTerse(ctx: VariantContext): StudioVariant {
  const style = PROVIDER_STYLES[ctx.provider];
  const formatTail = ctx.formatHint || (ctx.req.outputFormat ? '' : '');
  // Terse = one-liner. Squash everything into a single imperative sentence.
  const constraints: string[] = [];
  if (ctx.formatHint) constraints.push(ctx.formatHint);
  if (ctx.lengthHint) constraints.push(ctx.lengthHint);
  const constraintTail = constraints.length ? ` ${constraints.join(' ')}` : '';

  let prompt: string;
  if (ctx.provider === 'copilot') {
    // Copilot inline-comment framing
    prompt = `// Task: ${ctx.task}${constraintTail ? `\n// Constraints:${constraintTail}` : ''}`;
  } else if (ctx.provider === 'perplexity') {
    prompt = `${ctx.task}${constraintTail} Cite primary sources in your answer.`;
  } else {
    prompt = `${ctx.task}${constraintTail}`;
  }

  return finalizeVariant(
    ctx,
    'terse',
    prompt,
    undefined,
    `Single-line imperative tuned for ${style.label}. Strips role and context — best when the model already has surrounding context.`,
  );
}

function buildStandard(ctx: VariantContext): StudioVariant {
  const style = PROVIDER_STYLES[ctx.provider];

  const constraintLines: string[] = [];
  if (ctx.formatHint) constraintLines.push(ctx.formatHint);
  if (ctx.lengthHint) constraintLines.push(ctx.lengthHint);
  if (ctx.audienceHint) constraintLines.push(ctx.audienceHint);
  if (ctx.toneHint) constraintLines.push(ctx.toneHint);
  if (ctx.mustIncludeList.length) {
    constraintLines.push(`Must address: ${ctx.mustIncludeList.join(', ')}.`);
  }
  if (ctx.mustAvoidList.length) {
    constraintLines.push(`Avoid: ${ctx.mustAvoidList.join(', ')}.`);
  }

  if (ctx.provider === 'copilot') {
    // Copilot: code-comment framing, no role, no sections
    const commentLines = [
      `// Task: ${ctx.task}`,
      ...constraintLines.map((c) => `// - ${c}`),
    ];
    return finalizeVariant(
      ctx,
      'standard',
      commentLines.join('\n'),
      undefined,
      `Code-comment framing matches Copilot's completion model — it treats this as a header for the code it generates.`,
    );
  }

  const parts: string[] = [];
  if (ctx.role && ctx.provider !== 'perplexity') {
    parts.push(ctx.role);
  }
  parts.push(sectionBlock(ctx.provider, 'Task', ctx.task));
  if (constraintLines.length) {
    parts.push(sectionBlock(ctx.provider, 'Constraints', constraintLines.join('\n')));
  }
  let prompt = joinNonEmpty(parts, '\n\n');

  if (style.preferences.likesCitations) {
    prompt += '\n\nCite primary sources in your answer.';
  }

  return finalizeVariant(
    ctx,
    'standard',
    prompt,
    undefined,
    `Standard layout: role + task + constraints, formatted with ${describeFormatting(style)}.`,
  );
}

function buildDetailed(ctx: VariantContext): StudioVariant {
  const style = PROVIDER_STYLES[ctx.provider];

  const constraintLines: string[] = [];
  if (ctx.formatHint) constraintLines.push(ctx.formatHint);
  if (ctx.lengthHint) constraintLines.push(ctx.lengthHint);
  if (ctx.audienceHint) constraintLines.push(ctx.audienceHint);
  if (ctx.toneHint) constraintLines.push(ctx.toneHint);
  if (ctx.mustIncludeList.length) {
    constraintLines.push(`Must address: ${ctx.mustIncludeList.join(', ')}.`);
  }
  if (ctx.mustAvoidList.length) {
    constraintLines.push(`Avoid: ${ctx.mustAvoidList.join(', ')}.`);
  }

  const successCriteria = buildSuccessCriteria(ctx);

  if (ctx.provider === 'copilot') {
    const lines: string[] = [];
    lines.push(`// Task: ${ctx.task}`);
    if (ctx.req.problem.trim() && ctx.req.problem.trim() !== ctx.task) {
      lines.push(`// Context:`);
      for (const ln of ctx.req.problem.trim().split(/\n+/)) {
        lines.push(`//   ${ln}`);
      }
    }
    for (const c of constraintLines) lines.push(`// - ${c}`);
    if (successCriteria.length) {
      lines.push('// Success criteria:');
      for (const s of successCriteria) lines.push(`//   * ${s}`);
    }
    return finalizeVariant(
      ctx,
      'detailed',
      lines.join('\n'),
      undefined,
      `Extended code-comment with context and success criteria — gives Copilot enough to one-shot complex completions.`,
    );
  }

  const parts: string[] = [];
  if (ctx.role && ctx.provider !== 'perplexity') {
    parts.push(ctx.role);
  }

  // Context section if the user gave a problem distinct from a one-line task
  if (ctx.req.problem.trim() && ctx.req.problem.trim() !== ctx.task) {
    parts.push(sectionBlock(ctx.provider, 'Context', ctx.req.problem.trim()));
  }

  parts.push(sectionBlock(ctx.provider, 'Task', ctx.task));

  if (constraintLines.length) {
    parts.push(sectionBlock(ctx.provider, 'Constraints', constraintLines.join('\n')));
  }

  if (successCriteria.length) {
    parts.push(
      sectionBlock(ctx.provider, 'Success Criteria', bulletList(successCriteria)),
    );
  }

  if (ctx.examples.length && style.preferences.likesFewShot) {
    const formatted = ctx.examples
      .map(
        (ex, i) => `Example ${i + 1}:\nInput: ${ex.input.trim()}\nOutput: ${ex.output.trim()}`,
      )
      .join('\n\n');
    parts.push(sectionBlock(ctx.provider, 'Examples', formatted));
  }

  let prompt = joinNonEmpty(parts, '\n\n');

  if (style.preferences.likesCitations) {
    prompt += '\n\nCite primary sources and link to them inline.';
  }

  return finalizeVariant(
    ctx,
    'detailed',
    prompt,
    undefined,
    `Full layout with context, success criteria${ctx.examples.length && style.preferences.likesFewShot ? ', and few-shot examples' : ''}. Best when output quality matters more than token cost.`,
  );
}

function buildSystemAndUser(ctx: VariantContext): StudioVariant {
  // Role + style + persistent constraints live in system; the actionable task in user.
  const systemParts: string[] = [];
  if (ctx.role) systemParts.push(ctx.role);

  const sysConstraints: string[] = [];
  if (ctx.toneHint) sysConstraints.push(ctx.toneHint);
  if (ctx.audienceHint) sysConstraints.push(ctx.audienceHint);
  if (ctx.mustAvoidList.length) {
    sysConstraints.push(`Never include: ${ctx.mustAvoidList.join(', ')}.`);
  }
  if (sysConstraints.length) {
    systemParts.push(sysConstraints.join(' '));
  }

  const userConstraints: string[] = [];
  if (ctx.formatHint) userConstraints.push(ctx.formatHint);
  if (ctx.lengthHint) userConstraints.push(ctx.lengthHint);
  if (ctx.mustIncludeList.length) {
    userConstraints.push(`Must address: ${ctx.mustIncludeList.join(', ')}.`);
  }

  const userParts: string[] = [];
  if (ctx.req.problem.trim() && ctx.req.problem.trim() !== ctx.task) {
    userParts.push(sectionBlock(ctx.provider, 'Context', ctx.req.problem.trim()));
  }
  userParts.push(sectionBlock(ctx.provider, 'Task', ctx.task));
  if (userConstraints.length) {
    userParts.push(sectionBlock(ctx.provider, 'Constraints', userConstraints.join('\n')));
  }

  const userPrompt = joinNonEmpty(userParts, '\n\n');
  const systemPrompt = systemParts.join(' ').trim();

  return finalizeVariant(
    ctx,
    'system-and-user',
    userPrompt,
    systemPrompt || undefined,
    `Split into system (persona/style/avoid) and user (task/format/include) — reusable across many user turns without reprompting the role each time.`,
  );
}

function describeFormatting(style: { preferences: { likesXmlTags: boolean; likesMarkdownHeaders: boolean; likesStructuredFormat: boolean } }): string {
  if (style.preferences.likesXmlTags) return 'XML-tagged sections';
  if (style.preferences.likesMarkdownHeaders) return 'markdown ## headers';
  if (style.preferences.likesStructuredFormat) return 'short LABEL: sections';
  return 'plain prose';
}

function buildSuccessCriteria(ctx: VariantContext): string[] {
  const out: string[] = [];
  if (ctx.req.desiredOutcome.trim()) {
    out.push(`Output matches the desired outcome: ${ctx.req.desiredOutcome.trim()}`);
  }
  if (ctx.req.outputFormat && ctx.req.outputFormat !== 'free-text') {
    out.push(`Output strictly follows the ${ctx.req.outputFormat} format.`);
  }
  if (ctx.mustIncludeList.length) {
    out.push(`Covers all required points: ${ctx.mustIncludeList.join(', ')}.`);
  }
  if (ctx.req.audience === 'executive') {
    out.push('Opens with a one-sentence executive summary.');
  }
  return out;
}

function finalizeVariant(
  ctx: VariantContext,
  style: VariantStyle,
  prompt: string,
  systemPrompt: string | undefined,
  rationale: string,
): StudioVariant {
  const model = getRecommendedModel(ctx.provider, ctx.complexity);
  // Token + output estimates are based on the combined prompt that will hit the model.
  const fullText = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const tokenCount = countTokens(fullText, model);
  const estOut = estimateOutputTokens(fullText, model);
  const { totalCost } = calculateCost(tokenCount, estOut, model);

  const variant: StudioVariant = {
    style,
    prompt,
    tokenCount,
    estimatedOutputTokens: estOut,
    estimatedCost: totalCost,
    rationale,
  };
  if (systemPrompt) variant.systemPrompt = systemPrompt;
  return variant;
}

// --- Split prompts (multidimensional handling) --------------------------

function buildSplitPrompts(ctx: VariantContext, dimensions: string[]): string[] {
  const out: string[] = [];
  for (const dim of dimensions) {
    const cleaned = dim.replace(/\?+$/, '').trim();
    if (!cleaned) continue;
    const constraints: string[] = [];
    if (ctx.formatHint) constraints.push(ctx.formatHint);
    if (ctx.lengthHint) constraints.push(ctx.lengthHint);
    const tail = constraints.length ? ` ${constraints.join(' ')}` : '';
    if (ctx.provider === 'copilot') {
      out.push(`// Task: ${cleaned}${tail ? `\n// Constraints:${tail}` : ''}`);
    } else if (ctx.provider === 'perplexity') {
      out.push(`${cleaned}${tail} Cite primary sources.`);
    } else {
      out.push(`${cleaned}${tail}`);
    }
  }
  return out;
}

// --- Main entry ---------------------------------------------------------

export function buildPrompt(req: StudioRequest): StudioResult {
  if (!req.problem || !req.problem.trim()) {
    throw new Error('problem is required');
  }

  const desiredOutcome = req.desiredOutcome?.trim() || 'A clear, well-structured answer.';
  const normalizedReq: StudioRequest = { ...req, desiredOutcome };

  const provider: TargetProvider = req.targetProvider ?? 'generic';
  const style = PROVIDER_STYLES[provider] ?? PROVIDER_STYLES.generic;

  const analysis = analyzePrompt(req.problem);
  const recommendedModel = getRecommendedModel(provider, analysis.complexity);

  // Build a single "task" string from the desired outcome — the imperative the model acts on.
  const task = synthesizeTask(req.problem, desiredOutcome);
  const role = req.starterPrompt?.trim() || style.defaultRole;

  const mustIncludeList = (req.mustInclude ?? []).map((s) => s.trim()).filter(Boolean);
  const mustAvoidList = (req.mustAvoid ?? []).map((s) => s.trim()).filter(Boolean);
  const examples = (req.examples ?? []).filter((e) => e?.input?.trim() && e?.output?.trim());

  const ctx: VariantContext = {
    req: normalizedReq,
    provider,
    role,
    task,
    formatHint: formatClause(req.outputFormat),
    lengthHint: lengthClause(req.outputLength),
    audienceHint: audienceClause(req.audience),
    toneHint: toneClause(req.tone),
    mustIncludeList,
    mustAvoidList,
    examples,
    complexity: analysis.complexity,
  };

  const variants: StudioVariant[] = [
    buildTerse(ctx),
    buildStandard(ctx),
    buildDetailed(ctx),
  ];
  if (style.preferences.systemPromptSupported) {
    variants.push(buildSystemAndUser(ctx));
  }

  // Cursor-specific touch: surface @file references when mustInclude looks like a path.
  if (provider === 'cursor' && mustIncludeList.some(looksLikePath)) {
    for (const v of variants) {
      const refs = mustIncludeList.filter(looksLikePath).map((p) => `@${p}`).join(' ');
      if (refs && !v.prompt.includes('@')) {
        v.prompt = `${v.prompt}\n\nRelevant files: ${refs}`;
      }
    }
  }

  // Split prompts only for genuinely multidimensional problems.
  let splitPrompts: string[] | undefined;
  if (analysis.complexity === 'multidimensional' && analysis.dimensions.length >= 3) {
    splitPrompts = buildSplitPrompts(ctx, analysis.dimensions);
  }

  const warnings = buildWarnings(req, analysis.dimensions.length);
  const tips = buildTips(provider, analysis.complexity, splitPrompts !== undefined);

  return {
    detectedComplexity: analysis.complexity,
    detectedCategory: analysis.category,
    detectedDimensions: analysis.dimensions,
    targetProvider: provider,
    recommendedModel,
    variants,
    splitPrompts,
    warnings,
    tips,
  };
}

// Heuristic: lift the most-imperative sentence from the problem, or fall back
// to combining it with desiredOutcome. The result is one focused directive.
function synthesizeTask(problem: string, desiredOutcome: string): string {
  const trimmed = problem.trim();
  // Single-sentence problem? Use it as the task verbatim.
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length === 1) {
    return `${trimmed}\nDesired outcome: ${desiredOutcome}`;
  }
  // Multi-sentence: surface the first imperative sentence as the directive,
  // and let the rest live in Context. If no imperative found, just use the first sentence.
  const imperativeRe = /^(write|explain|list|create|build|implement|analyze|compare|summari[sz]e|translate|review|generate|draft|compose|design|refactor|debug|fix|optimi[sz]e|describe|outline|evaluate|assess|rewrite|convert|extract|identify|find|propose|recommend)\b/i;
  const lead = sentences.find((s) => imperativeRe.test(s.trim())) ?? sentences[0];
  return `${lead?.trim() ?? trimmed}\nDesired outcome: ${desiredOutcome}`;
}

function looksLikePath(s: string): boolean {
  return /[\\/.]/.test(s) && /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|css|html|json|md|yml|yaml|sql)$/i.test(s.trim());
}

function buildWarnings(req: StudioRequest, dimensionCount: number): string[] {
  const w: string[] = [];
  const outcome = req.desiredOutcome?.trim() ?? '';
  if (!outcome || outcome.length < 20) {
    w.push('desiredOutcome was vague — consider being more specific about format/length.');
  }
  if (!req.mustInclude || req.mustInclude.length === 0) {
    w.push('No mustInclude provided — output may drift from your intent.');
  }
  if (!req.audience) {
    w.push('Audience not set — defaulting to general.');
  }
  if (!req.outputFormat) {
    w.push('Output format not set — model will pick its own structure.');
  }
  if (dimensionCount >= 3) {
    w.push('Problem looks multidimensional — consider running splitPrompts as separate calls for crisper answers.');
  }
  return w;
}

function buildTips(provider: TargetProvider, complexity: string, hasSplit: boolean): string[] {
  const style = PROVIDER_STYLES[provider];
  const tips = [...style.tips];
  if (hasSplit) {
    tips.push('Detected as multidimensional — splitPrompts breaks the ask into focused sub-prompts. Run them in parallel for better answers per dimension.');
  } else if (complexity === 'complex') {
    tips.push('Complex prompt — the detailed variant gives the model room to think; consider it over the terse one.');
  } else if (complexity === 'simple') {
    tips.push('Simple ask — the terse variant is the cheapest option without quality loss.');
  }
  return tips;
}
