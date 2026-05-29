// Renders DigestData into an email-ready, self-contained HTML document.
// Three constraints drive the design:
//
//   1. Inline-friendly. Email clients (Gmail, Outlook, Apple Mail) strip
//      external stylesheets and rewrite class names, so we keep everything
//      under one <style> block AND repeat the most critical rules as inline
//      `style="..."` so the rendering survives a copy-paste into Gmail.
//   2. Light palette. Emails default to white. Forcing a dark theme onto
//      an inbox makes the digest look broken; we pick a clean light card-on-
//      gray look that works on both light and dark Gmail themes.
//   3. No external assets. Every icon is inline SVG, no <img src="https://...">
//      because those are blocked-by-default in most enterprise mail clients.
//
// Total size budget: under 50KB rendered. Most of the bytes come from the
// embedded styles, which we keep tight.

import type { DigestData, DigestPeriod } from '@/lib/digest';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  // Audit convention: under $1 keep 4 decimals (sub-cent precision matters
  // on tiny demo datasets), $1+ stays at 2 decimals like a normal invoice.
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

function formatRange(from: Date, to: Date): string {
  // The range is [from, to). Subtract one second from `to` for the human
  // label so "May 21 - May 27" doesn't read as "May 21 - May 28".
  const inclusiveTo = new Date(to.getTime() - 1000);
  const sameYear = from.getUTCFullYear() === inclusiveTo.getUTCFullYear();
  const fmt = (d: Date, withYear: boolean): string =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: withYear ? 'numeric' : undefined,
      timeZone: 'UTC',
    });
  return `${fmt(from, false)} - ${fmt(inclusiveTo, sameYear ? false : true)}, ${inclusiveTo.getUTCFullYear()}`;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function periodLabel(p: DigestPeriod): string {
  if (p === 'daily') return 'Daily Digest';
  if (p === 'weekly') return 'Weekly Digest';
  return 'Monthly Digest';
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#b91c1c',
  warn: '#b45309',
  info: '#1d4ed8',
};

const SEVERITY_BG: Record<string, string> = {
  critical: '#fef2f2',
  warn: '#fffbeb',
  info: '#eff6ff',
};

// Arrow icon for vs-prev-period delta. Up arrow when spend rose (bad,
// painted red); down when it fell (good, painted green); dash when flat
// or no prior data. Inline SVG with currentColor so the surrounding text
// color paints the arrow.
function deltaArrowSvg(direction: 'up' | 'down' | 'flat'): string {
  if (direction === 'flat') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  }
  if (direction === 'up') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polyline points="18 15 12 9 6 15"/></svg>';
  }
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polyline points="6 9 12 15 18 9"/></svg>';
}

// "Sparkle" icon for the header. Pure decoration — never load-bearing.
function logoSvg(): string {
  return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>';
}

function deltaBlock(absDelta: number, pctDelta: number, prevWasZero: boolean): string {
  if (prevWasZero) {
    return `<div style="font-size:13px;color:#6b7280;margin-top:8px">No prior period data to compare</div>`;
  }
  const direction: 'up' | 'down' | 'flat' = pctDelta > 0.5 ? 'up' : pctDelta < -0.5 ? 'down' : 'flat';
  // Spend-up is "bad" (red); spend-down is "good" (green); flat is neutral gray.
  const color = direction === 'up' ? '#b91c1c' : direction === 'down' ? '#15803d' : '#6b7280';
  const sign = pctDelta > 0 ? '+' : '';
  const absSign = absDelta > 0 ? '+' : '';
  return `<div style="margin-top:8px;font-size:13px;color:${color};font-weight:600">
    <span style="display:inline-block;color:${color}">${deltaArrowSvg(direction)}</span>
    <span style="vertical-align:middle">${escapeHtml(sign)}${pctDelta.toFixed(1)}% vs previous period</span>
    <span style="vertical-align:middle;color:#6b7280;font-weight:500;margin-left:6px">(${escapeHtml(absSign)}${formatUSD(absDelta)})</span>
  </div>`;
}

function renderTopApps(apps: DigestData['topApps']): string {
  if (apps.length === 0) {
    return `<tr><td colspan="3" style="padding:14px 16px;color:#6b7280;font-size:13px;text-align:center">No app data in this period.</td></tr>`;
  }
  return apps
    .map(
      (a) => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827">${escapeHtml(a.appName)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;text-align:right;font-weight:600">${escapeHtml(formatUSD(a.cost))}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;text-align:right">${a.pctOfTotal.toFixed(1)}%</td>
      </tr>`,
    )
    .join('');
}

function renderTopModels(models: DigestData['topModels']): string {
  if (models.length === 0) {
    return `<tr><td colspan="3" style="padding:14px 16px;color:#6b7280;font-size:13px;text-align:center">No model data in this period.</td></tr>`;
  }
  return models
    .map(
      (m) => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;font-family:'SFMono-Regular',Menlo,Consolas,monospace">${escapeHtml(m.model)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;text-align:right;font-weight:600">${escapeHtml(formatUSD(m.cost))}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;text-align:right">${formatNum(m.calls)}</td>
      </tr>`,
    )
    .join('');
}

function renderRecommendations(recs: DigestData['topRecommendations']): string {
  if (recs.length === 0) {
    return `<div style="padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;color:#6b7280;font-size:13px;text-align:center">
      No actionable recommendations in this period — spending looks balanced.
    </div>`;
  }
  return recs
    .map(
      (r, i) => `
      <div style="display:block;margin-bottom:10px;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-left:3px solid #8b5cf6;border-radius:8px">
        <div style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">
          Recommendation ${i + 1}
        </div>
        <div style="font-size:14px;color:#111827;font-weight:600;line-height:1.4">${escapeHtml(r.title)}</div>
        <div style="margin-top:8px;font-size:13px;color:#374151">
          <span style="color:#15803d;font-weight:700">${escapeHtml(formatUSD(r.estimatedMonthlySavings))}/mo</span>
          <span style="color:#6b7280"> potential savings</span>
          ${
            r.affectedCalls > 0
              ? `<span style="color:#6b7280"> · ${formatNum(r.affectedCalls)} call${r.affectedCalls === 1 ? '' : 's'} affected</span>`
              : ''
          }
        </div>
      </div>`,
    )
    .join('');
}

function renderAnomalies(anomalies: DigestData['anomalies']): string {
  if (anomalies.length === 0) return '';
  const items = anomalies
    .map((a) => {
      const color = SEVERITY_COLOR[a.severity] ?? '#374151';
      const bg = SEVERITY_BG[a.severity] ?? '#f9fafb';
      return `
        <div style="display:block;margin-bottom:8px;padding:12px 14px;background:${bg};border:1px solid ${color}33;border-left:3px solid ${color};border-radius:6px">
          <div style="display:block;font-size:11px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">
            ${escapeHtml(a.severity)} · ${escapeHtml(a.kind)}
          </div>
          <div style="font-size:13px;color:#111827;font-weight:600">${escapeHtml(a.title)}</div>
          <div style="margin-top:4px;font-size:12px;color:#6b7280">${escapeHtml(formatDateTime(a.detectedAt))} UTC</div>
        </div>`;
    })
    .join('');
  return `
    <div style="margin-top:28px">
      <div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">
        Recent anomalies
      </div>
      ${items}
    </div>`;
}

function renderForecast(forecast: DigestData['forecast']): string {
  if (!forecast) return '';
  const confColor =
    forecast.confidence === 'high' ? '#15803d' : forecast.confidence === 'medium' ? '#b45309' : '#6b7280';
  return `
    <div style="margin-top:28px;padding:18px 20px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px">
      <div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">
        End-of-month projection
      </div>
      <div style="font-size:28px;color:#5b21b6;font-weight:700;font-variant-numeric:tabular-nums">${escapeHtml(formatUSD(forecast.projectedMonthEnd))}</div>
      <div style="margin-top:6px;font-size:13px;color:${confColor};font-weight:600;text-transform:capitalize">Confidence: ${escapeHtml(forecast.confidence)}</div>
    </div>`;
}

function renderTopSpenders(spenders: DigestData['topSpenders']): string {
  if (spenders.length === 0) return '';
  const items = spenders
    .map(
      (s) => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;font-family:'SFMono-Regular',Menlo,Consolas,monospace;width:1%;white-space:nowrap">${escapeHtml(s.model)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;line-height:1.4">${escapeHtml(s.promptPreview || '(no prompt text)')}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;text-align:right;font-weight:600;white-space:nowrap">${escapeHtml(formatUSD(s.cost))}</td>
      </tr>`,
    )
    .join('');
  return `
    <div style="margin-top:28px">
      <div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">
        Top spenders this period
      </div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#f9fafb">
            <th align="left" style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Model</th>
            <th align="left" style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Prompt preview</th>
            <th align="right" style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Cost</th>
          </tr>
        </thead>
        <tbody>${items}</tbody>
      </table>
    </div>`;
}

/**
 * Renders DigestData to a complete, self-contained HTML document. Safe to
 * paste directly into Gmail / Outlook composer, or to serve at /api/digest.
 *
 * @param data the digest payload from buildDigest()
 * @param dashboardUrl optional absolute URL to a live dashboard, embedded as
 *   the footer call-to-action. Pass an empty string to hide the link entirely.
 */
export function renderDigestHtml(data: DigestData, dashboardUrl: string = ''): string {
  const prevWasZero = data.totals.vsPrevPercent === 0 && data.totals.vsPrevPeriod === 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>AI FinOps · ${escapeHtml(periodLabel(data.period))}</title>
<style>
  /* Email-friendly. Most clients honor a <style> block in <head>, but
     critical rules are duplicated inline below for the holdouts. */
  body { margin: 0; padding: 0; background: #f3f4f6; color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse; }
  a { color: #5b21b6; text-decoration: none; }
  .digest-card { max-width: 640px; margin: 24px auto; background: #ffffff;
    border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
  .digest-header { background: linear-gradient(135deg,#7c3aed 0%, #06b6d4 100%);
    padding: 28px 32px; color: #ffffff; }
  .digest-body { padding: 28px 32px; }
  @media (max-width: 600px) {
    .digest-card { margin: 0; border-radius: 0; border-left: none; border-right: none; }
    .digest-header, .digest-body { padding-left: 20px; padding-right: 20px; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">

<!-- Pre-header: hidden snippet most clients show in the inbox preview. -->
<div style="display:none;max-height:0;overflow:hidden;color:transparent;font-size:1px;line-height:1px">
  Spend ${formatUSD(data.totals.cost)} this period. ${data.topRecommendations[0]?.title ?? ''}
</div>

<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6">
<tr><td align="center" style="padding:24px 12px">

<div class="digest-card" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">

  <!-- Header -->
  <div class="digest-header" style="background:linear-gradient(135deg,#7c3aed 0%, #06b6d4 100%);padding:28px 32px;color:#ffffff">
    <div style="display:block;font-size:13px;font-weight:600;letter-spacing:0.04em;opacity:0.92;margin-bottom:6px">
      <span style="vertical-align:middle">${logoSvg()}</span>
      <span style="vertical-align:middle;margin-left:6px">AI FinOps</span>
    </div>
    <div style="font-size:24px;font-weight:700;line-height:1.2">${escapeHtml(periodLabel(data.period))}</div>
    <div style="margin-top:6px;font-size:13px;opacity:0.92">${escapeHtml(formatRange(data.rangeFrom, data.rangeTo))}</div>
  </div>

  <!-- Body -->
  <div class="digest-body" style="padding:28px 32px">

    <!-- Hero stat -->
    <div style="margin-bottom:24px">
      <div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">
        Total spend
      </div>
      <div style="margin-top:8px;font-size:42px;color:#111827;font-weight:800;line-height:1;font-variant-numeric:tabular-nums">
        ${escapeHtml(formatUSD(data.totals.cost))}
      </div>
      <div style="margin-top:8px;font-size:13px;color:#6b7280">
        ${formatNum(data.totals.calls)} call${data.totals.calls === 1 ? '' : 's'} ·
        ${formatNum(data.totals.tokens)} token${data.totals.tokens === 1 ? '' : 's'}
      </div>
      ${deltaBlock(data.totals.vsPrevPeriod, data.totals.vsPrevPercent, prevWasZero)}
    </div>

    <!-- Top apps -->
    <div style="margin-top:28px">
      <div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">
        Top apps by spend
      </div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#f9fafb">
            <th align="left" style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">App</th>
            <th align="right" style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Cost</th>
            <th align="right" style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Share</th>
          </tr>
        </thead>
        <tbody>${renderTopApps(data.topApps)}</tbody>
      </table>
    </div>

    <!-- Top models -->
    <div style="margin-top:24px">
      <div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">
        Top models by spend
      </div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#f9fafb">
            <th align="left" style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Model</th>
            <th align="right" style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Cost</th>
            <th align="right" style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Calls</th>
          </tr>
        </thead>
        <tbody>${renderTopModels(data.topModels)}</tbody>
      </table>
    </div>

    <!-- Top recommendations -->
    <div style="margin-top:28px">
      <div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">
        Top recommendations
      </div>
      ${renderRecommendations(data.topRecommendations)}
    </div>

    ${renderTopSpenders(data.topSpenders)}

    ${renderAnomalies(data.anomalies)}

    ${renderForecast(data.forecast)}

    <!-- CTA -->
    ${
      dashboardUrl
        ? `<div style="margin-top:32px;text-align:center">
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
          Open full dashboard →
        </a>
      </div>`
        : ''
    }

    <!-- Footer -->
    <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;line-height:1.5">
      Generated by <strong style="color:#374151">AI FinOps</strong>.
      Day boundaries are UTC.
      ${dashboardUrl ? `<br><a href="${escapeHtml(dashboardUrl)}" style="color:#5b21b6">View live dashboard</a>` : ''}
    </div>

  </div>

</div>

</td></tr>
</table>
</body>
</html>`;
}

/**
 * Renders DigestData to a plain-text Markdown representation. Used by the
 * "Copy as Markdown" control on the /digest page, and is useful as a
 * Slack/Teams body where rich HTML is not appropriate.
 */
export function renderDigestMarkdown(data: DigestData): string {
  const lines: string[] = [];
  lines.push(`# AI FinOps · ${periodLabel(data.period)}`);
  lines.push(`_${formatRange(data.rangeFrom, data.rangeTo)}_`);
  lines.push('');
  lines.push(`**Total spend:** ${formatUSD(data.totals.cost)} (${formatNum(data.totals.calls)} calls, ${formatNum(data.totals.tokens)} tokens)`);

  if (!(data.totals.vsPrevPercent === 0 && data.totals.vsPrevPeriod === 0)) {
    const arrow = data.totals.vsPrevPercent > 0 ? '▲' : data.totals.vsPrevPercent < 0 ? '▼' : '·';
    const sign = data.totals.vsPrevPercent > 0 ? '+' : '';
    lines.push(`**vs previous period:** ${arrow} ${sign}${data.totals.vsPrevPercent.toFixed(1)}% (${data.totals.vsPrevPeriod > 0 ? '+' : ''}${formatUSD(data.totals.vsPrevPeriod)})`);
  } else {
    lines.push(`**vs previous period:** no prior data`);
  }

  if (data.topApps.length > 0) {
    lines.push('');
    lines.push('## Top apps');
    for (const a of data.topApps) {
      lines.push(`- **${a.appName}** — ${formatUSD(a.cost)} (${a.pctOfTotal.toFixed(1)}%)`);
    }
  }

  if (data.topModels.length > 0) {
    lines.push('');
    lines.push('## Top models');
    for (const m of data.topModels) {
      lines.push(`- \`${m.model}\` — ${formatUSD(m.cost)} (${formatNum(m.calls)} calls)`);
    }
  }

  if (data.topRecommendations.length > 0) {
    lines.push('');
    lines.push('## Top recommendations');
    for (const r of data.topRecommendations) {
      lines.push(`- ${r.title} — **${formatUSD(r.estimatedMonthlySavings)}/mo** potential${r.affectedCalls > 0 ? `, ${formatNum(r.affectedCalls)} calls affected` : ''}`);
    }
  }

  if (data.anomalies.length > 0) {
    lines.push('');
    lines.push('## Recent anomalies');
    for (const a of data.anomalies) {
      lines.push(`- [${a.severity.toUpperCase()}] ${a.title} (${a.kind}, ${formatDateTime(a.detectedAt)} UTC)`);
    }
  }

  if (data.forecast) {
    lines.push('');
    lines.push(`## End-of-month projection`);
    lines.push(`**${formatUSD(data.forecast.projectedMonthEnd)}** · confidence: ${data.forecast.confidence}`);
  }

  return lines.join('\n');
}
