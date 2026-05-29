// GET /api/slack/oauth/install
//
// Entry point for the OAuth "Add to Slack" button. Builds the
// authorize URL and 302s the browser to slack.com. Once the user
// consents, Slack redirects them back to /api/slack/oauth/callback
// with a one-time `code` we exchange for the bot token.
//
// Scopes requested:
//   commands           — register and receive slash commands
//   chat:write         — post messages as the bot (response_url + DM)
//   users:read         — resolve user IDs in command/event payloads
//   app_mentions:read  — receive `app_mention` events for @finops in
//                        channels the bot has been invited to
//
// If SLACK_CLIENT_ID is unset we return 503 with a setup hint so
// operators understand why the button doesn't work yet, instead of
// silently failing at slack.com.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SLACK_SCOPES = ['commands', 'chat:write', 'users:read', 'app_mentions:read'].join(',');

function resolveBaseUrl(req: NextRequest): string {
  // Order: explicit env (production) → request origin (works in dev, in
  // preview deploys, behind reverse proxies, etc.).
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      {
        error: 'Slack not configured',
        hint:
          'Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_SIGNING_SECRET. ' +
          'See /docs/SLACK.md for the full setup walkthrough.',
      },
      { status: 503 },
    );
  }

  const baseUrl = resolveBaseUrl(req);
  const redirectUri = `${baseUrl}/api/slack/oauth/callback`;

  // `state` is an unguessable per-request value bound to the install
  // attempt. Slack echoes it back so CSRF-style attacks (an attacker
  // baiting an admin into a forged callback) fail. We set it as a
  // short-lived HTTP-only cookie and verify on callback.
  const state = generateRandomState();

  const authorizeUrl = new URL('https://slack.com/oauth/v2/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('scope', SLACK_SCOPES);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);

  const res = NextResponse.redirect(authorizeUrl.toString(), { status: 302 });
  res.cookies.set('finops_slack_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    maxAge: 10 * 60, // 10 minutes — plenty for the consent flow
    path: '/',
  });
  return res;
}

/**
 * 32 bytes of randomness, base64url-encoded. crypto.getRandomValues is
 * available in both Node 18+ and the edge runtime, so this works in any
 * Next.js server context.
 */
function generateRandomState(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
