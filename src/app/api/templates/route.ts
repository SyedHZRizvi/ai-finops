import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TEMPLATES, type PromptTemplate } from '@/lib/templates';

export const dynamic = 'force-dynamic';

const CategorySchema = z.enum([
  'rag',
  'classification',
  'summarization',
  'extraction',
  'generation',
  'analysis',
  'code',
  'translation',
  'conversation',
  'planning',
  'creative',
]);

const TargetSchema = z.enum(['claude', 'gpt', 'gemini', 'any']);

const QuerySchema = z.object({
  category: CategorySchema.optional(),
  target: TargetSchema.optional(),
  q: z.string().optional(),
});

function matchesSearch(t: PromptTemplate, q: string): boolean {
  const needle = q.toLowerCase().trim();
  if (!needle) return true;
  if (t.name.toLowerCase().includes(needle)) return true;
  if (t.description.toLowerCase().includes(needle)) return true;
  if (t.useCase.toLowerCase().includes(needle)) return true;
  for (const tag of t.tags) {
    if (tag.toLowerCase().includes(needle)) return true;
  }
  return false;
}

export function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid query', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { category, target, q } = parsed.data;

    let items: PromptTemplate[] = TEMPLATES;
    if (category) items = items.filter((t) => t.category === category);
    if (target) items = items.filter((t) => t.target === target);
    if (q && q.trim()) items = items.filter((t) => matchesSearch(t, q));

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
