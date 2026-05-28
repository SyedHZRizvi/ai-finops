import Link from 'next/link';
import type { StatsResponse } from '@/lib/types';

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

export function SavingsHighlight({
  potentialSavings,
  period,
}: {
  potentialSavings: StatsResponse['potentialSavings'];
  period: string;
}) {
  const hasData = potentialSavings.cost > 0 || potentialSavings.tokens > 0;

  const monthlyMultiplier =
    period === '24h' ? 30 : period === '7d' ? 30 / 7 : period === '30d' ? 1 : 1;
  const projected = potentialSavings.cost * monthlyMultiplier;

  if (!hasData) {
    return (
      <div className="card card-pad border-border">
        <div className="label">Optimization Opportunities</div>
        <div className="mt-2 text-sm text-muted">
          No optimization data yet. Once prompts are logged, potential savings will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="card card-pad border-good/40 bg-good/5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="label text-good/90">Potential Savings</div>
          <div className="mt-1 flex items-baseline gap-3">
            <div className="text-3xl font-semibold tabular-nums text-good">
              −{formatUSD(potentialSavings.cost)}
            </div>
            <div className="text-sm text-muted tabular-nums">
              {potentialSavings.percent.toFixed(1)}% reduction
            </div>
          </div>
          <div className="text-xs text-muted mt-1 tabular-nums">
            {formatNum(potentialSavings.tokens)} tokens · projected{' '}
            <span className="text-good">−{formatUSD(projected)}/month</span> if optimizations applied
          </div>
        </div>
        <Link href="/optimizer" className="btn btn-primary self-start md:self-auto">
          Optimize prompts <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
