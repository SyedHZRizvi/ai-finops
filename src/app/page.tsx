import Link from 'next/link';
import type { Category, Complexity, StatsResponse } from '@/lib/types';
import { StatsCards } from '@/components/StatsCards';
import { SavingsHighlight } from '@/components/SavingsHighlight';
import { CostChart } from '@/components/CostChart';
import { ComplexityChart } from '@/components/ComplexityChart';
import { CategoryChart } from '@/components/CategoryChart';
import { ModelBreakdown } from '@/components/ModelBreakdown';
import { PeriodSelect } from '@/components/PeriodSelect';
import { EmptyState } from '@/components/EmptyState';
import { ForecastCard } from '@/components/ForecastCard';
import { BudgetBanner } from '@/components/BudgetBanner';
import { AutoRefresh } from '@/components/AutoRefresh';
import { ExportButton } from '@/components/ExportButton';
import { DigestCard } from '@/components/DigestCard';
import { LiveTicker } from '@/components/LiveTicker';
import { AppTrendsCard } from '@/components/AppTrendsCard';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
const VALID_PERIODS = new Set(['24h', '7d', '30d', 'all']);

interface RecentPrompt {
  id: string;
  timestamp: string;
  model: string;
  category: Category;
  complexity: Complexity;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

interface PromptsListResponse {
  items: RecentPrompt[];
  total: number;
}

const CATEGORY_CHIP: Record<Category, string> = {
  factual: 'chip-teal',
  reasoning: 'chip-blue',
  creative: 'chip-pink',
  code: 'chip-lime',
  analytical: 'chip-amber',
  conversational: 'chip-brand',
  instructional: 'chip-indigo',
  other: 'chip-rose',
};

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function loadStats(period: string): Promise<StatsResponse | null> {
  try {
    const r = await fetch(`${BASE_URL}/api/stats?period=${period}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as StatsResponse;
  } catch {
    return null;
  }
}

async function loadRecent(): Promise<PromptsListResponse | null> {
  try {
    const r = await fetch(`${BASE_URL}/api/prompts?limit=10&offset=0`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as PromptsListResponse;
  } catch {
    return null;
  }
}

interface PreviewItem {
  title: string;
  desc: string;
  icon: React.ReactNode;
  iconClass: string;
}

function PreviewCard({ item }: { item: PreviewItem }) {
  return (
    <div className="card card-pad text-left">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${item.iconClass}`}>
        {item.icon}
      </div>
      <div className="font-semibold text-sm">{item.title}</div>
      <div className="text-xs text-muted mt-1.5 leading-relaxed">{item.desc}</div>
    </div>
  );
}

function WelcomeEmpty() {
  const previews: PreviewItem[] = [
    {
      title: 'Pinpoint cost drivers',
      desc: 'Find the top apps, models, and prompts that are burning your AI budget.',
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" />
        </svg>
      ),
      iconClass: 'bg-blue/15 border border-blue/30 text-blue',
    },
    {
      title: 'Get dollar-impact actions',
      desc: 'Ranked recommendations with concrete savings — caching, model routing, output caps.',
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="16 7 22 7 22 13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      iconClass: 'bg-good/15 border border-good/30 text-good',
    },
    {
      title: 'Optimize prompts in real time',
      desc: 'Paste any prompt — see categorization, complexity, and a leaner rewrite.',
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      iconClass: 'bg-brand/15 border border-brand/30 text-brandLight',
    },
  ];

  return (
    <EmptyState
      title="Welcome to AI FinOps"
      subtitle="Connect a provider or wire the SDK into your apps to start tracking AI cost. We'll show you exactly where the spend is going and how to reduce it."
      actions={
        <Link href="/setup" className="btn-primary">
          Run setup wizard <span aria-hidden>→</span>
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
        {previews.map((p) => (
          <PreviewCard key={p.title} item={p} />
        ))}
      </div>
    </EmptyState>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const periodParam = searchParams.period ?? '7d';
  const period = VALID_PERIODS.has(periodParam) ? periodParam : '7d';

  const [stats, recent] = await Promise.all([loadStats(period), loadRecent()]);
  const isEmpty = stats !== null && stats.totals.calls === 0;
  const apiUnreachable = stats === null;

  return (
    <div className="space-y-6">
      {/* Mission hero — restates the original program goal at the top of the
          home page, with the 3-step Track → Classify → Optimize workflow
          surfaced as inline chip-shaped links so the user is one click from
          the page that does each step. The hero card uses .hero (the
          purple-to-cyan mesh-backed surface) to visually signal "this is the
          most important block on the dashboard". */}
      <div className="hero !p-6 md:!p-8 fade-up">
        <div className="flex items-start justify-between gap-6 flex-wrap relative">
          <div className="min-w-0 flex-1">
            <span className="chip chip-brand mb-3 inline-flex uppercase tracking-wider text-[10px]">
              The mission
            </span>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight gradient-text">
              Reduce your enterprise AI cost.
            </h1>
            <p className="text-sm md:text-base text-inkDim mt-2 max-w-2xl leading-relaxed">
              Track every input &amp; output token. Classify every prompt by
              category and complexity. Act on ranked dollar-impact
              recommendations to reduce your AI bill.
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              <Link
                href="/prompts"
                className="chip chip-teal hover:opacity-80 transition-opacity"
              >
                <span className="font-bold mr-1">1.</span> Track every token{' '}
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/insights"
                className="chip chip-blue hover:opacity-80 transition-opacity"
              >
                <span className="font-bold mr-1">2.</span> Classify by complexity{' '}
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/optimizer"
                className="chip chip-brand hover:opacity-80 transition-opacity"
              >
                <span className="font-bold mr-1">3.</span> Optimize to save{' '}
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
          <PeriodSelect defaultValue="7d" />
        </div>
      </div>

      {apiUnreachable && (
        <div className="card card-pad border-warn/40 bg-warn/5 text-sm text-warn flex items-start gap-3 fade-up-delay-1">
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
            <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
          </svg>
          <div>
            <div className="font-semibold text-inkDim">Data layer not reachable yet</div>
            <div className="text-xs text-muted mt-1 leading-relaxed">
              The dashboard is live, but the Postgres database can&apos;t be reached right now —
              either the connection string isn&apos;t set, the Neon instance is sleeping, or the
              schema migration hasn&apos;t run. Everything below explains what AI FinOps does;
              once data flows in, this banner will be replaced with live numbers.
            </div>
          </div>
        </div>
      )}

      {apiUnreachable || isEmpty ? (
        <WelcomeEmpty />
      ) : (
        <>
          {/* Budget alert banner — renders only when any budget is in warn/breach state. */}
          <BudgetBanner />

          <StatsCards totals={stats.totals} />

          {/* End-of-month forecast next to potential savings. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SavingsHighlight potentialSavings={stats.potentialSavings} period={period} />
            <ForecastCard />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <CostChart data={stats.timeseries} />
            </div>
            <div>
              <ComplexityChart data={stats.byComplexity} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CategoryChart data={stats.byCategory} />
            <ModelBreakdown data={stats.byModel} />
          </div>

          {/* Live activity strip — streams new prompts and anomalies in real time. */}
          <LiveTicker />

          {/* Top-5 apps with directional cost trend chips. */}
          <AppTrendsCard />

          {/* Compact week-over-week digest preview at the bottom of the dashboard. */}
          <DigestCard />
        </>
      )}

      {!isEmpty && !apiUnreachable && stats && (
        <div className="card fade-up-delay-3">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <div className="label">Recent prompts</div>
              <div className="text-xs text-muted mt-1">Latest 10 logged calls</div>
            </div>
            <div className="flex items-center gap-2">
              <ExportButton url="/api/export/prompts" label="Export" />
              <Link href="/prompts" className="btn">
                View all <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
          {!recent || recent.items.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted">
              No prompts logged yet. Install the SDK to start tracking.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Model</th>
                    <th>Category</th>
                    <th className="text-right">Tokens</th>
                    <th className="text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.items.map((r) => (
                    <tr key={r.id}>
                      <td className="text-xs text-muted whitespace-nowrap">
                        {formatTime(r.timestamp)}
                      </td>
                      <td className="font-mono text-xs">{r.model}</td>
                      <td>
                        <span className={`chip capitalize ${CATEGORY_CHIP[r.category] ?? ''}`}>
                          {r.category}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">
                        {(r.inputTokens + r.outputTokens).toLocaleString()}
                      </td>
                      <td className="text-right tabular-nums font-semibold">{formatUSD(r.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Soft-refresh the dashboard every 60s when the tab is visible. */}
      {!apiUnreachable && <AutoRefresh intervalSeconds={60} />}
    </div>
  );
}
