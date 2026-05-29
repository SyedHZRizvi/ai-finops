/**
 * Generic outbound email sender.
 *
 * Why this module exists:
 *   AI FinOps has historically shipped webhook-only outbound (Slack, Teams).
 *   For execs who don't live in chat, email is the only mode that lands. This
 *   module is the single seam through which every outbound email flows —
 *   magic-link sign-ins, weekly digests, anomaly alerts, welcome notes.
 *
 * Design constraints:
 *   1. NO new npm dependencies. Resend and SendGrid both expose plain REST
 *      endpoints; we hit them with built-in fetch. The 'smtp' transport is a
 *      placeholder that would require nodemailer — we return a friendly
 *      ok:false rather than pulling in the dep.
 *   2. NEVER throw. A mailer that crashes the request that triggered it
 *      defeats the whole point. Every failure path returns
 *      `{ ok: false, error }`.
 *   3. SAFE DEFAULT. With no env config, fall back to a 'console' transport
 *      that pretty-prints the message — devs never have to set up SMTP just
 *      to click around locally.
 *   4. Edge-runtime hostile. We deliberately use `Buffer` + Node fetch; the
 *      API routes that call this module run on the Node runtime, not the
 *      Vercel Edge runtime. Don't move it.
 */

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export type MailerTransport = 'resend' | 'sendgrid' | 'smtp' | 'console';

export interface MailerConfig {
  from: string;
  transport: MailerTransport;
  /** Provider API key — required for resend / sendgrid. */
  apiKey?: string;
  /** Full SMTP URL like "smtps://user:pass@host:port". Placeholder only. */
  smtpUrl?: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Read mailer configuration from environment. Returns null only if the
 * caller asked for an explicit env override that's malformed — under normal
 * operation we always return SOMETHING (console transport when nothing is
 * configured) so dev never crashes.
 *
 * Env vars (all optional):
 *   FINOPS_MAIL_TRANSPORT  one of 'resend' | 'sendgrid' | 'smtp' | 'console'
 *                          (default: console when nothing else is configured;
 *                          'resend' when FINOPS_MAIL_API_KEY is set and
 *                          transport is unset).
 *   FINOPS_MAIL_FROM       full From: header, e.g. "AI FinOps <noreply@x.io>".
 *                          (default: 'ai-finops@localhost')
 *   FINOPS_MAIL_API_KEY    API key for resend / sendgrid.
 *   FINOPS_SMTP_URL        smtps://user:pass@host:port — placeholder, see note.
 */
export function getMailerConfig(): MailerConfig | null {
  const explicit = (process.env.FINOPS_MAIL_TRANSPORT ?? '').trim().toLowerCase();
  const from = (process.env.FINOPS_MAIL_FROM ?? '').trim() || 'ai-finops@localhost';
  const apiKey = (process.env.FINOPS_MAIL_API_KEY ?? '').trim();
  const smtpUrl = (process.env.FINOPS_SMTP_URL ?? '').trim();

  let transport: MailerTransport;
  if (explicit === 'resend' || explicit === 'sendgrid' || explicit === 'smtp' || explicit === 'console') {
    transport = explicit;
  } else if (explicit.length > 0) {
    // Unknown value — refuse to guess. Surface as a configuration error
    // so the operator sees it instead of silently degrading to console.
    return null;
  } else if (apiKey.length > 0) {
    // No explicit transport but a key is present — default to Resend, the
    // more common modern choice. Operators can override to 'sendgrid'.
    transport = 'resend';
  } else if (smtpUrl.length > 0) {
    transport = 'smtp';
  } else {
    transport = 'console';
  }

  const cfg: MailerConfig = { from, transport };
  if (apiKey.length > 0) cfg.apiKey = apiKey;
  if (smtpUrl.length > 0) cfg.smtpUrl = smtpUrl;
  return cfg;
}

function asArray(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to];
}

/**
 * Render a dev-console preview of the email. Bracketed block makes it easy
 * to eyeball in a terminal that scrolls a lot of other log noise.
 */
function consolePreview(msg: EmailMessage, cfg: MailerConfig): void {
  const to = asArray(msg.to).join(', ');
  const html = msg.html.replace(/\s+/g, ' ').trim();
  const truncated = html.length > 200 ? `${html.slice(0, 200)}…` : html;
  const lines = [
    '┌─ EMAIL (dev console transport) ─────────',
    `│ From: ${cfg.from}`,
    `│ To: ${to}`,
    `│ Subject: ${msg.subject}`,
    '│ — body —',
    `│ ${truncated}`,
    '└─────────────────────────────────────────',
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

interface ResendResponse {
  id?: string;
  message?: string;
  name?: string;
}

/**
 * Send via Resend's REST API. https://resend.com/docs/api-reference/emails/send-email
 *
 * Resend accepts both `html` and `text` in the same payload — most email
 * clients pick the richest version they support. Including both improves
 * deliverability vs. HTML-only.
 */
async function sendViaResend(msg: EmailMessage, cfg: MailerConfig): Promise<SendResult> {
  if (!cfg.apiKey) {
    return { ok: false, error: 'Resend transport requires FINOPS_MAIL_API_KEY' };
  }
  const body: Record<string, unknown> = {
    from: cfg.from,
    to: asArray(msg.to),
    subject: msg.subject,
    html: msg.html,
  };
  if (msg.text) body.text = msg.text;
  if (msg.replyTo) body.reply_to = msg.replyTo;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    // Resend returns 200 with { id } on success, 4xx/5xx with { name, message } otherwise.
    const json = (await res.json().catch(() => ({}))) as ResendResponse;
    if (!res.ok) {
      const message = json.message ?? json.name ?? `HTTP ${res.status}`;
      return { ok: false, error: `Resend: ${message}` };
    }
    const out: SendResult = { ok: true };
    if (json.id) out.messageId = json.id;
    return out;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network error';
    return { ok: false, error: `Resend: ${message}` };
  }
}

interface SendGridErrorBody {
  errors?: Array<{ message?: string }>;
}

/**
 * Send via SendGrid's REST API. https://docs.sendgrid.com/api-reference/mail-send/mail-send
 *
 * SendGrid is more verbose: every "from" is an object, recipients live under
 * a `personalizations` array, and the body has `content` entries per MIME
 * type. We always send text/plain first then text/html (the RFC says richer
 * variants come later) and SendGrid honors that ordering.
 *
 * On success SendGrid returns 202 Accepted with an empty body and the
 * message id in the `X-Message-Id` response header.
 */
async function sendViaSendGrid(msg: EmailMessage, cfg: MailerConfig): Promise<SendResult> {
  if (!cfg.apiKey) {
    return { ok: false, error: 'SendGrid transport requires FINOPS_MAIL_API_KEY' };
  }

  // SendGrid wants the From: address split. Parse "Name <addr@host>" or accept
  // a bare address. If the form is weird, fall back to using the whole string.
  const fromMatch = cfg.from.match(/^(.*?)<([^>]+)>\s*$/);
  const from = fromMatch && fromMatch[2]
    ? { email: fromMatch[2].trim(), name: (fromMatch[1] ?? '').trim().replace(/^"|"$/g, '') || undefined }
    : { email: cfg.from };

  const content: Array<{ type: string; value: string }> = [];
  if (msg.text) content.push({ type: 'text/plain', value: msg.text });
  content.push({ type: 'text/html', value: msg.html });

  const body: Record<string, unknown> = {
    personalizations: [
      {
        to: asArray(msg.to).map((email) => ({ email })),
      },
    ],
    from,
    subject: msg.subject,
    content,
  };
  if (msg.replyTo) body.reply_to = { email: msg.replyTo };

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 202) {
      const messageId = res.headers.get('x-message-id') ?? undefined;
      const out: SendResult = { ok: true };
      if (messageId) out.messageId = messageId;
      return out;
    }
    let detail = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as SendGridErrorBody;
      const first = json.errors?.[0]?.message;
      if (first) detail = first;
    } catch {
      // ignore — keep HTTP status
    }
    return { ok: false, error: `SendGrid: ${detail}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network error';
    return { ok: false, error: `SendGrid: ${message}` };
  }
}

/**
 * The 'smtp' transport is a placeholder. A real implementation would speak
 * the SMTP protocol over TLS — that requires nodemailer (or a hand-rolled
 * client), which is outside the "no new deps" charter of this module.
 *
 * Operators who need plain SMTP have two options:
 *   - Front their SMTP server with a Resend/SendGrid relay (they accept
 *     custom domains and inherit deliverability features).
 *   - Add nodemailer to package.json and replace this stub.
 */
function smtpStub(): SendResult {
  return {
    ok: false,
    error:
      'SMTP transport requires nodemailer, not currently bundled — use ' +
      'resend or sendgrid (or set FINOPS_MAIL_TRANSPORT=console for dev).',
  };
}

/**
 * Send a single email. Dispatches to the configured transport. NEVER throws —
 * always returns a result object the caller can branch on.
 *
 * For the magic-link flow specifically, the caller does NOT surface the
 * failure to the end-user (we always claim success to prevent email
 * enumeration). Operators see the failure via logs.
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const cfg = getMailerConfig();
  if (!cfg) {
    return { ok: false, error: 'Mailer config invalid — check FINOPS_MAIL_TRANSPORT' };
  }

  const recipients = asArray(msg.to);
  if (recipients.length === 0 || recipients.every((r) => !r.trim())) {
    return { ok: false, error: 'No recipients' };
  }
  if (!msg.subject) {
    return { ok: false, error: 'Subject required' };
  }
  if (!msg.html) {
    return { ok: false, error: 'HTML body required' };
  }

  switch (cfg.transport) {
    case 'console':
      consolePreview(msg, cfg);
      return { ok: true, messageId: 'console-dev' };
    case 'resend':
      return sendViaResend(msg, cfg);
    case 'sendgrid':
      return sendViaSendGrid(msg, cfg);
    case 'smtp':
      return smtpStub();
  }
}
