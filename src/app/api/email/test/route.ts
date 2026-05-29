/**
 * Send a test email through the configured mailer.
 *
 * POST /api/email/test
 *   body: { to: string }
 *   response: { ok: boolean, transport: string, error?: string, messageId?: string }
 *
 * Auth: either
 *   (a) Authorization: Bearer <CRON_SECRET>   (for ops to script verification)
 *   (b) A valid finops_session cookie         (already-signed-in user)
 *
 * Returning the transport name + error to authenticated callers is fine —
 * this endpoint is gated, so we can give helpful diagnostics. The mailer's
 * error strings name the provider, so the operator sees e.g.
 * "Resend: API key is invalid" instead of a generic failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  getAuthSecret,
  verifySessionCookie,
} from '@/lib/auth';
import { getMailerConfig, sendEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface TestBody {
  to?: unknown;
}

function bearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m && m[1] ? m[1].trim() : null;
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Path 1: Bearer-token (CRON_SECRET). Constant-time compare via string
  // length first, then byte-equality. We accept either being unset → no
  // bearer path (cookie path is still available).
  const cronSecret = (process.env.CRON_SECRET ?? '').trim();
  if (cronSecret.length > 0) {
    const supplied = bearerToken(req);
    if (supplied && supplied.length === cronSecret.length) {
      // constant-ish-time string compare. Not under attacker control but
      // consistent with auth.ts's discipline.
      let diff = 0;
      for (let i = 0; i < supplied.length; i++) {
        diff |= supplied.charCodeAt(i) ^ cronSecret.charCodeAt(i);
      }
      if (diff === 0) return true;
    }
  }

  // Path 2: signed-in session cookie. Works for both password mode and
  // magic-link mode (both use the same cookie name).
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    // We accept any valid cookie under EITHER signing secret — password
    // mode signs with FINOPS_DASHBOARD_PASSWORD; magic-link-only mode signs
    // with the derived FINOPS_MAIL_FROM-based secret used in /magic.
    const password = getAuthSecret();
    if (password && (await verifySessionCookie(cookie, password))) return true;
    const mailFrom = (process.env.FINOPS_MAIL_FROM ?? '').trim();
    if (mailFrom.length > 0) {
      const altSecret = `magic-link:${mailFrom}`;
      if (await verifySessionCookie(cookie, altSecret)) return true;
    }
    // If auth is not enabled at all (no password, no mail config), allow
    // any cookie or no cookie. This is a dev convenience for local poking.
    if (!password && mailFrom.length === 0) return true;
  } else {
    // No cookie. If auth is fully disabled (no password & no mail), allow.
    // This means a totally-unconfigured local install can still hit the
    // endpoint to test the console transport without any setup. Once
    // either env var is set, this convenience path closes.
    const password = getAuthSecret();
    const mailFrom = (process.env.FINOPS_MAIL_FROM ?? '').trim();
    if (!password && mailFrom.length === 0) return true;
  }

  return false;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: TestBody;
  try {
    body = (await req.json()) as TestBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!to) {
    return NextResponse.json({ error: 'to is required' }, { status: 400 });
  }

  const cfg = getMailerConfig();
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: 'mailer config invalid', transport: 'unknown' },
      { status: 500 },
    );
  }

  const result = await sendEmail({
    to,
    subject: 'AI FinOps mailer test',
    html: `
      <p>This is a test email from AI FinOps.</p>
      <p>If you are reading this, your mailer is configured correctly.</p>
      <p style="color:#6b7280;font-size:12px">Transport: <strong>${cfg.transport}</strong></p>
    `,
    text: `AI FinOps mailer test\n\nThis is a test email from AI FinOps.\nIf you are reading this, your mailer is configured correctly.\n\nTransport: ${cfg.transport}\n`,
  });

  const responseBody: Record<string, unknown> = {
    ok: result.ok,
    transport: cfg.transport,
  };
  if (result.messageId) responseBody.messageId = result.messageId;
  if (result.error) responseBody.error = result.error;

  return NextResponse.json(responseBody, { status: result.ok ? 200 : 502 });
}
