import { PromptTable, type PromptRow } from '@/components/PromptTable';
import { PromptDetail } from '@/components/PromptDetail';
import type { ModelPricing } from '@/lib/types';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

interface PromptsListResponse {
  items: PromptRow[];
  total: number;
  limit: number;
  offset: number;
}

async function loadPrompts(qs: URLSearchParams): Promise<PromptsListResponse | null> {
  try {
    const r = await fetch(`${BASE_URL}/api/prompts?${qs.toString()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as PromptsListResponse;
  } catch {
    return null;
  }
}

async function loadModels(): Promise<string[]> {
  try {
    const r = await fetch(`${BASE_URL}/api/pricing`, { cache: 'no-store' });
    if (!r.ok) return [];
    const json = (await r.json()) as { items: ModelPricing[] };
    return json.items.map((m) => m.model);
  } catch {
    return [];
  }
}

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: {
    limit?: string;
    offset?: string;
    category?: string;
    complexity?: string;
    model?: string;
    search?: string;
    period?: string;
    selected?: string;
  };
}) {
  const limit = Math.min(100, Math.max(1, Number(searchParams.limit) || 25));
  const offset = Math.max(0, Number(searchParams.offset) || 0);

  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  if (searchParams.category) qs.set('category', searchParams.category);
  if (searchParams.complexity) qs.set('complexity', searchParams.complexity);
  if (searchParams.model) qs.set('model', searchParams.model);
  if (searchParams.search) qs.set('search', searchParams.search);
  if (searchParams.period) qs.set('period', searchParams.period);

  const [data, models] = await Promise.all([loadPrompts(qs), loadModels()]);

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-2xl font-bold tracking-tight">Prompts</h1>
        <p className="text-sm text-muted mt-1">
          Browse and filter every logged prompt. Click a row to inspect.
        </p>
      </div>

      {!data ? (
        <div className="card card-pad text-sm text-muted">
          Unable to load prompts. Make sure the API is reachable.
        </div>
      ) : (
        <PromptTable
          items={data.items}
          total={data.total}
          limit={data.limit}
          offset={data.offset}
          models={models}
        />
      )}

      {searchParams.selected && <PromptDetail id={searchParams.selected} />}
    </div>
  );
}
