import type { Complexity, TargetProvider } from './types';

export interface ProviderStyle {
  label: string;
  defaultModel: string;
  modelByComplexity: Record<Complexity, string>;
  preferences: {
    likesXmlTags: boolean;
    likesMarkdownHeaders: boolean;
    likesStructuredFormat: boolean;
    likesCitations: boolean;
    codeFocused: boolean;
    needsExplicitFormat: boolean;
    systemPromptSupported: boolean;
    likesFewShot: boolean;
  };
  defaultRole: string;
  tips: string[];
  delimiters: { open: string; close: string };
}

export const PROVIDER_STYLES: Record<TargetProvider, ProviderStyle> = {
  claude: {
    label: 'Claude (Anthropic)',
    defaultModel: 'claude-sonnet-4',
    modelByComplexity: {
      simple: 'claude-haiku-4',
      moderate: 'claude-sonnet-4',
      complex: 'claude-sonnet-4',
      multidimensional: 'claude-sonnet-4',
    },
    preferences: {
      likesXmlTags: true,
      likesMarkdownHeaders: false,
      likesStructuredFormat: true,
      likesCitations: false,
      codeFocused: false,
      needsExplicitFormat: true,
      systemPromptSupported: true,
      likesFewShot: true,
    },
    defaultRole: 'You are a careful, expert assistant.',
    tips: [
      'Wrap reference material in <context> tags so Claude treats it as data, not instructions.',
      'Use a distinct <task> section to separate the directive from the surrounding context.',
      'Few-shot examples improve format adherence — include them when format matters.',
    ],
    delimiters: { open: '<context>', close: '</context>' },
  },
  gpt: {
    label: 'GPT (OpenAI)',
    defaultModel: 'gpt-4o',
    modelByComplexity: {
      simple: 'gpt-4o-mini',
      moderate: 'gpt-4o',
      complex: 'gpt-4o',
      multidimensional: 'gpt-4o',
    },
    preferences: {
      likesXmlTags: false,
      likesMarkdownHeaders: true,
      likesStructuredFormat: true,
      likesCitations: false,
      codeFocused: false,
      needsExplicitFormat: true,
      systemPromptSupported: true,
      likesFewShot: true,
    },
    defaultRole: 'You are a precise, helpful assistant.',
    tips: [
      'Use ## section headers — GPT models follow markdown structure well.',
      'Specify output format explicitly (JSON schema, bullet shape, length).',
      'Put persistent instructions in the system message, the specific ask in the user message.',
    ],
    delimiters: { open: '```', close: '```' },
  },
  gemini: {
    label: 'Gemini (Google)',
    defaultModel: 'gemini-1.5-flash',
    modelByComplexity: {
      simple: 'gemini-1.5-flash',
      moderate: 'gemini-1.5-flash',
      complex: 'gemini-1.5-pro',
      multidimensional: 'gemini-1.5-pro',
    },
    preferences: {
      likesXmlTags: false,
      likesMarkdownHeaders: false,
      likesStructuredFormat: true,
      likesCitations: false,
      codeFocused: false,
      needsExplicitFormat: true,
      systemPromptSupported: true,
      likesFewShot: false,
    },
    defaultRole: 'You are a concise, accurate assistant.',
    tips: [
      'Keep instructions concise — Gemini responds best to compact prompts.',
      'Specify output format up front, before any context.',
      'Avoid heavy XML or markdown — short labelled sections work better.',
    ],
    delimiters: { open: '---', close: '---' },
  },
  copilot: {
    label: 'GitHub Copilot',
    defaultModel: 'gpt-4o-mini',
    modelByComplexity: {
      simple: 'gpt-4o-mini',
      moderate: 'gpt-4o-mini',
      complex: 'gpt-4o',
      multidimensional: 'gpt-4o',
    },
    preferences: {
      likesXmlTags: false,
      likesMarkdownHeaders: false,
      likesStructuredFormat: false,
      likesCitations: false,
      codeFocused: true,
      needsExplicitFormat: false,
      systemPromptSupported: false,
      likesFewShot: false,
    },
    defaultRole: '',
    tips: [
      'Phrase the ask as a code comment Copilot can complete from.',
      'Reference file paths explicitly when context lives in another file.',
      'Keep prompts terse — Copilot infers a lot from surrounding code.',
    ],
    delimiters: { open: '//', close: '' },
  },
  cursor: {
    label: 'Cursor IDE',
    defaultModel: 'claude-sonnet-4',
    modelByComplexity: {
      simple: 'claude-haiku-4',
      moderate: 'claude-sonnet-4',
      complex: 'claude-sonnet-4',
      multidimensional: 'claude-sonnet-4',
    },
    preferences: {
      likesXmlTags: false,
      likesMarkdownHeaders: true,
      likesStructuredFormat: true,
      likesCitations: false,
      codeFocused: true,
      needsExplicitFormat: true,
      systemPromptSupported: true,
      likesFewShot: false,
    },
    defaultRole: 'You are an expert pair-programmer working inside an IDE.',
    tips: [
      'Reference @file or @folder so Cursor can pull the right context.',
      'State the codebase area (frontend, API, schema) so the agent scopes its edits.',
      'Ask for diffs or specific file paths — avoid open-ended refactors.',
    ],
    delimiters: { open: '```', close: '```' },
  },
  perplexity: {
    label: 'Perplexity',
    defaultModel: 'gpt-4o',
    modelByComplexity: {
      simple: 'gpt-4o-mini',
      moderate: 'gpt-4o',
      complex: 'gpt-4o',
      multidimensional: 'gpt-4o',
    },
    preferences: {
      likesXmlTags: false,
      likesMarkdownHeaders: true,
      likesStructuredFormat: true,
      likesCitations: true,
      codeFocused: false,
      needsExplicitFormat: true,
      systemPromptSupported: false,
      likesFewShot: false,
    },
    defaultRole: '',
    tips: [
      'Ask for primary sources and citations explicitly.',
      'Frame the prompt as a research question, not a task.',
      'Constrain the time range or source type if recency matters.',
    ],
    delimiters: { open: '---', close: '---' },
  },
  generic: {
    label: 'Generic (provider-agnostic)',
    defaultModel: 'gpt-4o-mini',
    modelByComplexity: {
      simple: 'gpt-4o-mini',
      moderate: 'gpt-4o-mini',
      complex: 'gpt-4o',
      multidimensional: 'gpt-4o',
    },
    preferences: {
      likesXmlTags: false,
      likesMarkdownHeaders: true,
      likesStructuredFormat: true,
      likesCitations: false,
      codeFocused: false,
      needsExplicitFormat: true,
      systemPromptSupported: true,
      likesFewShot: true,
    },
    defaultRole: 'You are a helpful assistant.',
    tips: [
      'Use plain prose with clear section labels — portable across providers.',
      'Avoid provider-specific syntax (XML tags, function-call hints).',
      'State the output format explicitly so the prompt travels well.',
    ],
    delimiters: { open: '---', close: '---' },
  },
};

export function getRecommendedModel(provider: TargetProvider, complexity: Complexity): string {
  const style = PROVIDER_STYLES[provider] ?? PROVIDER_STYLES.generic;
  return style.modelByComplexity[complexity] ?? style.defaultModel;
}
