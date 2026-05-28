import type { ReactNode } from 'react';
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

function IconChat() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStack() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="2 17 12 22 22 17" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="2 12 12 17 22 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDollar() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <line x1="12" y1="1" x2="12" y2="23" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClock() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface StatItem {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  iconClass: string;
  accentColor: string;
  delayClass: string;
  bgFx: string;
}

export function StatsCards({ totals }: { totals: StatsResponse['totals'] }) {
  const items: StatItem[] = [
    {
      label: 'Total Calls',
      value: formatNum(totals.calls),
      sub: totals.calls === 1 ? 'request' : 'requests',
      icon: <IconChat />,
      iconClass: 'bg-blue/15 border-blue/30 text-blue',
      accentColor: '#3b82f6',
      delayClass: 'fade-up',
      bgFx: 'radial-gradient(circle at 90% 10%, rgba(59,130,246,0.10) 0%, transparent 50%)',
    },
    {
      label: 'Total Tokens',
      value: formatNum(totals.totalTokens),
      sub: `${formatNum(totals.inputTokens)} in / ${formatNum(totals.outputTokens)} out`,
      icon: <IconStack />,
      iconClass: 'bg-brand/15 border-brand/30 text-brandLight',
      accentColor: '#8b5cf6',
      delayClass: 'fade-up-delay-1',
      bgFx: 'radial-gradient(circle at 90% 10%, rgba(139,92,246,0.12) 0%, transparent 50%)',
    },
    {
      label: 'Total Cost',
      value: formatUSD(totals.cost),
      sub: totals.calls > 0 ? `${formatUSD(totals.cost / totals.calls)} avg / call` : '—',
      icon: <IconDollar />,
      iconClass: 'bg-amber/15 border-amber/30 text-amber',
      accentColor: '#f59e0b',
      delayClass: 'fade-up-delay-2',
      bgFx: 'radial-gradient(circle at 90% 10%, rgba(245,158,11,0.10) 0%, transparent 50%)',
    },
    {
      label: 'Avg Latency',
      value: totals.avgLatencyMs > 0 ? `${formatNum(Math.round(totals.avgLatencyMs))} ms` : '—',
      sub: 'per request',
      icon: <IconClock />,
      iconClass: 'bg-teal/15 border-teal/30 text-teal',
      accentColor: '#14b8a6',
      delayClass: 'fade-up-delay-3',
      bgFx: 'radial-gradient(circle at 90% 10%, rgba(20,184,166,0.10) 0%, transparent 50%)',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {items.map((it) => (
        <div
          key={it.label}
          className={`card card-grad card-pad relative overflow-hidden ${it.delayClass}`}
          style={{ backgroundImage: it.bgFx }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
            style={{
              background: `linear-gradient(90deg, transparent, ${it.accentColor}, transparent)`,
            }}
            aria-hidden
          />
          <div className="flex items-start justify-between mb-4">
            <div className="label">{it.label}</div>
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center ${it.iconClass}`}
            >
              {it.icon}
            </div>
          </div>
          <div className="stat-num tracking-tight text-ink">{it.value}</div>
          <div className="text-xs text-muted mt-2 tabular-nums">{it.sub}</div>
        </div>
      ))}
    </div>
  );
}
