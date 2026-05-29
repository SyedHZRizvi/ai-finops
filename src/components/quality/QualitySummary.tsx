import type { ReactNode } from 'react';
import type { QualityResponse } from '@/lib/qualityMetrics';

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${formatNum(Math.round(ms))} ms`;
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return '0%';
  if (n === 0) return '0%';
  if (n < 0.01) return '<0.01%';
  return `${n.toFixed(2)}%`;
}

function IconActivity() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <polyline
        points="22 12 18 12 15 21 9 3 6 12 2 12"
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

function IconText() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <line x1="4" y1="6" x2="20" y2="6" strokeLinecap="round" />
      <line x1="4" y1="12" x2="20" y2="12" strokeLinecap="round" />
      <line x1="4" y1="18" x2="14" y2="18" strokeLinecap="round" />
    </svg>
  );
}

function IconAlert() {
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
        d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
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

export function QualitySummary({ data }: { data: QualityResponse }) {
  const s = data.overallStats;

  // Empty-rate accent flips green→amber→red based on the same thresholds
  // used in ErrorRateTable. Keeps the "is anything on fire?" signal
  // consistent across the page.
  const emptyClass =
    s.emptyRatePercent < 1
      ? 'bg-good/15 border-good/30 text-good'
      : s.emptyRatePercent <= 5
        ? 'bg-warn/15 border-warn/30 text-warn'
        : 'bg-bad/15 border-bad/30 text-bad';
  const emptyAccent =
    s.emptyRatePercent < 1 ? '#22c55e' : s.emptyRatePercent <= 5 ? '#f59e0b' : '#ef4444';

  const items: StatItem[] = [
    {
      label: 'Total calls',
      value: formatNum(s.totalCalls),
      sub: s.totalCalls === 1 ? 'request in period' : 'requests in period',
      icon: <IconActivity />,
      iconClass: 'bg-blue/15 border-blue/30 text-blue',
      accentColor: '#3b82f6',
      delayClass: 'fade-up',
      bgFx: 'radial-gradient(circle at 90% 10%, rgba(59,130,246,0.10) 0%, transparent 50%)',
    },
    {
      label: 'Avg latency',
      value: formatMs(s.avgLatencyMs),
      sub: 'per request',
      icon: <IconClock />,
      iconClass: 'bg-teal/15 border-teal/30 text-teal',
      accentColor: '#14b8a6',
      delayClass: 'fade-up-delay-1',
      bgFx: 'radial-gradient(circle at 90% 10%, rgba(20,184,166,0.10) 0%, transparent 50%)',
    },
    {
      label: 'Avg output tokens',
      value: formatNum(s.avgOutputTokens),
      sub: 'per response',
      icon: <IconText />,
      iconClass: 'bg-pink/15 border-pink/30 text-pink',
      accentColor: '#ec4899',
      delayClass: 'fade-up-delay-2',
      bgFx: 'radial-gradient(circle at 90% 10%, rgba(236,72,153,0.10) 0%, transparent 50%)',
    },
    {
      label: 'Empty response rate',
      value: formatPct(s.emptyRatePercent),
      sub:
        s.totalEmpty === 1
          ? '1 empty response'
          : `${formatNum(s.totalEmpty)} empty responses`,
      icon: <IconAlert />,
      iconClass: emptyClass,
      accentColor: emptyAccent,
      delayClass: 'fade-up-delay-3',
      bgFx: `radial-gradient(circle at 90% 10%, ${emptyAccent}1f 0%, transparent 50%)`,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
