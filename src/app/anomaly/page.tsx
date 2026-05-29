import { AnomalyList, type AnomalyListItem } from '@/components/AnomalyList';
import { EmptyState } from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

interface AnomalyListResponse {
  items: AnomalyListItem[];
  total: number;
  error?: string;
}

async function loadAnomalies(): Promise<{
  items: AnomalyListItem[] | null;
  error: string | null;
}> {
  try {
    const r = await fetch(`${BASE_URL}/api/anomaly?limit=100`, {
      cache: 'no-store',
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return { items: null, error: j.error ?? `Status ${r.status}` };
    }
    const json = (await r.json()) as AnomalyListResponse;
    return { items: Array.isArray(json.items) ? json.items : [], error: null };
  } catch (err) {
    return {
      items: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export default async function AnomalyPage() {
  const { items, error } = await loadAnomalies();

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-2xl font-bold tracking-tight gradient-text">Anomalies</h1>
        <p className="text-sm text-muted mt-1">
          Auto-detected cost spikes, budget breaches, new models, and latency
          regressions. Configure a webhook URL on any Budget to get pushed
          alerts in Slack, Teams, or your generic endpoint.
        </p>
      </div>

      {error && (
        <div className="card card-pad border-warn/40 bg-warn/5 text-sm text-warn">
          Couldn&apos;t load anomalies: {error}
        </div>
      )}

      {items && items.length === 0 && (
        <EmptyState
          title="No anomalies detected"
          subtitle="The detection engine runs against logged prompts and your budgets. Once the cron endpoint /api/anomaly/check has run (or you trigger it manually), anything worth alerting on will show up here."
          variant="good"
        />
      )}

      {items && items.length > 0 && <AnomalyList items={items} />}
    </div>
  );
}
