// POST /api/slack/commands
//
// Handles `/finops <subcommand>` slash commands from any installed
// workspace. Slack POSTs application/x-www-form-urlencoded bodies and
// signs them with HMAC-SHA256 (verified against SLACK_SIGNING_SECRET).
//
// Slack's contract: respond with an HTTP 200 within 3 seconds, or the
// user sees "operation_timeout". Heavy work (stats lookups, optimizer
// runs) often takes longer than that, so we follow Slack's prescribed
// pattern:
//
//   1. Verify the signature.
//   2. Immediately return an ephemeral "Working on it..." reply.
//   3. In a deferred (best-effort) promise, compute the real answer and
//      POST it to the `response_url` Slack provided. That URL accepts
//      the same block-kit payload shape as the immediate reply.
//
// Subcommands implemented:
//   cost [period]      → totals + by-model summary for 24h/7d/30d/all
//   insights           → top 3 recommendations, projected savings
//   optimize <prompt>  → run optimizer, show savings + rewrite
//   anomalies          → unresolved critical anomalies
//   digest             → link to /digest
//   help, (empty)      → command list

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifySlackSignature } from '@/lib/slackSign';
import { computeInsights } from '@/lib/insights';
import { ensurePricingLoaded } from '@/lib/pricing';
import { optimizePrompt } from '@/lib/optimizer';
import type { Recommendation } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Slack block-kit shapes we actually use. Kept inlined so we don't have
// to pull in @slack/web-api just for the type definitions.
type SlackBlock =
  | { type: 'header'; text: { type: 'plain_text'; text: string; emoji?: boolean } }
  | { type: 'section'; text: { type: 'mrkdwn'; text: string }; fields?: { type: 'mrkdwn'; text: string }[] }
  | { type: 'divider' }
  | { type: 'context'; elements: { type: 'mrkdwn'; text: string }[] };

interface SlackReply {
  response_type: 'in_channel' | 'ephemeral';
  text?: string;
  blocks?: SlackBlock[];
}

interface SlashCommandFields {
  teamId: string | null;
  userId: string | null;
  channelId: string | null;
  command: string | null;
  text: string;
  responseUrl: string | null;
}

type Period = '24h' | '7d' | '30d' | 'all';
const PERIOD_VALUES: readonly Period[] = ['24h', '7d', '30d', 'all'] as const;

function isPeriod(value: string): value is Period {
  return (PERIOD_VALUES as readonly string[]).includes(value);
}

function periodSince(period: Period): Date | null {
  const now = Date.now();
  if (period === '24h') return new Date(now - 24 * 60 * 60 * 1000);
  if (period === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (period === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return null;
}

function fmtUSD(value: number): string {
  if (!Number.isFinite(value)) return '$0.00';
  if (Math.abs(value) >= 1000) {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return `$${value.toFixed(2)}`;
}

function fmtNum(value: number): string {
  return value.toLocaleString('en-US');
}

function publicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/$/, '');
}

// ---------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------

function parseFields(rawBody: string): SlashCommandFields {
  const params = new URLSearchParams(rawBody);
  return {
    teamId: params.get('team_id'),
    userId: params.get('user_id'),
    channelId: params.get('channel_id'),
    command: params.get('command'),
    text: (params.get('text') ?? '').trim(),
    responseUrl: params.get('response_url'),
  };
}

// ---------------------------------------------------------------------
// Subcommand renderers — pure functions, no Slack I/O
// ---------------------------------------------------------------------

function helpReply(): SlackReply {
  const lines: string[] = [
    '*AI FinOps* — available commands:',
    '',
    '• `/finops cost [24h|7d|30d|all]` — spend summary for the period (default 7d)',
    '• `/finops insights` — top recommendations + projected savings',
    '• `/finops optimize <prompt>` — rewrite a prompt and show savings',
    '• `/finops anomalies` — unresolved critical anomalies',
    '• `/finops digest` — link to the latest weekly digest',
    '• `/finops help` — this message',
    '',
    `<${publicBaseUrl()}|Open the dashboard →>`,
  ];
  return {
    response_type: 'ephemeral',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'AI FinOps commands', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    ],
  };
}

async function costReply(period: Period): Promise<SlackReply> {
  const since = periodSince(period);
  const where = since ? { timestamp: { gte: since } } : {};
  const logs = await prisma.promptLog.findMany({
    where,
    select: {
      model: true,
      totalCost: true,
      totalTokens: true,
      callCount: true,
    },
  });

  let totalCalls = 0;
  let totalCost = 0;
  let totalTokens = 0;
  const byModel = new Map<string, { calls: number; cost: number }>();
  for (const log of logs) {
    const c = log.callCount || 1;
    totalCalls += c;
    totalCost += log.totalCost;
    totalTokens += log.totalTokens;
    const cur = byModel.get(log.model) ?? { calls: 0, cost: 0 };
    cur.calls += c;
    cur.cost += log.totalCost;
    byModel.set(log.model, cur);
  }

  const top = [...byModel.entries()]
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 5);

  const fields: { type: 'mrkdwn'; text: string }[] = [
    { type: 'mrkdwn', text: `*Calls:*\n${fmtNum(totalCalls)}` },
    { type: 'mrkdwn', text: `*Tokens:*\n${fmtNum(totalTokens)}` },
    { type: 'mrkdwn', text: `*Total cost:*\n${fmtUSD(totalCost)}` },
    {
      type: 'mrkdwn',
      text: `*Avg per call:*\n${totalCalls > 0 ? fmtUSD(totalCost / totalCalls) : fmtUSD(0)}`,
    },
  ];

  const modelLines =
    top.length === 0
      ? '_No data in this period._'
      : top
          .map(
            ([model, v], i) =>
              `${i + 1}. \`${model}\` — ${fmtUSD(v.cost)} (${fmtNum(v.calls)} calls)`,
          )
          .join('\n');

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `AI FinOps cost — ${period}`, emoji: true },
    },
    { type: 'section', text: { type: 'mrkdwn', text: ' ' }, fields },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Top models by cost*\n${modelLines}` },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `<${publicBaseUrl()}|Open dashboard →>` },
      ],
    },
  ];

  return { response_type: 'ephemeral', blocks };
}

async function insightsReply(): Promise<SlackReply> {
  await ensurePricingLoaded();
  const insights = await computeInsights('30d');
  const top3: Recommendation[] = insights.recommendations.slice(0, 3);

  const recsText =
    top3.length === 0
      ? '_No recommendations yet — keep logging prompts and check back._'
      : top3
          .map(
            (r, i) =>
              `*${i + 1}. ${r.title}*  · ${fmtUSD(r.estimatedMonthlySavings)}/mo\n${r.rationale}`,
          )
          .join('\n\n');

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'AI FinOps — insights', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: ' ' },
      fields: [
        {
          type: 'mrkdwn',
          text: `*Projected savings:*\n${fmtUSD(insights.projectedSavings.monthly)}/mo`,
        },
        {
          type: 'mrkdwn',
          text: `*Annualized:*\n${fmtUSD(insights.projectedSavings.annual)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Reduction:*\n${insights.projectedSavings.percentReduction.toFixed(1)}%`,
        },
        {
          type: 'mrkdwn',
          text: `*30-day spend:*\n${fmtUSD(insights.totals.cost)}`,
        },
      ],
    },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: recsText } },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `<${publicBaseUrl()}/insights|Open insights →>` },
      ],
    },
  ];

  return { response_type: 'ephemeral', blocks };
}

async function optimizeReply(prompt: string): Promise<SlackReply> {
  if (!prompt) {
    return {
      response_type: 'ephemeral',
      text: 'Usage: `/finops optimize <prompt>` — pass the prompt text you want rewritten.',
    };
  }
  await ensurePricingLoaded();
  const result = optimizePrompt(prompt);
  const savings = result.savedTokens > 0 ? result.savedPercent.toFixed(1) : '0';

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'AI FinOps — optimize', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: ' ' },
      fields: [
        {
          type: 'mrkdwn',
          text: `*Tokens before:*\n${fmtNum(result.originalTokens)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Tokens after:*\n${fmtNum(result.optimizedTokens)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Saved:*\n${fmtNum(result.savedTokens)} (${savings}%)`,
        },
        {
          type: 'mrkdwn',
          text: `*Per-call savings:*\n${fmtUSD(result.estimatedCostSavings)}`,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Rewritten prompt:*\n\`\`\`${truncate(result.optimizedPrompt, 1800)}\`\`\``,
      },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `<${publicBaseUrl()}/optimizer|Open optimizer →>` },
      ],
    },
  ];

  return { response_type: 'ephemeral', blocks };
}

async function anomaliesReply(): Promise<SlackReply> {
  // Show unresolved critical + warn from the last 7 days. Critical first.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.anomalyEvent.findMany({
    where: {
      resolvedAt: null,
      detectedAt: { gte: since },
      severity: { in: ['critical', 'warn'] },
    },
    orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
    take: 10,
  });

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'AI FinOps — open anomalies', emoji: true },
    },
  ];

  if (rows.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No unresolved anomalies in the last 7 days._' },
    });
  } else {
    const text = rows
      .map((a) => {
        const tag = a.severity === 'critical' ? ':rotating_light: *CRIT*' : ':warning: *WARN*';
        return `${tag} · *${a.title}*\n${truncate(a.description, 280)}`;
      })
      .join('\n\n');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text } });
  }

  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `<${publicBaseUrl()}/anomaly|Open alerts →>` },
    ],
  });

  return { response_type: 'ephemeral', blocks };
}

function digestReply(): SlackReply {
  const url = `${publicBaseUrl()}/digest`;
  return {
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'AI FinOps — digest', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Weekly cost digest with totals, top spenders, anomalies, and recommendations.\n<${url}|Open digest →>`,
        },
      },
    ],
  };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------

async function buildReply(text: string): Promise<SlackReply> {
  // Slack passes the full text verbatim. First word = subcommand, rest = args.
  const trimmed = text.trim();
  if (!trimmed) return helpReply();

  const spaceAt = trimmed.indexOf(' ');
  const sub = (spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt)).toLowerCase();
  const rest = spaceAt === -1 ? '' : trimmed.slice(spaceAt + 1).trim();

  if (sub === 'help' || sub === '?') return helpReply();

  if (sub === 'cost') {
    const periodArg = rest.split(/\s+/)[0]?.toLowerCase() ?? '';
    const period: Period = isPeriod(periodArg) ? periodArg : '7d';
    return costReply(period);
  }

  if (sub === 'insights') return insightsReply();
  if (sub === 'optimize') return optimizeReply(rest);
  if (sub === 'anomalies' || sub === 'alerts') return anomaliesReply();
  if (sub === 'digest') return digestReply();

  return {
    response_type: 'ephemeral',
    text: `Unknown subcommand: \`${sub}\`. Try \`/finops help\`.`,
  };
}

/**
 * Dispatch the slow work and post the result to response_url. Never
 * throws — Slack already saw our 200, so any error here just means the
 * user gets a fallback "couldn't compute" message in their channel.
 */
async function deferredDispatch(text: string, responseUrl: string): Promise<void> {
  let reply: SlackReply;
  try {
    reply = await buildReply(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    reply = {
      response_type: 'ephemeral',
      text: `:warning: AI FinOps failed: ${truncate(message, 200)}`,
    };
  }

  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // `replace_original: false` means "don't touch the working...
        // message, add a follow-up". For ephemeral replies Slack does
        // this implicitly; we set it explicitly for clarity.
        replace_original: 'true',
        ...reply,
      }),
    });
  } catch {
    // Network error contacting Slack — nothing actionable. Logging at
    // info-level would help operators; we keep this silent for now.
  }
}

// ---------------------------------------------------------------------
// HTTP entry point
// ---------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    return NextResponse.json(
      {
        response_type: 'ephemeral',
        text: ':warning: AI FinOps Slack app is not configured. Ask an admin to set SLACK_SIGNING_SECRET.',
      },
      { status: 503 },
    );
  }

  // We must read the body as text (not .formData()) so the exact bytes
  // are available for the signature check. Re-parsing into form fields
  // is cheap and never mutates the source string.
  const rawBody = await req.text();
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? '';
  const signature = req.headers.get('x-slack-signature') ?? '';

  const valid = await verifySlackSignature({ rawBody, timestamp, signature, signingSecret });
  if (!valid) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const fields = parseFields(rawBody);
  if (!fields.responseUrl) {
    // Without a response_url we can't defer. Fall back to synchronous —
    // best-effort, may time out on heavy commands but no other option.
    const reply = await buildReply(fields.text);
    return NextResponse.json(reply);
  }

  // Kick off the heavy work without awaiting it. Returning the 200
  // immediately is what keeps us under Slack's 3-second budget.
  //
  // Note: in serverless environments (Vercel), unawaited promises can be
  // terminated when the function returns. For production deployments
  // that hit this risk, swap to `waitUntil(deferredDispatch(...))` from
  // `@vercel/functions` — until then, the dispatch usually completes
  // before the runtime is reclaimed for typical sub-5s queries.
  void deferredDispatch(fields.text, fields.responseUrl);

  return NextResponse.json({
    response_type: 'ephemeral',
    text: ':hourglass_flowing_sand: Working on it…',
  } satisfies SlackReply);
}
