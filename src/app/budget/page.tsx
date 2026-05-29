import { BudgetForm } from '@/components/BudgetForm';
import { BudgetTable } from '@/components/BudgetTable';
import { AppForecastTable } from '@/components/AppForecastTable';
import { EmptyState } from '@/components/EmptyState';
import type { BudgetStatus } from '@/lib/budget';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

interface BudgetListResponse {
  items: BudgetStatus[];
  error?: string;
}

async function loadBudgets(): Promise<{ items: BudgetStatus[] | null; error: string | null }> {
  try {
    const r = await fetch(`${BASE_URL}/api/budget`, { cache: 'no-store' });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return { items: null, error: j.error ?? `Status ${r.status}` };
    }
    const json = (await r.json()) as BudgetListResponse;
    return { items: Array.isArray(json.items) ? json.items : [], error: null };
  } catch (err) {
    return { items: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export default async function BudgetPage() {
  const { items, error } = await loadBudgets();

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-2xl font-bold tracking-tight gradient-text">Budgets</h1>
        <p className="text-sm text-muted mt-1">
          Cap monthly AI spend globally, per app, or per user. Alerts fire as
          usage approaches and crosses the limit; forecasts project month-end
          spend so you see breaches coming.
        </p>
      </div>

      <BudgetForm />

      {error && (
        <div className="card card-pad border-warn/40 bg-warn/5 text-sm text-warn">
          Couldn&apos;t load budgets: {error}
        </div>
      )}

      {items && items.length === 0 && (
        <EmptyState
          title="No budgets configured"
          subtitle="Set a monthly cap above to start receiving threshold alerts and projected-breach warnings on the dashboard."
          variant="brand"
        />
      )}

      {items && items.length > 0 && <BudgetTable rows={items} />}

      <div className="mt-4">
        <h2 className="text-lg font-semibold tracking-tight mb-2">
          Per-app forecasts
        </h2>
        <p className="text-sm text-muted mb-4">
          Each app&apos;s month-to-date spend, projected month-end, and a
          directional trend chip based on the last 14 days.
        </p>
        <AppForecastTable />
      </div>
    </div>
  );
}
