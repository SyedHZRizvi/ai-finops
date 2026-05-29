import { AllocationRuleForm } from '@/components/AllocationRuleForm';
import { AllocationRuleList } from '@/components/AllocationRuleList';
import { AllocationPreview } from '@/components/AllocationPreview';
import { EmptyState } from '@/components/EmptyState';
import type { AllocationRuleData } from '@/lib/allocation';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

interface AllocationListResponse {
  items: AllocationRuleData[];
  error?: string;
}

async function loadRules(): Promise<{ items: AllocationRuleData[] | null; error: string | null }> {
  try {
    const r = await fetch(`${BASE_URL}/api/allocations`, { cache: 'no-store' });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return { items: null, error: j.error ?? `Status ${r.status}` };
    }
    const json = (await r.json()) as AllocationListResponse;
    return { items: Array.isArray(json.items) ? json.items : [], error: null };
  } catch (err) {
    return { items: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export default async function AllocationsPage() {
  const { items, error } = await loadRules();
  const activeRules = (items ?? []).filter((r) => r.isActive);

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-2xl font-bold tracking-tight gradient-text">
          Cost allocation
        </h1>
        <p className="text-sm text-muted mt-1">
          Re-attribute LLM spend from shared apps to the teams actually
          consuming it. Example: a single &ldquo;shared-llm-pool&rdquo; app
          serving marketing, engineering, and support — split its cost so
          reports show real ownership instead of one bucket.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-2">Add a rule</h2>
        <p className="text-sm text-muted mb-3">
          Match incoming rows by app name, model, or user ID, then declare
          which downstream apps should receive the cost and in what
          proportion.
        </p>
        <AllocationRuleForm />
      </div>

      {error && (
        <div className="card card-pad border-warn/40 bg-warn/5 text-sm text-warn">
          Couldn&apos;t load allocation rules: {error}
        </div>
      )}

      {items && items.length === 0 && (
        <EmptyState
          title="No allocation rules yet"
          subtitle="Add a rule above to start splitting shared spend across the teams that actually own it. Rules only affect this /allocations view today; future revisions will let you opt them into the main reports."
          variant="brand"
        />
      )}

      {items && items.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight mb-2">
            Existing rules
          </h2>
          <p className="text-sm text-muted mb-3">
            Rules are evaluated in priority order (lower runs first). Disabling
            a rule keeps it on the list but takes it out of evaluation. Delete
            soft-disables — nothing is dropped from history.
          </p>
          <AllocationRuleList rows={items} />
        </div>
      )}

      {items && items.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight mb-2">
            What would change
          </h2>
          <p className="text-sm text-muted mb-3">
            Apply the active rules to real data from the last 7 or 30 days
            and compare per-app spend before vs. after. Useful for sanity-
            checking percentages before they affect ongoing reports.
          </p>
          <AllocationPreview rules={activeRules} />
        </div>
      )}
    </div>
  );
}
