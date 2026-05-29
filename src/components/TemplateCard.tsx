'use client';
import Link from 'next/link';
import type { PromptTemplate, TemplateCategory, TemplateTarget } from '@/lib/templates';

/**
 * Visual mapping: each category gets a chip color per the project's design system.
 * brand2 doesn't have a global chip-* class, so we apply inline border/bg/text utility classes.
 */
export const CATEGORY_CHIP: Record<TemplateCategory, string> = {
  rag: 'chip-brand',
  classification: 'chip-blue',
  summarization: 'chip-teal',
  extraction: 'chip-amber',
  generation: 'chip-pink',
  analysis: 'chip-indigo',
  code: 'chip-lime',
  translation: 'chip-rose',
  conversation: 'border-brand2/40 bg-brand2/10 text-brand2Light',
  planning: 'chip-warn',
  creative: 'chip-good',
};

export const TARGET_CHIP: Record<TemplateTarget, string> = {
  claude: 'chip-amber',
  gpt: 'chip-good',
  gemini: 'chip-blue',
  any: 'chip-brand',
};

const TARGET_LABEL: Record<TemplateTarget, string> = {
  claude: 'Claude',
  gpt: 'GPT',
  gemini: 'Gemini',
  any: 'Any model',
};

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

export function TemplateCard({
  template,
  onOpen,
}: {
  template: PromptTemplate;
  onOpen: (id: string) => void;
}) {
  return (
    <article
      className="card card-pad card-grad card-interactive flex flex-col gap-3 fade-up"
      onClick={() => onOpen(template.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-ink">{template.name}</h3>
        <span
          className="chip whitespace-nowrap text-[10px] tabular-nums shrink-0"
          aria-label={`${formatNum(template.estimatedTokens)} tokens estimated`}
        >
          ~{formatNum(template.estimatedTokens)} tok
        </span>
      </div>

      <p className="text-xs text-inkDim leading-relaxed line-clamp-3">{template.description}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`chip capitalize ${CATEGORY_CHIP[template.category]}`}>
          {template.category}
        </span>
        <span className={`chip ${TARGET_CHIP[template.target]}`}>
          {TARGET_LABEL[template.target]}
        </span>
      </div>

      {template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-auto">
          {template.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="text-[10px] text-muted bg-panel2 px-1.5 py-0.5 rounded-md">
              {tag}
            </span>
          ))}
          {template.tags.length > 4 && (
            <span className="text-[10px] text-muted px-1.5 py-0.5">
              +{template.tags.length - 4}
            </span>
          )}
        </div>
      )}

      <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(template.id);
          }}
          className="btn-ghost text-xs"
        >
          Preview <span aria-hidden>→</span>
        </button>
        <Link
          href={`/studio?templateId=${encodeURIComponent(template.id)}`}
          onClick={(e) => e.stopPropagation()}
          className="btn-primary text-xs py-1.5 px-3"
        >
          Use in Studio <span aria-hidden>→</span>
        </Link>
      </div>
    </article>
  );
}
