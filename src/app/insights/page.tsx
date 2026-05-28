import Link from 'next/link';
import type { Category, InsightsResponse } from '@/lib/types';
import { PeriodSelect } from '@/components/PeriodSelect';
import { InsightsSummary } from '@/components/InsightsSummary';
import { RecommendationsList } from '@/components/RecommendationsList';
import { TopSpendersTable } from '@/components/TopSpendersTable';
import { ModelMismatchTable } from '@/components/ModelMismatchTable';
import { RedundancyClusters } from '@/components/RedundancyClusters';
import { OutputBloatTable } from '@/components/OutputBloatTable';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
const VALID_PERIODS = new Set(['24h', '7d', '30d', 'all']);

const CATEGORY_CHIP: Record<Category, string> = {
  factual: 'bg-brand2/10 text-brand2 border-brand2/30',
  reasoning: 'bg-brand/10 text-brand border-brand/30',
  creative: 'bg-pink-500/10 text-pink-300 border-pink-400/30',
  code: 'bg-good/10 text-good border-good/30',
  analytical: 'bg-warn/10 text-warn border-warn/30',
  conversational: 'bg-blue-500/10 text-blue-300 border-blue-400/30',
  instructional: 'bg-violet-500/10 text-violet-300 border-violet-400/30',
  other: 'bg-panel2 text-muted border-border',
};

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

async function loadInsights(period: string): Promise<InsightsResponse | null> {
  try {
    const r = await fetch(`${BASE_URL}/api/insights?period=${period}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as InsightsResponse;
  } catch {
    return null;
  }
}

function AppHotspotsCard({ hotspots }: { hotspots: InsightsResponse['appHotspots'] }) {
  return (
    <div className="card">
      <div className="px-5 py-3 border-b border-border">
        <div className="label">App hotspots</div>
        <div className="text-xs text-muted mt-0.5">Where AI spend concentrates by app</div>
      </div>
      {hotspots.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted">No app data available.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>App</th>
                <th>Top model</th>
                <th>Top category</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {hotspots.map((h, i) => (
                <tr key={`${h.appName ?? 'unknown'}-${i}`}>
                  <td className="text-xs">
                    {h.appName ?? <span className="text-muted">unknown</span>}
                  </td>
                  <td className="font-mono text-xs whitespace-nowrap">{h.topModel}</td>
                  <td>
                    <span className={`chip border capitalize ${CATEGORY_CHIP[h.topCategory]}`}>
                      {h.topCategory}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatNum(h.calls)}</td>
                  <td className="text-right tabular-nums">{formatUSD(h.totalCost)}</td>
                  <td className="text-right tabular-nums">{h.pctOfTotal.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card card-pad text-center py-12">
      <div className="text-lg font-medium">No prompts logged yet</div>
      <div className="text-sm text-muted mt-2 max-w-md mx-auto">
        Insights need logged AI calls to analyze. Install the AI FinOps SDK in your app and start
        recording calls — root causes and ranked recommendations will appear here within minutes.
      </div>
      <Link href="/settings" className="btn btn-primary mt-4 inline-flex">
        View SDK install docs <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const periodParam = searchParams.period ?? '30d';
  const period = VALID_PERIODS.has(periodParam) ? periodParam : '30d';

  const data = await loadInsights(period);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Insights</h1>
          <p className="text-sm text-muted mt-0.5">
            Why your AI bill is what it is — and the ranked actions that would lower it.
          </p>
        </div>
        <PeriodSelect defaultValue="30d" />
      </div>

      {!data ? (
        <div className="card card-pad text-sm text-muted">
          Unable to load insights. Make sure the API is reachable.
        </div>
      ) : data.totals.calls === 0 ? (
        <EmptyState />
      ) : (
        <>
          <InsightsSummary data={data} />
          <RecommendationsList recommendations={data.recommendations} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopSpendersTable rows={data.topSpenders} />
            <AppHotspotsCard hotspots={data.appHotspots} />
          </div>

          <ModelMismatchTable rows={data.modelMismatch} />
          <RedundancyClusters clusters={data.redundancyClusters} />
          <OutputBloatTable rows={data.outputBloat} />
        </>
      )}
    </div>
  );
}
