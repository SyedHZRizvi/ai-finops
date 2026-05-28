import Link from 'next/link';
import type { Category, Complexity, StatsResponse } from '@/lib/types';
import { StatsCards } from '@/components/StatsCards';
import { SavingsHighlight } from '@/components/SavingsHighlight';
import { CostChart } from '@/components/CostChart';
import { ComplexityChart } from '@/components/ComplexityChart';
import { CategoryChart } from '@/components/CategoryChart';
import { ModelBreakdown } from '@/components/ModelBreakdown';
import { PeriodSelect } from '@/components/PeriodSelect';

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const periodParam = searchParams.period ?? '7d';
  const period = VALID_PERIODS.has(periodParam) ? periodParam : '7d';

  const [stats, recent] = await Promise.all([loadStats(period), loadRecent()]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">
            Token usage, cost, and optimization opportunities across your AI stack.
          </p>
        </div>
        <PeriodSelect defaultValue="7d" />
      </div>

      {!stats ? (
        <div className="card card-pad text-sm text-muted">
          Unable to load stats. Make sure the API is reachable.
        </div>
      ) : (
        <>
          <StatsCards totals={stats.totals} />
          <SavingsHighlight potentialSavings={stats.potentialSavings} period={period} />

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
        </>
      )}

      <div className="card">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <div className="label">Recent prompts</div>
            <div className="text-xs text-muted mt-0.5">Latest 10 logged calls</div>
          </div>
          <Link href="/prompts" className="btn">
            View all <span aria-hidden>→</span>
          </Link>
        </div>
        {!recent || recent.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">
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
                      <span
                        className={`chip border capitalize ${CATEGORY_CHIP[r.category] ?? ''}`}
                      >
                        {r.category}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">
                      {(r.inputTokens + r.outputTokens).toLocaleString()}
                    </td>
                    <td className="text-right tabular-nums">{formatUSD(r.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
