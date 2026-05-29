/**
 * Email body templates. One function per email type. Each returns the three
 * pieces every transport in `src/lib/mailer.ts` consumes: `subject`, `html`,
 * `text`.
 *
 * Why every template ships a plain-text version:
 *   - A material fraction of corporate Outlook installs render plain-text by
 *     default (especially security-conscious orgs).
 *   - Spam filters score "HTML-only" emails harshly. Including a text/plain
 *     part lowers our score and improves inbox placement.
 *   - Screen readers, low-bandwidth links, and `mutt` users exist.
 *
 * HTML constraints:
 *   - Inline styles only. Email clients strip <style> blocks (some keep them
 *     but rewrite class names). The single source of truth for styling is
 *     the inline `style="…"` attribute on each element.
 *   - Table-based layout for the outer envelope. Outlook (especially the
 *     desktop Word-engine renderer) treats <div> margins inconsistently;
 *     <table cellpadding cellspacing> is the lowest-common-denominator that
 *     actually works.
 *   - No external assets. <img src="https://…"> gets blocked by default in
 *     most enterprise mail clients. Icons are emoji or inline SVG.
 */

import { renderDigestHtml } from '@/lib/digestHtml';
import type { DigestData } from '@/lib/digest';
import type { AnomalyEvent } from '@prisma/client';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Shared outer envelope for non-digest emails. The digest has its own,
 * richer layout (see digestHtml.ts). Other emails — magic-link, welcome,
 * anomaly — share this simpler envelope so the brand stays consistent
 * without re-implementing tables N times.
 *
 * `bodyHtml` should be plain block-level HTML, no surrounding <html>/<body>.
 * `preheader` is the hidden inbox-preview snippet.
 */
function wrapEnvelope(opts: { title: string; preheader: string; bodyHtml: string }): string {
  const { title, preheader, bodyHtml } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">

<!-- Pre-header: hidden snippet most clients show in the inbox preview. -->
<div style="display:none;max-height:0;overflow:hidden;color:transparent;font-size:1px;line-height:1px">
  ${escapeHtml(preheader)}
</div>

<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6">
<tr><td align="center" style="padding:24px 12px">

<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,#7c3aed 0%, #06b6d4 100%);padding:24px 32px;color:#ffffff">
    <div style="font-size:13px;font-weight:600;letter-spacing:0.04em;opacity:0.92">
      <span style="vertical-align:middle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg></span>
      <span style="vertical-align:middle;margin-left:6px">AI FinOps</span>
    </div>
  </td></tr>
  <tr><td style="padding:28px 32px">
    ${bodyHtml}
  </td></tr>
  <tr><td style="padding:14px 32px 22px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.5;text-align:center">
    This message was sent by AI FinOps.
  </td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}

/**
 * Magic-link sign-in email. Single CTA, plain language, no upsell. The
 * "didn't request this?" reassurance line is important — it dramatically
 * reduces support tickets when an attacker probes random emails.
 */
export function magicLinkEmail(email: string, link: string): EmailTemplate {
  const subject = 'Your AI FinOps sign-in link';
  const preheader = 'Click the button below to sign in. The link expires in 15 minutes.';

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827">Sign in to AI FinOps</h1>
    <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6">
      Click the button below to sign in as
      <span style="font-weight:600;color:#111827">${escapeHtml(email)}</span>.
      This link will expire in 15 minutes and can be used only once.
    </p>
    <div style="margin:24px 0;text-align:center">
      <a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 28px;background:#7c3aed;color:#ffffff;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none">
        Sign in to AI FinOps
      </a>
    </div>
    <p style="margin:18px 0 8px;font-size:13px;color:#6b7280;line-height:1.6">
      Or copy and paste this URL into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:12px;color:#374151;word-break:break-all;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;font-family:'SFMono-Regular',Menlo,Consolas,monospace">
      ${escapeHtml(link)}
    </p>
    <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">
      Didn't request this? You can safely ignore this email — your account
      stays untouched.
    </p>
  `;

  const html = wrapEnvelope({ title: subject, preheader, bodyHtml });

  // Plain-text variant. Many corporate Outlook clients render text/plain by
  // default; the link must be a bare URL on its own line so they hyperlink
  // it automatically.
  const text = [
    'Sign in to AI FinOps',
    '',
    `Click the link below to sign in as ${email}.`,
    'This link expires in 15 minutes and can only be used once.',
    '',
    link,
    '',
    "Didn't request this? You can safely ignore this email.",
    '',
    '— AI FinOps',
  ].join('\n');

  return { subject, html, text };
}

/**
 * Weekly digest email. Wraps the existing `renderDigestHtml` output — the
 * digest HTML is already a complete `<html>` document, so we use it as the
 * full body rather than embedding it inside our standard envelope.
 *
 * The subject pulls in the cost number so it lands well in inbox previews
 * ("AI FinOps — $1,243 this week").
 */
export function weeklyDigestEmail(digestData: DigestData, dashboardUrl: string = ''): EmailTemplate {
  const periodLabel =
    digestData.period === 'daily'
      ? 'today'
      : digestData.period === 'monthly'
        ? 'this month'
        : 'this week';

  const costStr = formatUSD(digestData.totals.cost);
  const subject = `AI FinOps — ${costStr} ${periodLabel}`;
  // The digest HTML already has its own structure including pre-headers.
  const html = renderDigestHtml(digestData, dashboardUrl);

  // Plain-text version of the digest's headline numbers. Useful for clients
  // that strip HTML and for the dev console transport's truncated preview.
  const text = [
    `AI FinOps · ${capitalize(periodLabel)}`,
    '',
    `Total spend: ${costStr}`,
    `Calls: ${digestData.totals.calls.toLocaleString('en-US')}`,
    `Tokens: ${digestData.totals.tokens.toLocaleString('en-US')}`,
    digestData.totals.vsPrevPercent !== 0 || digestData.totals.vsPrevPeriod !== 0
      ? `vs previous: ${digestData.totals.vsPrevPercent > 0 ? '+' : ''}${digestData.totals.vsPrevPercent.toFixed(1)}%`
      : 'vs previous: no prior data',
    '',
    digestData.topRecommendations.length > 0
      ? `Top recommendation: ${digestData.topRecommendations[0]!.title}`
      : 'No actionable recommendations this period.',
    '',
    dashboardUrl ? `View live dashboard: ${dashboardUrl}` : '',
  ]
    .filter((l) => l !== '')
    .join('\n');

  return { subject, html, text };
}

/**
 * Anomaly alert email. Mirrors the content of the Slack/Teams webhook payload
 * for parity — if the operator already configured a webhook channel, the
 * email is the same story in a different envelope.
 */
export function anomalyAlertEmail(anomaly: AnomalyEvent, dashboardUrl: string = ''): EmailTemplate {
  const severity = anomaly.severity.toLowerCase();
  const sevColor = severity === 'critical' ? '#b91c1c' : severity === 'warn' ? '#b45309' : '#1d4ed8';
  const sevBg = severity === 'critical' ? '#fef2f2' : severity === 'warn' ? '#fffbeb' : '#eff6ff';

  const subject = `[${anomaly.severity.toUpperCase()}] AI FinOps anomaly: ${truncateForSubject(anomaly.title)}`;
  const preheader = `${anomaly.severity.toUpperCase()} · ${anomaly.kind}: ${anomaly.title}`;
  const detectedAt = anomaly.detectedAt instanceof Date ? anomaly.detectedAt : new Date(anomaly.detectedAt);

  const bodyHtml = `
    <div style="display:inline-block;padding:4px 10px;border-radius:6px;background:${sevBg};color:${sevColor};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:14px">
      ${escapeHtml(anomaly.severity)} · ${escapeHtml(anomaly.kind)}
    </div>
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;line-height:1.3">
      ${escapeHtml(anomaly.title)}
    </h1>
    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6">
      ${escapeHtml(anomaly.description)}
    </p>
    <div style="margin:20px 0;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;color:#6b7280;line-height:1.7">
      <div><strong style="color:#374151">Detected:</strong> ${escapeHtml(detectedAt.toISOString())}</div>
      <div><strong style="color:#374151">Kind:</strong> ${escapeHtml(anomaly.kind)}</div>
      ${anomaly.scopeKey ? `<div><strong style="color:#374151">Scope:</strong> ${escapeHtml(anomaly.scopeKey)}</div>` : ''}
    </div>
    ${
      dashboardUrl
        ? `<div style="margin:24px 0;text-align:center">
        <a href="${escapeHtml(dashboardUrl)}/anomaly" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
          View in dashboard →
        </a>
      </div>`
        : ''
    }
  `;

  const html = wrapEnvelope({ title: subject, preheader, bodyHtml });

  const text = [
    `[${anomaly.severity.toUpperCase()}] AI FinOps anomaly`,
    '',
    anomaly.title,
    '',
    anomaly.description,
    '',
    `Kind: ${anomaly.kind}`,
    `Detected: ${detectedAt.toISOString()}`,
    anomaly.scopeKey ? `Scope: ${anomaly.scopeKey}` : '',
    '',
    dashboardUrl ? `Dashboard: ${dashboardUrl}/anomaly` : '',
  ]
    .filter((l) => l !== '')
    .join('\n');

  return { subject, html, text };
}

/**
 * Welcome email — sent on first magic-link login. Short and useful: explain
 * the next two clicks the user should make. We deliberately don't include a
 * sign-in link in this email; the user is already signed in by the time we
 * dispatch it.
 */
export function welcomeEmail(email: string, dashboardUrl: string = ''): EmailTemplate {
  const subject = 'Welcome to AI FinOps';
  const preheader = "Here's how to get the most out of your dashboard in the next five minutes.";

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827">Welcome to AI FinOps</h1>
    <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6">
      You're signed in as <span style="font-weight:600;color:#111827">${escapeHtml(email)}</span>.
      Here's what to do next:
    </p>
    <ol style="margin:0 0 22px;padding-left:22px;font-size:14px;color:#374151;line-height:1.7">
      <li style="margin-bottom:8px"><strong style="color:#111827">Connect a provider.</strong> Drop in an Anthropic or OpenAI admin key under Settings → Credentials, or wrap SDK calls with our <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:12px">withLogging()</code> helper.</li>
      <li style="margin-bottom:8px"><strong style="color:#111827">Set a budget.</strong> Define a monthly cap so you get alerted when you cross 75% / 90% / 100%.</li>
      <li><strong style="color:#111827">Configure a webhook.</strong> Anomaly alerts land in Slack or Teams the moment they're detected — same story will land in your inbox.</li>
    </ol>
    ${
      dashboardUrl
        ? `<div style="margin:24px 0 8px;text-align:center">
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
          Open dashboard →
        </a>
      </div>`
        : ''
    }
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6">
      Reply to this email if you hit a snag — a human reads every reply.
    </p>
  `;

  const html = wrapEnvelope({ title: subject, preheader, bodyHtml });

  const text = [
    'Welcome to AI FinOps',
    '',
    `You're signed in as ${email}.`,
    '',
    "Here's what to do next:",
    '  1. Connect a provider (Settings → Credentials, or wrap SDK calls).',
    '  2. Set a monthly budget so you get alerts at 75/90/100%.',
    '  3. Configure a webhook for anomaly alerts in Slack or Teams.',
    '',
    dashboardUrl ? `Dashboard: ${dashboardUrl}` : '',
    '',
    'Reply to this email if you hit a snag.',
    '',
    '— AI FinOps',
  ]
    .filter((l) => l !== '')
    .join('\n');

  return { subject, html, text };
}

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}

/**
 * Subject lines longer than ~70 chars get truncated by most inbox clients;
 * the truncation point varies but if we keep it under 60 we're safe. The
 * severity prefix consumes ~12 chars, leaving room for ~45 of the title.
 */
function truncateForSubject(s: string, max = 60): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
