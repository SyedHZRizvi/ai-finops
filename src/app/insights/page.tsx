import Link from 'next/link';
import type { InsightsResponse } from '@/lib/types';
import { PeriodSelect } from '@/components/PeriodSelect';
import { InsightsSummary } from '@/components/InsightsSummary';
import { RecommendationsList } from '@/components/RecommendationsList';
import { TopSpendersTable } from '@/components/TopSpendersTable';
import { ModelMismatchTable } from '@/components/ModelMismatchTable';
import { RedundancyClusters } from '@/components/RedundancyClusters';
import { OutputBloatTable } from '@/components/OutputBloatTable';
import { EmptyState } from '@/components/EmptyState';
import { CATEGORY_CHIP } from '@/components/PromptTable';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
const VALID_PERIODS = new Set(['24h', '7d', '30d', 'all']);

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
    <div className="card fade-up-delay-2">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="label">App hotspots</div>
          <div className="text-xs text-muted mt-1">Where AI spend concentrates by app</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-indigo/15 border border-indigo/30 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-indigo" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="9" x2="15" y2="9" strokeLinecap="round" />
            <line x1="9" y1="13" x2="15" y2="13" strokeLinecap="round" />
            <line x1="9" y1="17" x2="13" y2="17" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      {hotspots.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">No app data available.</div>
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
                  <td className="text-xs font-medium">
                    {h.appName ?? <span className="text-muted">unknown</span>}
                  </td>
                  <td className="font-mono text-xs whitespace-nowrap">{h.topModel}</td>
                  <td>
                    <span className={`chip capitalize ${CATEGORY_CHIP[h.topCategory]}`}>
                      {h.topCategory}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatNum(h.calls)}</td>
                  <td className="text-right tabular-nums font-semibold">{formatUSD(h.totalCost)}</td>
                  <td className="text-right tabular-nums text-inkDim">{h.pctOfTotal.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InsightsEmpty() {
  return (
    <EmptyState
      title="No prompts logged yet"
      subtitle="Insights need logged AI calls to analyze. Install the AI FinOps SDK in your app and start recording calls — root causes and ranked recommendations will appear here within minutes."
      actions={
        <>
          <Link href="/setup" className="btn-primary">
            Run setup wizard <span aria-hidden>→</span>
          </Link>
          <Link href="/settings" className="btn">
            SDK install docs
          </Link>
        </>
      }
    />
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
      <div className="flex items-center justify-between fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
          <p className="text-sm text-muted mt-1">
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
        <InsightsEmpty />
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
