'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PromptTemplate } from '@/lib/templates';
import { CATEGORY_CHIP, TARGET_CHIP } from './TemplateCard';

const TARGET_LABEL: Record<PromptTemplate['target'], string> = {
  claude: 'Claude',
  gpt: 'GPT',
  gemini: 'Gemini',
  any: 'Any model',
};

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

export function TemplateDetailModal({
  template,
  onClose,
}: {
  template: PromptTemplate;
  onClose: () => void;
}) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedExample, setCopiedExample] = useState(false);

  // Close on ESC + lock background scroll while open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function copyText(text: string, setter: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed top-0 right-0 h-screen w-full max-w-3xl bg-panel border-l border-borderBright z-40 overflow-y-auto shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Template detail: ${template.name}`}
      >
        <div className="sticky top-0 bg-panel/95 backdrop-blur-xl border-b border-border px-6 py-4 flex items-center justify-between gap-3 z-10">
          <div className="min-w-0">
            <div className="text-base font-bold tracking-tight truncate">{template.name}</div>
            <div className="text-xs text-muted mt-0.5 line-clamp-1">{template.description}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/studio?templateId=${encodeURIComponent(template.id)}`}
              className="btn-primary text-xs py-1.5 px-3"
            >
              Use in Studio <span aria-hidden>→</span>
            </Link>
            <button onClick={onClose} className="btn" aria-label="Close">
              Close <span aria-hidden>×</span>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip capitalize ${CATEGORY_CHIP[template.category]}`}>
              {template.category}
            </span>
            <span className={`chip ${TARGET_CHIP[template.target]}`}>
              {TARGET_LABEL[template.target]}
            </span>
            <span className="chip tabular-nums">
              ~{formatNum(template.estimatedTokens)} tok est.
            </span>
            {template.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-muted bg-panel2 border border-border px-2 py-0.5 rounded-md"
              >
                {tag}
              </span>
            ))}
          </div>

          <section>
            <div className="label mb-2">When to use</div>
            <p className="text-sm text-inkDim leading-relaxed">{template.useCase}</p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="label">Prompt template</div>
              <button
                onClick={() => copyText(template.prompt, setCopiedPrompt)}
                className="btn text-xs"
              >
                {copiedPrompt ? 'Copied' : 'Copy prompt'}
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-panel2 border border-border rounded-xl p-4 max-h-96 overflow-auto">
              {template.prompt}
            </pre>
          </section>

          {template.placeholders.length > 0 && (
            <section>
              <div className="label mb-3">
                Placeholders ({template.placeholders.length})
              </div>
              <div className="space-y-3">
                {template.placeholders.map((p) => (
                  <div
                    key={p.name}
                    className="bg-panel2 border border-border rounded-xl p-3 space-y-1"
                  >
                    <div className="flex items-baseline gap-2">
                      <code className="text-xs font-mono text-brandLight bg-brand/10 border border-brand/20 px-1.5 py-0.5 rounded">
                        {'{{' + p.name + '}}'}
                      </code>
                      <span className="text-xs text-inkDim">{p.description}</span>
                    </div>
                    <div className="text-[11px] text-muted pl-1">
                      <span className="font-semibold">Example:</span>{' '}
                      <span className="font-mono">{p.example}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {template.example && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="label">Example filled prompt</div>
                <button
                  onClick={() => copyText(template.example!.filled, setCopiedExample)}
                  className="btn text-xs"
                >
                  {copiedExample ? 'Copied' : 'Copy example'}
                </button>
              </div>
              <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-panel2 border border-border rounded-xl p-4 max-h-64 overflow-auto">
                {template.example.filled}
              </pre>
              <div className="label mt-4 mb-2">Expected output</div>
              <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-panel2 border border-good/30 rounded-xl p-4 max-h-64 overflow-auto">
                {template.example.expectedOutput}
              </pre>
            </section>
          )}

          <section className="pt-2 border-t border-border">
            <Link
              href={`/studio?templateId=${encodeURIComponent(template.id)}`}
              className="btn-primary w-full justify-center"
            >
              Open in Studio to customize <span aria-hidden>→</span>
            </Link>
          </section>
        </div>
      </aside>
    </>
  );
}
