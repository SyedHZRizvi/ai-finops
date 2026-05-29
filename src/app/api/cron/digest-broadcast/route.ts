// Vercel-cron-driven weekly digest broadcast.
//
// Cadence: Monday 14:00 UTC. The digest is the email/Slack surface for
// AI FinOps — execs don't open the dashboard every day, but they will
// read a weekly summary in Slack.
//
// Distribution model:
//
//   * Every active `Budget` row with a non-empty `webhookUrl` is a
//     destination. This is the same column we use for anomaly webhooks,
//     so operators only configure once.
//   * A global Setting row with key='digest_webhook_urls' may store a
//     JSON-array string of additional destination URLs (CFO/CTO inboxes,
//     a #finops Slack channel, etc.). Schema-less so we don't need a
//     migration for what's effectively a tiny config blob.
//   * URLs are deduped across the two sources.
//
// Payload selection per destination:
//
//   * Slack/Teams (URLs auto-detected by hostname): send a compact
//     summary message (markdown for Slack via the `text` field, plain
//     for Teams) with a link to the live /digest page. Rendered HTML
//     would not display correctly in those clients.
//   * Generic webhook: send TWO POSTs in sequence to the same URL —
//       1. application/json with the full DigestData payload (machines
//          parse this for downstream pipelines)
//       2. text/html with the rendered email body (humans / inbox
//          relays render this)
//     The two-POST design is documented in the response: each counts
//     toward dispatched/failures independently.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildDigest, type DigestData } from '@/lib/digest';
import { renderDigestHtml, renderDigestMarkdown } from '@/lib/digestHtml';
import { verifyCronAuth } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DIGEST_URLS_SETTING_KEY = 'digest_webhook_urls';
const WEBHOOK_TIMEOUT_MS = 8_000;

type WebhookFormat = 'slack' | 'teams' | 'generic';

interface CronDigestResponse {
  generatedAt: string;
  dispatched: number;
  failures: number;
}

function trimSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function getBaseUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL;
  if (fromEnv && fromEnv.length > 0) return trimSlash(fromEnv);
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

function detectFormat(url: string): WebhookFormat {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'generic';
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'hooks.slack.com') return 'slack';
  if (host === 'outlook.office.com') return 'teams';
  if (host.endsWith('.webhook.office.com') || host === 'webhook.office.com') return 'teams';
  return 'generic';
}

async function loadSettingUrls(): Promise<string[]> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: DIGEST_URLS_SETTING_KEY },
      select: { value: true },
    });
    if (!row) return [];
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    const urls: string[] = [];
    for (const v of parsed) {
      if (typeof v === 'string' && v.trim().length > 0) urls.push(v.trim());
    }
    return urls;
  } catch (err) {
    // Malformed JSON or DB error — surface, don't crash.
    // eslint-disable-next-line no-console
    console.warn(
      `[cron/digest-broadcast] failed to load Setting[${DIGEST_URLS_SETTING_KEY}]:`,
      err,
    );
    return [];
  }
}

async function loadBudgetUrls(): Promise<string[]> {
  const rows = await prisma.budget.findMany({
    where: { isActive: true, NOT: { webhookUrl: null } },
    select: { webhookUrl: true },
  });
  const urls: string[] = [];
  for (const r of rows) {
    if (r.webhookUrl && r.webhookUrl.trim().length > 0) {
      urls.push(r.webhookUrl.trim());
    }
  }
  return urls;
}

function buildSlackPayload(
  digest: DigestData,
  digestPageUrl: string,
): { body: unknown } {
  // Slack `text` is markdown-rendered when the channel is configured for
  // mrkdwn (default). We keep the body short — the link to /digest is
  // load-bearing because email-style HTML won't render here.
  const md = renderDigestMarkdown(digest);
  // Slack mrkdwn doesn't support `#` headers; convert to bold. We do this
  // inline rather than introducing a separate Slack renderer.
  const slackText = md.replace(/^#{1,6}\s*(.+)$/gm, '*$1*');
  const linkLine = digestPageUrl
    ? `\n\n<${digestPageUrl}|Open the full digest →>`
    : '';
  return {
    body: {
      text: `${slackText}${linkLine}`,
    },
  };
}

function buildTeamsPayload(
  digest: DigestData,
  digestPageUrl: string,
): { body: unknown } {
  const md = renderDigestMarkdown(digest);
  return {
    body: {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: 'AI FinOps weekly digest',
      title: 'AI FinOps weekly digest',
      text: md,
      ...(digestPageUrl
        ? {
            potentialAction: [
              {
                '@type': 'OpenUri',
                name: 'Open full digest',
                targets: [{ os: 'default', uri: digestPageUrl }],
              },
            ],
          }
        : {}),
    },
  };
}

interface DispatchOutcome {
  url: string;
  contentType: string;
  ok: boolean;
  status: number;
  error?: string;
}

async function postWith(
  url: string,
  contentType: string,
  body: string,
): Promise<DispatchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
      signal: controller.signal,
    });
    if (res.ok) {
      return { url, contentType, ok: true, status: res.status };
    }
    let errText = '';
    try {
      errText = (await res.text()).slice(0, 300);
    } catch {
      errText = '';
    }
    return {
      url,
      contentType,
      ok: false,
      status: res.status,
      error: errText || `HTTP ${res.status}`,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    const message = aborted
      ? `timeout after ${WEBHOOK_TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message
        : 'network error';
    return { url, contentType, ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<CronDigestResponse | { error: string }>> {
  const startedAt = Date.now();
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[cron/digest-broadcast] auth denied: ${auth.reason}`);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line no-console
  console.log('[cron/digest-broadcast] start');

  const generatedAt = new Date();

  let digest: DigestData;
  try {
    digest = await buildDigest('weekly', generatedAt);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to build digest';
    // eslint-disable-next-line no-console
    console.error(`[cron/digest-broadcast] buildDigest failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const [budgetUrls, settingUrls] = await Promise.all([
    loadBudgetUrls(),
    loadSettingUrls(),
  ]);

  const unique = new Set<string>();
  for (const u of budgetUrls) unique.add(u);
  for (const u of settingUrls) unique.add(u);

  if (unique.size === 0) {
    const elapsedMs = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.log(
      `[cron/digest-broadcast] done destinations=0 dispatched=0 failures=0 elapsedMs=${elapsedMs}`,
    );
    return NextResponse.json({
      generatedAt: generatedAt.toISOString(),
      dispatched: 0,
      failures: 0,
    });
  }

  const baseUrl = getBaseUrl(req);
  const digestPageUrl = baseUrl ? `${baseUrl}/digest` : '';

  // Pre-render once; each URL reads the cached result.
  const htmlBody = renderDigestHtml(digest, baseUrl);
  const jsonBody = JSON.stringify(digest);

  // Build per-URL request plans, then fire in parallel. Each URL may
  // generate one or two requests depending on format.
  const plans: Array<{ url: string; format: WebhookFormat }> = [];
  for (const url of unique) {
    plans.push({ url, format: detectFormat(url) });
  }

  const outcomes: DispatchOutcome[] = [];
  await Promise.all(
    plans.map(async (plan) => {
      if (plan.format === 'slack') {
        const { body } = buildSlackPayload(digest, digestPageUrl);
        outcomes.push(
          await postWith(plan.url, 'application/json', JSON.stringify(body)),
        );
        return;
      }
      if (plan.format === 'teams') {
        const { body } = buildTeamsPayload(digest, digestPageUrl);
        outcomes.push(
          await postWith(plan.url, 'application/json', JSON.stringify(body)),
        );
        return;
      }
      // Generic: send both the structured JSON (for pipelines/zaps) and
      // the rendered HTML (for inbox relays / email gateways). Each call
      // counts as one dispatch for the response totals.
      const jsonOutcome = await postWith(plan.url, 'application/json', jsonBody);
      outcomes.push(jsonOutcome);
      const htmlOutcome = await postWith(plan.url, 'text/html; charset=utf-8', htmlBody);
      outcomes.push(htmlOutcome);
    }),
  );

  const dispatched = outcomes.filter((o) => o.ok).length;
  const failures = outcomes.filter((o) => !o.ok).length;

  // Log failures with enough context to debug, but never echo full
  // webhook URLs in case they contain secrets — the host is plenty.
  for (const o of outcomes) {
    if (o.ok) continue;
    let host = '<unparsable>';
    try {
      host = new URL(o.url).host;
    } catch {
      /* keep placeholder */
    }
    // eslint-disable-next-line no-console
    console.error(
      `[cron/digest-broadcast] dispatch failed host=${host} contentType=${o.contentType} status=${o.status} error=${o.error ?? ''}`,
    );
  }

  const elapsedMs = Date.now() - startedAt;
  // eslint-disable-next-line no-console
  console.log(
    `[cron/digest-broadcast] done destinations=${unique.size} dispatched=${dispatched} failures=${failures} elapsedMs=${elapsedMs}`,
  );

  return NextResponse.json({
    generatedAt: generatedAt.toISOString(),
    dispatched,
    failures,
  });
}
