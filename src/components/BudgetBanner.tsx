import Link from 'next/link';
import type { BudgetStatus } from '@/lib/budget';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

function formatUSD(n: number, currency = 'USD'): string {
  if (!Number.isFinite(n)) return `${currency} 0.00`;
  const abs = Math.abs(n);
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  if (abs < 1) return `${symbol}${n.toFixed(4)}`;
  return `${symbol}${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function scopeLabel(status: BudgetStatus): string {
  const { budget } = status;
  if (budget.scope === 'global') return 'Global';
  return `${budget.scope === 'app' ? 'App' : 'User'} "${budget.scopeValue ?? ''}"`;
}

async function loadBudgets(): Promise<BudgetStatus[]> {
  try {
    const r = await fetch(`${BASE_URL}/api/budget`, { cache: 'no-store' });
    if (!r.ok) return [];
    const json = (await r.json()) as { items?: BudgetStatus[] };
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    return [];
  }
}

export async function BudgetBanner() {
  const all = await loadBudgets();
  const offenders = all.filter(
    (b) => b.status === 'warn-90' || b.status === 'breach-100',
  );
  if (offenders.length === 0) return null;

  // Pick the worst — a hard breach trumps a warning, ties broken by % used.
  const worst = offenders.reduce((a, b) => {
    const aBreached = a.status === 'breach-100' ? 1 : 0;
    const bBreached = b.status === 'breach-100' ? 1 : 0;
    if (aBreached !== bBreached) return aBreached > bBreached ? a : b;
    return a.percentUsed >= b.percentUsed ? a : b;
  });

  const isBreach = worst.status === 'breach-100';
  const tone = isBreach
    ? 'border-bad/40 bg-bad/10 text-bad'
    : 'border-warn/40 bg-warn/10 text-warn';

  return (
    <div
      className={`card card-pad ${tone} flex items-start gap-3 fade-up`}
      role="alert"
    >
      <span aria-hidden className="text-lg leading-none">
        {isBreach ? '⛔' : '⚠'}
      </span>
      <div className="flex-1 text-sm">
        <span className="font-semibold">
          {scopeLabel(worst)} budget is at {worst.percentUsed.toFixed(0)}%
        </span>{' '}
        ({formatUSD(worst.monthToDate, worst.budget.currency)} /{' '}
        {formatUSD(worst.budget.monthlyLimit, worst.budget.currency)})
        {offenders.length > 1 && (
          <span className="text-muted">
            {' '}
            · {offenders.length - 1} other budget
            {offenders.length - 1 === 1 ? '' : 's'} also warning
          </span>
        )}{' '}
        —{' '}
        <Link href="/budget" className="underline underline-offset-4 hover:opacity-80">
          view budget settings
        </Link>
      </div>
    </div>
  );
}
