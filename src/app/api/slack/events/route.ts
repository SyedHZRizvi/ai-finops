// POST /api/slack/events
//
// Slack Events API endpoint. Receives JSON payloads for:
//   1. `url_verification` — one-time handshake when you configure the
//      Event Subscriptions URL on api.slack.com. Slack sends a `challenge`
//      string; we must echo it back. Without this the endpoint can't be
//      saved.
//   2. `event_callback` with `event.type === 'app_mention'` — fires
//      every time a user `@finops`-mentions the bot in a channel the
//      bot has been invited to. We acknowledge with 200 immediately
//      (Slack retries any non-200) and then post the real reply via
//      chat.postMessage using the workspace's stored bot token.
//
// All requests are signed exactly like slash commands; the signature
// must pass before we look at the body. The body is JSON here (vs.
// urlencoded for slash commands), but the signature is over the raw
// bytes of the request — we read with .text() and parse separately so
// the bytes never get mangled.

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackSignature } from '@/lib/slackSign';
import { getInstallation } from '@/lib/slackInstall';
import { computeInsights } from '@/lib/insights';
import { ensurePricingLoaded } from '@/lib/pricing';
import { optimizePrompt } from '@/lib/optimizer';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Minimal Slack event shapes — we inline the bits we touch rather than
// pull in @slack/web-api as a dependency.
interface SlackUrlVerification {
  type: 'url_verification';
  token: string;
  challenge: string;
}

interface SlackEventCallback {
  type: 'event_callback';
  team_id?: string;
  event: SlackEvent;
}

interface SlackEvent {
  type: string;
  user?: string;
  text?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
}

type SlackEnvelope = SlackUrlVerification | SlackEventCallback | { type: string };

function publicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/$/, '');
}

function fmtUSD(value: number): string {
  if (!Number.isFinite(value)) return '$0.00';
  if (Math.abs(value) >= 1000) {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return `$${value.toFixed(2)}`;
}

/**
 * Strip the leading `<@U123>` bot mention so the remaining text is what
 * the user actually typed. Multiple consecutive mentions / whitespace
 * are collapsed.
 */
function stripBotMention(text: string, botUserId: string): string {
  const mentionPattern = new RegExp(`<@${botUserId}(?:\\|[^>]+)?>`, 'g');
  return text.replace(mentionPattern, '').replace(/\s+/g, ' ').trim();
}

/**
 * Decide which canned reply to send based on what the user said.
 * `cost`, `insights`, and `optimize <prompt>` mirror the slash command
 * subset; anything else gets a help blurb.
 */
async function buildMentionReply(userText: string): Promise<string> {
  const trimmed = userText.trim();
  if (!trimmed) {
    return (
      `Hi! I'm AI FinOps. Try one of:\n` +
      `• \`@finops cost\` — 7-day spend summary\n` +
      `• \`@finops insights\` — top recommendations\n` +
      `• \`@finops optimize <prompt>\` — rewrite a prompt and show savings\n` +
      `<${publicBaseUrl()}|Open dashboard →>`
    );
  }

  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
  const rest = trimmed.slice(firstWord.length).trim();

  if (firstWord === 'cost') {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const logs = await prisma.promptLog.findMany({
      where: { timestamp: { gte: since } },
      select: { totalCost: true, callCount: true, model: true },
    });
    let cost = 0;
    let calls = 0;
    const byModel = new Map<string, number>();
    for (const log of logs) {
      const c = log.callCount || 1;
      cost += log.totalCost;
      calls += c;
      byModel.set(log.model, (byModel.get(log.model) ?? 0) + log.totalCost);
    }
    const top = [...byModel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const lines = [
      `*7-day spend:* ${fmtUSD(cost)} across ${calls.toLocaleString('en-US')} calls`,
    ];
    if (top.length > 0) {
      lines.push(
        '*Top models:*',
        ...top.map((m, i) => `${i + 1}. \`${m[0]}\` — ${fmtUSD(m[1])}`),
      );
    }
    lines.push(`<${publicBaseUrl()}|Open dashboard →>`);
    return lines.join('\n');
  }

  if (firstWord === 'insights') {
    await ensurePricingLoaded();
    const insights = await computeInsights('30d');
    const top3 = insights.recommendations.slice(0, 3);
    const lines = [
      `*Projected savings:* ${fmtUSD(insights.projectedSavings.monthly)}/mo  ·  ${insights.projectedSavings.percentReduction.toFixed(1)}% reduction`,
      '',
    ];
    if (top3.length === 0) {
      lines.push('_No recommendations yet — keep logging prompts._');
    } else {
      for (let i = 0; i < top3.length; i++) {
        const r = top3[i];
        lines.push(`*${i + 1}. ${r.title}*  · ${fmtUSD(r.estimatedMonthlySavings)}/mo`);
        lines.push(r.rationale);
        lines.push('');
      }
    }
    lines.push(`<${publicBaseUrl()}/insights|Open insights →>`);
    return lines.join('\n');
  }

  if (firstWord === 'optimize') {
    if (!rest) {
      return 'Usage: `@finops optimize <prompt>` — pass the prompt text you want rewritten.';
    }
    await ensurePricingLoaded();
    const result = optimizePrompt(rest);
    return (
      `*Tokens:* ${result.originalTokens.toLocaleString('en-US')} → ${result.optimizedTokens.toLocaleString('en-US')} ` +
      `(saved ${result.savedTokens.toLocaleString('en-US')}, ${result.savedPercent.toFixed(1)}%)\n` +
      `*Savings/call:* ${fmtUSD(result.estimatedCostSavings)}\n\n` +
      `*Rewritten:*\n\`\`\`${truncate(result.optimizedPrompt, 1800)}\`\`\``
    );
  }

  return (
    `Not sure what you meant by "${truncate(trimmed, 80)}". Try:\n` +
    `• \`@finops cost\` · \`@finops insights\` · \`@finops optimize <prompt>\`\n` +
    `<${publicBaseUrl()}|Open dashboard →>`
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * POST a message to chat.postMessage using the workspace's bot token.
 * Best-effort: errors are swallowed because Slack has already seen our
 * 200 ACK and there's no caller to surface a failure to.
 */
async function postReply(
  accessToken: string,
  channel: string,
  text: string,
  threadTs: string | undefined,
): Promise<void> {
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel,
        text,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      }),
    });
  } catch {
    // Network or DNS error contacting Slack — nothing actionable.
  }
}

/**
 * Handle an app_mention event end-to-end: look up the workspace, build
 * a reply, post it back to the channel. Runs detached from the request
 * so Slack's 200 ACK happens immediately.
 */
async function handleAppMention(teamId: string, event: SlackEvent): Promise<void> {
  if (!event.channel || !event.text) return;
  // Ignore mentions made by bots, including ourselves — otherwise a bot
  // could loop into an infinite back-and-forth.
  if (event.bot_id) return;

  const install = await getInstallation(teamId);
  if (!install) return;

  const userText = stripBotMention(event.text, install.botUserId);

  let reply: string;
  try {
    reply = await buildMentionReply(userText);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    reply = `:warning: AI FinOps couldn't compute that: ${truncate(message, 200)}`;
  }

  await postReply(install.accessToken, event.channel, reply, event.thread_ts);
}

// ---------------------------------------------------------------------
// HTTP entry point
// ---------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    return NextResponse.json({ error: 'Slack not configured' }, { status: 503 });
  }

  const rawBody = await req.text();
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? '';
  const signature = req.headers.get('x-slack-signature') ?? '';

  const valid = await verifySlackSignature({ rawBody, timestamp, signature, signingSecret });
  if (!valid) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let envelope: SlackEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  // 1. URL verification handshake. Must echo the challenge back.
  if (envelope.type === 'url_verification') {
    const verif = envelope as SlackUrlVerification;
    return NextResponse.json({ challenge: verif.challenge });
  }

  // 2. Real events. Ack immediately; do work asynchronously.
  if (envelope.type === 'event_callback') {
    const cb = envelope as SlackEventCallback;
    if (cb.event?.type === 'app_mention' && cb.team_id) {
      // Detached promise. See the same caveat in /api/slack/commands
      // about serverless lifetimes — `waitUntil(...)` is the production
      // upgrade path if Slack reports unanswered mentions.
      void handleAppMention(cb.team_id, cb.event);
    }
    return NextResponse.json({ ok: true });
  }

  // Unknown event types: ACK so Slack doesn't retry.
  return NextResponse.json({ ok: true });
}
