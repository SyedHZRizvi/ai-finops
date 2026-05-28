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

export function StatsCards({ totals }: { totals: StatsResponse['totals'] }) {
  const items = [
    {
      label: 'Total Calls',
      value: formatNum(totals.calls),
      sub: totals.calls === 1 ? 'request' : 'requests',
    },
    {
      label: 'Total Tokens',
      value: formatNum(totals.totalTokens),
      sub: `${formatNum(totals.inputTokens)} in / ${formatNum(totals.outputTokens)} out`,
    },
    {
      label: 'Total Cost',
      value: formatUSD(totals.cost),
      sub: totals.calls > 0 ? `${formatUSD(totals.cost / totals.calls)} avg / call` : '—',
    },
    {
      label: 'Avg Latency',
      value: totals.avgLatencyMs > 0 ? `${formatNum(Math.round(totals.avgLatencyMs))} ms` : '—',
      sub: 'per request',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {items.map((it) => (
        <div key={it.label} className="card card-pad">
          <div className="label">{it.label}</div>
          <div className="stat-num mt-1">{it.value}</div>
          <div className="text-xs text-muted mt-1 tabular-nums">{it.sub}</div>
        </div>
      ))}
    </div>
  );
}
