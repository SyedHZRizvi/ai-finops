import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSnapshot } from '@/lib/snapshots';
import { InsightsSummary } from '@/components/InsightsSummary';
import { RecommendationsList } from '@/components/RecommendationsList';
import { TopSpendersTable } from '@/components/TopSpendersTable';
import { ModelMismatchTable } from '@/components/ModelMismatchTable';
import { RedundancyClusters } from '@/components/RedundancyClusters';
import { OutputBloatTable } from '@/components/OutputBloatTable';
import { CATEGORY_CHIP } from '@/components/PromptTable';
import type { InsightsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PERIOD_CHIP: Record<'24h' | '7d' | '30d' | 'all', string> = {
  '24h': 'chip-amber',
  '7d': 'chip-teal',
  '30d': 'chip-brand',
  all: 'chip-indigo',
};

// Mirror /insights' AppHotspotsCard so the read-only view feels identical.
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

export default async function SnapshotDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const snapshot = await getSnapshot(params.id);
  if (!snapshot) {
    notFound();
  }

  const data = snapshot.payload;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap fade-up">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 text-xs text-muted mb-1">
            <Link href="/snapshots" className="hover:text-ink transition-colors inline-flex items-center gap-1">
              <span aria-hidden>←</span> Snapshots
            </Link>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{snapshot.label}</h1>
            <span className={`chip ${PERIOD_CHIP[snapshot.period]} capitalize`}>
              {snapshot.period}
            </span>
            <span className="chip chip-blue text-[10px] uppercase tracking-wider">
              Read-only
            </span>
          </div>
          <p className="text-sm text-muted mt-2 tabular-nums">
            Captured {formatDateTime(snapshot.capturedAt)}
            {snapshot.capturedBy && (
              <>
                {' '}
                by <span className="text-inkDim">{snapshot.capturedBy}</span>
              </>
            )}
            {' · '}
            <span className="text-muted/70">
              Generated at {formatDateTime(data.generatedAt)}
            </span>
          </p>
          {snapshot.note && (
            <div className="mt-3 border-l-4 border-brand/40 bg-panel2/70 rounded-r-xl px-4 py-3 text-sm text-inkDim leading-relaxed max-w-3xl">
              {snapshot.note}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <Link
            href={`/snapshots?compareFrom=${encodeURIComponent(snapshot.id)}`}
            className="btn"
          >
            Compare with another →
          </Link>
        </div>
      </div>

      {data.totals.calls === 0 ? (
        <div className="card card-pad text-sm text-muted">
          This snapshot captured zero calls in the selected period — there
          are no insights to render. The capture itself is still preserved
          as a historical anchor.
        </div>
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
