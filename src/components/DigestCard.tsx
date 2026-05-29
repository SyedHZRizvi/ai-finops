// Compact preview of the latest weekly digest, intended to sit on the
// Dashboard. Deliberately doesn't repeat what the Dashboard already shows —
// it surfaces only the *new* information the digest adds:
//   1. The vs-previous-period delta (the Dashboard shows current totals,
//      not a comparison).
//   2. The top recommendation (the Dashboard hints at savings but the
//      digest is the only place the headline action is named).
//   3. A link to /digest for the full view.

import Link from 'next/link';
import { buildDigest } from '@/lib/digest';

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DeltaArrow({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.5) {
    return (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    );
  }
  if (pct > 0) {
    return (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="18 15 12 9 6 15" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function DigestIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 text-brandLight" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22 6 12 13 2 6" />
    </svg>
  );
}

export async function DigestCard() {
  // Render gracefully if the digest build fails (e.g., DB unreachable on
  // a fresh deploy). The Dashboard should never blow up because one
  // panel couldn't load.
  let cost = 0;
  let pct = 0;
  let absDelta = 0;
  let prevHasData = false;
  let topRecTitle: string | null = null;
  let topRecMonthly = 0;
  let failure = false;

  try {
    const data = await buildDigest('weekly');
    cost = data.totals.cost;
    pct = data.totals.vsPrevPercent;
    absDelta = data.totals.vsPrevPeriod;
    prevHasData = !(pct === 0 && absDelta === 0);
    if (data.topRecommendations.length > 0) {
      topRecTitle = data.topRecommendations[0]!.title;
      topRecMonthly = data.topRecommendations[0]!.estimatedMonthlySavings;
    }
  } catch {
    failure = true;
  }

  if (failure) {
    return (
      <div className="card card-pad">
        <div className="flex items-center justify-between">
          <div className="label flex items-center gap-2">
            <DigestIcon />
            Weekly digest
          </div>
          <Link href="/digest" className="btn-ghost text-xs">
            Open <span aria-hidden>→</span>
          </Link>
        </div>
        <div className="text-xs text-muted mt-3">Digest unavailable right now.</div>
      </div>
    );
  }

  // Color of the delta — spend up is bad (red), spend down is good (green),
  // flat is neutral.
  const direction: 'up' | 'down' | 'flat' = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  const deltaClass =
    direction === 'up' ? 'text-bad' : direction === 'down' ? 'text-good' : 'text-muted';
  const sign = pct > 0 ? '+' : '';
  const absSign = absDelta > 0 ? '+' : '';

  return (
    <div className="card card-pad fade-up-delay-2">
      <div className="flex items-center justify-between mb-3">
        <div className="label flex items-center gap-2">
          <DigestIcon />
          Weekly digest
        </div>
        <Link href="/digest?period=weekly" className="btn-ghost text-xs">
          Open <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="flex items-baseline gap-3">
        <div className="stat-num">{formatUSD(cost)}</div>
        <span className="text-xs text-muted">last 7 days</span>
      </div>

      {prevHasData ? (
        <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${deltaClass}`}>
          <DeltaArrow pct={pct} />
          <span>
            {sign}
            {pct.toFixed(1)}% vs previous week
          </span>
          <span className="text-muted font-medium ml-1">
            ({absSign}
            {formatUSD(absDelta)})
          </span>
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted">No prior week data to compare yet.</div>
      )}

      {topRecTitle ? (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1.5">
            Top recommendation
          </div>
          <div className="text-sm font-medium text-inkDim leading-snug line-clamp-2">
            {topRecTitle}
          </div>
          {topRecMonthly > 0 && (
            <div className="mt-1.5 text-xs">
              <span className="text-good font-semibold">{formatUSD(topRecMonthly)}/mo</span>
              <span className="text-muted"> potential savings</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
