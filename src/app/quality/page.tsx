// `/quality` — quality + latency analytics for AI FinOps.
//
// AI FinOps already measures cost. This page answers the natural follow-up:
//   - "If I route to Haiku, will responses be 50% as long?"
//   - "Are some models drifting slower lately?"
//   - "Which model has the most empty responses?"
//
// Server component. Reads `period` from search params, fetches
// /api/quality?period=... server-side, renders summary cards + three
// analysis sections.

import Link from 'next/link';
import type { QualityResponse } from '@/lib/qualityMetrics';
import { PeriodSelect } from '@/components/PeriodSelect';
import { EmptyState } from '@/components/EmptyState';
import { LatencyTable } from '@/components/quality/LatencyTable';
import { OutputDistributionChart } from '@/components/quality/OutputDistributionChart';
import { ErrorRateTable } from '@/components/quality/ErrorRateTable';
import { QualitySummary } from '@/components/quality/QualitySummary';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

const VALID_PERIODS = new Set(['24h', '7d', '30d', 'all']);
type Period = '24h' | '7d' | '30d' | 'all';

async function loadQuality(period: Period): Promise<{
  data: QualityResponse | null;
  error: string | null;
}> {
  try {
    const r = await fetch(`${BASE_URL}/api/quality?period=${period}`, {
      cache: 'no-store',
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return { data: null, error: j.error ?? `Status ${r.status}` };
    }
    const json = (await r.json()) as QualityResponse;
    return { data: json, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

function QualityEmpty() {
  return (
    <EmptyState
      title="No quality data yet"
      subtitle="Quality metrics need logged AI calls to analyze. Install the AI FinOps SDK in your app and start recording calls — latency percentiles, output distributions, and empty-response rates will appear here within minutes."
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

export default async function QualityPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const periodParam = searchParams.period ?? '30d';
  const period: Period = VALID_PERIODS.has(periodParam) ? (periodParam as Period) : '30d';

  const { data, error } = await loadQuality(period);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between fade-up gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text">Quality &amp; latency</h1>
          <p className="text-sm text-muted mt-1">
            Percentile latency, output length distribution, and empty-response
            rates by model — so you can route with confidence, not vibes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelect defaultValue="30d" />
        </div>
      </div>

      {error && (
        <div className="card card-pad border-warn/40 bg-warn/5 text-sm text-warn">
          Couldn&apos;t load quality metrics: {error}
        </div>
      )}

      {!error && data && data.overallStats.totalCalls === 0 ? (
        <QualityEmpty />
      ) : null}

      {data && data.overallStats.totalCalls > 0 && (
        <>
          <QualitySummary data={data} />

          <LatencyTable rows={data.latencyByModel} />

          <OutputDistributionChart data={data.outputDistribution} />

          <ErrorRateTable rows={data.errorRates} />
        </>
      )}
    </div>
  );
}
