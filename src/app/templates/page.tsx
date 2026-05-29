import { TemplateBrowser } from '@/components/TemplateBrowser';
import { TEMPLATES } from '@/lib/templates';

export const dynamic = 'force-dynamic';

export default function TemplatesPage({
  searchParams,
}: {
  searchParams: { category?: string; target?: string; q?: string };
}) {
  const initialCategory = typeof searchParams.category === 'string' ? searchParams.category : '';
  const initialTarget = typeof searchParams.target === 'string' ? searchParams.target : '';
  const initialQuery = typeof searchParams.q === 'string' ? searchParams.q : '';

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
        <p className="text-sm text-muted mt-1">
          A curated library of {TEMPLATES.length} battle-tested prompts. Pick one and drop it into
          Studio to customize, cost-out, and run.
        </p>
      </div>

      <TemplateBrowser
        initialCategory={initialCategory}
        initialTarget={initialTarget}
        initialQuery={initialQuery}
      />
    </div>
  );
}
