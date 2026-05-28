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
  const annual = projected * 12;

  if (!hasData) {
    return (
      <div className="card card-pad fade-up-delay-1">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-good-gradient flex items-center justify-center shrink-0 shadow-glow-green">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="label text-good">Optimization Opportunities</div>
            <div className="mt-2 text-sm text-inkDim">
              No optimization data yet. Once prompts are logged, potential savings will appear here.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hero fade-up-delay-1">
      {/* Animated background accent */}
      <div
        className="absolute -bottom-24 -left-16 w-80 h-80 rounded-full opacity-20 blur-3xl pointer-events-none drift"
        style={{ background: 'radial-gradient(circle, #22c55e 0%, transparent 70%)' }}
        aria-hidden
      />
      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="chip chip-good">
              <span className="w-1.5 h-1.5 rounded-full bg-good pulse-glow" />
              Potential Savings
            </span>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <div className="stat-num-xl gradient-text-good">
              −{formatUSD(potentialSavings.cost)}
            </div>
            <div className="text-sm text-inkDim tabular-nums">
              {potentialSavings.percent.toFixed(1)}% reduction
            </div>
          </div>
          <div className="text-sm text-inkDim mt-3 tabular-nums leading-relaxed">
            {formatNum(potentialSavings.tokens)} tokens · projected{' '}
            <span className="text-good font-semibold">−{formatUSD(projected)}/mo</span>
            {' '}<span className="text-muted">·</span>{' '}
            <span className="text-good font-semibold">−{formatUSD(annual)}/yr</span>{' '}
            if optimizations applied
          </div>
        </div>
        <div className="flex flex-col items-stretch md:items-end gap-2">
          <Link
            href="/insights"
            className="btn-primary inline-flex items-center justify-center whitespace-nowrap"
          >
            View recommendations <span aria-hidden>→</span>
          </Link>
          <Link
            href="/optimizer"
            className="btn inline-flex items-center justify-center whitespace-nowrap"
          >
            Optimize a prompt
          </Link>
        </div>
      </div>
    </div>
  );
}
