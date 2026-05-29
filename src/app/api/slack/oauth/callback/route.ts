// GET /api/slack/oauth/callback?code=...&state=...
//
// Slack redirects the user here after they consent on slack.com. We
//   1. Verify the `state` matches the cookie we set on /install.
//   2. POST `code` to Slack's oauth.v2.access endpoint along with our
//      client_id + client_secret. Slack returns the bot token, team id,
//      and bot user id.
//   3. Encrypt and persist via persistInstallation().
//   4. Redirect to /slack?installed=1 (success) or /slack?error=... (fail).
//
// Errors NEVER throw to the user. The browser is always redirected back
// to the /slack page with a query param explaining what happened so we
// can show a useful inline toast instead of a blank 500.

import { NextRequest, NextResponse } from 'next/server';
import { persistInstallation } from '@/lib/slackInstall';
import { slackEncryptionConfigured } from '@/lib/slackCrypto';

export const dynamic = 'force-dynamic';

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: { id?: string; name?: string };
  enterprise?: { id?: string; name?: string } | null;
  authed_user?: { id?: string };
}

function resolveBaseUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function redirectToSlackPage(req: NextRequest, params: Record<string, string>): NextResponse {
  const baseUrl = resolveBaseUrl(req);
  const url = new URL(`${baseUrl}/slack`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = NextResponse.redirect(url.toString(), { status: 302 });
  // Always clear the state cookie — we're done with it whether we
  // succeeded or failed.
  res.cookies.set('finops_slack_oauth_state', '', { maxAge: 0, path: '/' });
  return res;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return redirectToSlackPage(req, { error: 'not_configured' });
  }

  if (!slackEncryptionConfigured()) {
    // Refuse to persist a plaintext token — bail before exchanging.
    return redirectToSlackPage(req, { error: 'encryption_not_configured' });
  }

  const url = new URL(req.url);
  // Slack signals user-side failures via `error=access_denied` etc.
  const slackError = url.searchParams.get('error');
  if (slackError) {
    return redirectToSlackPage(req, { error: slackError });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) {
    return redirectToSlackPage(req, { error: 'missing_code' });
  }

  // State / CSRF check. The cookie was set on /install; if it's missing
  // or doesn't match, somebody else initiated this callback.
  const cookieState = req.cookies.get('finops_slack_oauth_state')?.value;
  if (!cookieState || !state || cookieState !== state) {
    return redirectToSlackPage(req, { error: 'invalid_state' });
  }

  const redirectUri = `${resolveBaseUrl(req)}/api/slack/oauth/callback`;

  // Exchange the code for a bot token. Slack's oauth.v2.access endpoint
  // is form-encoded, not JSON — see https://api.slack.com/methods/oauth.v2.access.
  let payload: SlackOAuthResponse;
  try {
    const exchangeRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    payload = (await exchangeRes.json()) as SlackOAuthResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network error';
    return redirectToSlackPage(req, { error: `exchange_failed:${message.slice(0, 80)}` });
  }

  if (!payload.ok) {
    return redirectToSlackPage(req, { error: payload.error ?? 'oauth_failed' });
  }

  const teamId = payload.team?.id;
  const accessToken = payload.access_token;
  const botUserId = payload.bot_user_id;
  if (!teamId || !accessToken || !botUserId) {
    return redirectToSlackPage(req, { error: 'incomplete_response' });
  }

  try {
    await persistInstallation({
      teamId,
      teamName: payload.team?.name ?? null,
      accessToken,
      botUserId,
      appId: payload.app_id ?? null,
      authedUserId: payload.authed_user?.id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'persist_failed';
    return redirectToSlackPage(req, { error: `persist_failed:${message.slice(0, 80)}` });
  }

  return redirectToSlackPage(req, { installed: '1' });
}
