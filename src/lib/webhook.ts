// Outbound webhook dispatcher for anomaly alerts.
//
// Auto-detects the destination format from the URL:
//   https://hooks.slack.com/...                    → Slack incoming webhook
//   https://outlook.office.com/webhook/...         → Teams legacy connector
//   https://*.webhook.office.com/webhookb2/...     → Teams Office 365 connector
//   anything else                                  → generic JSON
//
// Failures NEVER throw. The caller persists the anomaly first; whether the
// webhook lands is a secondary concern. A failed dispatch returns
// { ok: false, status, error } so the caller can record it and the next
// run can retry without losing the original detection.

import type { AnomalyEvent } from '@prisma/client';

export type AnomalyEventRow = AnomalyEvent;

export interface WebhookPayload {
  anomalies: AnomalyEventRow[];
  dashboardUrl: string;
}

export interface WebhookResult {
  ok: boolean;
  status: number;
  error?: string;
}

type Format = 'slack' | 'teams' | 'generic';

const TIMEOUT_MS = 5_000;

// Severity → semantic color, used by Slack attachment bars and Teams cards.
// Slack accepts hex with the leading #, Teams expects the hex without #.
const SEVERITY_HEX: Record<string, string> = {
  info: '#3b82f6', // blue-500
  warn: '#f59e0b', // amber-500
  critical: '#ef4444', // red-500
};

const SEVERITY_EMOJI: Record<string, string> = {
  info: ':information_source:',
  warn: ':warning:',
  critical: ':rotating_light:',
};

function detectFormat(url: string): Format {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'generic';
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'hooks.slack.com') return 'slack';
  if (host === 'outlook.office.com') return 'teams';
  if (host.endsWith('.webhook.office.com') || host === 'webhook.office.com') {
    return 'teams';
  }
  return 'generic';
}

function severityHex(sev: string): string {
  return SEVERITY_HEX[sev] ?? SEVERITY_HEX.info!;
}

function severityRank(sev: string): number {
  if (sev === 'critical') return 3;
  if (sev === 'warn') return 2;
  if (sev === 'info') return 1;
  return 0;
}

function dominantSeverity(anomalies: AnomalyEventRow[]): string {
  let best = 'info';
  let bestRank = 0;
  for (const a of anomalies) {
    const r = severityRank(a.severity);
    if (r > bestRank) {
      bestRank = r;
      best = a.severity;
    }
  }
  return best;
}

function shortDescription(text: string, max = 280): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function buildSlackBody(payload: WebhookPayload): unknown {
  const { anomalies, dashboardUrl } = payload;
  const dominant = dominantSeverity(anomalies);
  const headerEmoji = SEVERITY_EMOJI[dominant] ?? SEVERITY_EMOJI.info;
  const countLabel = anomalies.length === 1 ? '1 anomaly' : `${anomalies.length} anomalies`;

  const attachments = anomalies.map((a) => {
    const detectedAt = a.detectedAt instanceof Date ? a.detectedAt : new Date(a.detectedAt);
    const ts = Math.floor(detectedAt.getTime() / 1000);
    return {
      color: severityHex(a.severity),
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${a.severity.toUpperCase()}* · ${a.title}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: shortDescription(a.description),
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Detected <!date^${ts}^{date_short_pretty} at {time}|${detectedAt.toISOString()}> · kind: \`${a.kind}\``,
            },
          ],
        },
      ],
    };
  });

  return {
    text: `${headerEmoji} AI FinOps: ${countLabel} detected`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `AI FinOps alert: ${countLabel}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${dashboardUrl}|Open the anomaly dashboard →>`,
        },
      },
    ],
    attachments,
  };
}

function buildTeamsBody(payload: WebhookPayload): unknown {
  const { anomalies, dashboardUrl } = payload;
  const dominant = dominantSeverity(anomalies);
  // Teams legacy connector MessageCard format. Color is the hex without "#".
  const themeColor = severityHex(dominant).replace(/^#/, '');
  const countLabel = anomalies.length === 1 ? '1 anomaly' : `${anomalies.length} anomalies`;

  const sections = anomalies.map((a) => {
    const detectedAt = a.detectedAt instanceof Date ? a.detectedAt : new Date(a.detectedAt);
    return {
      activityTitle: `**[${a.severity.toUpperCase()}]** ${a.title}`,
      activitySubtitle: `kind: ${a.kind} · detected ${detectedAt.toISOString()}`,
      text: shortDescription(a.description),
      markdown: true,
    };
  });

  return {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: `AI FinOps alert: ${countLabel}`,
    themeColor,
    title: `AI FinOps alert: ${countLabel}`,
    sections,
    potentialAction: [
      {
        '@type': 'OpenUri',
        name: 'Open dashboard',
        targets: [{ os: 'default', uri: dashboardUrl }],
      },
    ],
  };
}

function buildGenericBody(payload: WebhookPayload): unknown {
  return {
    events: payload.anomalies.map((a) => ({
      id: a.id,
      kind: a.kind,
      severity: a.severity,
      title: a.title,
      description: a.description,
      detectedAt: (a.detectedAt instanceof Date
        ? a.detectedAt
        : new Date(a.detectedAt)
      ).toISOString(),
      scopeKey: a.scopeKey,
      metadata: safeParseMetadata(a.metadata),
    })),
    dashboardUrl: payload.dashboardUrl,
    generatedAt: new Date().toISOString(),
  };
}

function safeParseMetadata(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function dispatchWebhook(
  url: string,
  payload: WebhookPayload,
): Promise<WebhookResult> {
  if (!url || payload.anomalies.length === 0) {
    return { ok: false, status: 0, error: 'no url or no anomalies' };
  }

  const format = detectFormat(url);
  const body =
    format === 'slack'
      ? buildSlackBody(payload)
      : format === 'teams'
        ? buildTeamsBody(payload)
        : buildGenericBody(payload);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Webhooks from a server-side caller don't have a useful Referer/Origin,
      // and some providers reject when one is supplied. Leave defaults.
    });

    // Slack returns 200 + "ok" body, Teams returns 200, generic varies.
    // We trust any 2xx as success — the body shape is irrelevant for us
    // since we don't act on the response.
    if (res.ok) {
      return { ok: true, status: res.status };
    }
    // Try to surface why; many webhook providers return a useful text body
    // (Slack: "invalid_payload", Teams: "Webhook message delivery failed").
    let errText = '';
    try {
      errText = (await res.text()).slice(0, 300);
    } catch {
      errText = '';
    }
    return { ok: false, status: res.status, error: errText || `HTTP ${res.status}` };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    const message = aborted
      ? `timeout after ${TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message
        : 'network error';
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}
