# AI FinOps — Slack App

Native, two-way Slack integration. Once installed, anyone in the workspace
can run `/finops` slash commands or `@mention` the bot to query the
dashboard from any channel.

This is different from the **outgoing webhook** described in
[INTEGRATIONS.md](./INTEGRATIONS.md) — that sends alerts *into* Slack.
This guide covers the **app** which makes Slack a control surface
*for* AI FinOps.

---

## What users can do

Once an admin installs the app:

| Command                            | What happens                                                       |
|------------------------------------|--------------------------------------------------------------------|
| `/finops cost`                     | Spend summary for the last 7 days (default).                       |
| `/finops cost 24h`                 | Spend summary for the last 24 hours. Also `7d`, `30d`, `all`.      |
| `/finops insights`                 | Top 3 recommendations + projected monthly/annual savings.          |
| `/finops optimize <prompt>`        | Rewrites the prompt and reports token/cost savings.                |
| `/finops anomalies`                | Unresolved critical/warn anomalies from the last 7 days.           |
| `/finops digest`                   | Link to the latest weekly cost digest.                             |
| `/finops help`                     | List available commands.                                           |
| `@finops cost` / `insights` / `optimize <prompt>` | Same shortcuts as a channel mention. The bot replies in-channel; remember to invite `@finops` to the channel first. |

Slash command responses are **ephemeral** — only the user who ran the
command sees the reply. `@mention` responses are visible to the channel.

---

## One-time admin setup

Five env vars and a Slack app manifest. ~5 minutes.

### 1. Generate the encryption key (if not already set)

```bash
openssl rand -hex 32
```

Save the output as `FINOPS_ENCRYPTION_KEY`. This same key encrypts
provider credentials; if it's already set in your deployment you can
skip this step.

### 2. Create the Slack app

1. Open <https://api.slack.com/apps?new_app=1>.
2. Click **From an app manifest**.
3. Select your workspace.
4. Open [`docs/slack-app-manifest.yaml`](./slack-app-manifest.yaml),
   replace every `YOUR_BASE_URL` with your deployed origin (e.g.
   `https://ai-finops.example.com` — **no trailing slash**), and paste
   the result.
5. Click **Create** and confirm.

You'll land on the app's **Basic Information** page.

### 3. Copy the three secrets

On the **Basic Information** page:

- **Client ID** → `SLACK_CLIENT_ID`
- **Client Secret** → `SLACK_CLIENT_SECRET`
- **Signing Secret** → `SLACK_SIGNING_SECRET`

Click **Show** for the Client Secret and Signing Secret — they're
revealed for ~30 seconds, copy quickly.

### 4. Set the env vars in your deployment

For Vercel:

```bash
vercel env add SLACK_CLIENT_ID
vercel env add SLACK_CLIENT_SECRET
vercel env add SLACK_SIGNING_SECRET
```

For Docker / docker-compose / Fly.io / Render, use whatever your platform
exposes for secrets. Make sure to redeploy after setting them.

You should also confirm `FINOPS_ENCRYPTION_KEY` is present — the OAuth
callback refuses to persist a Slack token unless the encryption key is
available.

### 5. Install into your first workspace

Visit `/slack` on your deployed dashboard. You should now see an
**Add to Slack** button. Click it. Slack will show a consent screen
listing the requested scopes — approve, and you'll bounce back to
`/slack?installed=1` with a green success banner.

### 6. (Optional) Invite the bot to channels for `@mention`s

Slash commands work everywhere immediately. For `@mention` queries,
invite the bot into the relevant channel(s):

```
/invite @AI FinOps
```

---

## How users install (after admin setup)

Anyone in a workspace can install AI FinOps:

1. They visit your dashboard's `/slack` page.
2. They click **Add to Slack**.
3. Slack shows the consent screen.
4. They approve.
5. Done — slash commands now work for the entire workspace.

You do not need a separate app per workspace. The same Slack app
distributes to any number of workspaces; each install gets its own
encrypted bot token in your database.

---

## Revoking an install

In the dashboard:

1. Visit `/slack`.
2. Find the workspace in the **Connected workspaces** table.
3. Click **Revoke**.

The row stays in the database (marked inactive, so audit history is
preserved) but `getInstallation()` will return `null` for that team —
slash commands and `@mention`s from the workspace will silently no-op
until they re-install.

To remove the row entirely, drop it from the database directly:

```sql
DELETE FROM "SlackInstallation" WHERE "teamId" = 'T01ABCDEFG';
```

---

## Architecture & security

### Where tokens live

Slack bot tokens (`xoxb-...`) are stored in the `SlackInstallation`
table, encrypted with AES-256-GCM using `FINOPS_ENCRYPTION_KEY` — the
same scheme as `Credential` rows for provider keys. The encryption is
applied in `src/lib/slackInstall.ts → persistInstallation()`; nothing
else in the codebase ever sees the plaintext.

Rotating `FINOPS_ENCRYPTION_KEY` invalidates every stored token at
once. Workspaces would need to re-install.

### How requests are verified

Every request Slack sends to our endpoints carries:

```
X-Slack-Request-Timestamp: <unix seconds>
X-Slack-Signature:         v0=<hex>
```

`src/lib/slackSign.ts → verifySlackSignature()` checks both:

- The signature equals `HMAC-SHA256(SLACK_SIGNING_SECRET, "v0:" + timestamp + ":" + rawBody)`.
- The timestamp is within ±5 minutes of `Date.now()` (replay protection).

Any request that fails either check is rejected with HTTP 401 before
we look at the body.

### Why we ack first and compute later

Slack's slash command contract requires a 200 response within 3 seconds.
Computing a 30-day insights report is regularly slower than that. We
follow Slack's documented pattern:

1. Verify the signature.
2. Immediately return an ephemeral "Working on it…" reply.
3. Asynchronously POST the real result to the `response_url` Slack
   provided in the original request body.

Same idea for `@mention` events: return 200 immediately, then post the
reply via `chat.postMessage` using the workspace's stored bot token.

### Public-path allowlist (auth gate users)

If you've enabled the dashboard password gate
(`FINOPS_DASHBOARD_PASSWORD`), make sure `/api/slack/*` routes are in
the public-path allowlist in `src/middleware.ts`. Slack's servers will
not be sending session cookies, and the requests carry their own
signature instead. Without the allowlist, every Slack webhook would
get a 401.

---

## Troubleshooting

### "Add to Slack" button doesn't appear

Causes:

- `SLACK_CLIENT_ID` is unset in your deployment env. Fix and redeploy.
- `FINOPS_ENCRYPTION_KEY` is unset. The button is rendered but disabled
  until encryption is configured — we refuse to store a Slack token
  without it.

### Install bounces back with `?error=invalid_state`

The OAuth state cookie expired or was wiped between starting the install
and Slack redirecting back. Just click **Add to Slack** again — the
state is generated fresh per attempt.

### Install bounces back with `?error=oauth_failed` / `invalid_client_id`

Your `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` don't match what's on
api.slack.com. Re-copy from Basic Information and redeploy. Note that
the secrets are scoped to a specific Slack app — copy from the right one.

### Slash commands return "operation_timeout"

The handler took longer than 3 seconds to ACK. Verify:

- Database connectivity (`/api/health` is green).
- The `/api/slack/commands` route is reachable from Slack (in dev,
  expose via ngrok / `vercel dev`).

If everything looks correct but a heavy command still times out, you
may be hitting cold-start latency on serverless. The endpoint already
defers the actual computation to a follow-up `response_url` POST, but
the initial ACK still has to happen within 3s — bumping the function
memory or warming the function can help.

### "Signature verification failed" in logs

Two common causes:

- `SLACK_SIGNING_SECRET` is wrong or for a different Slack app. Copy
  again from Basic Information.
- A reverse proxy / WAF is rewriting the body before it reaches Next.js
  (changes whitespace, line endings, etc.). The signature is over the
  literal bytes Slack sent — any modification invalidates it. Disable
  request rewriting on the Slack paths.

### URL verification keeps failing on api.slack.com → Event Subscriptions

You tried to save the URL but Slack says "Your URL didn't respond with
the value of the challenge parameter."

- Confirm `SLACK_SIGNING_SECRET` is set in production. Without it the
  endpoint returns 503 before the challenge check.
- Confirm the URL is correct: `https://YOUR_BASE_URL/api/slack/events`
  (no trailing slash, https only — Slack rejects http).
- If you're behind a custom auth gate, allowlist the Slack endpoints.

### `@finops` mentions don't get a reply

Two causes:

- The bot isn't a member of the channel. Run `/invite @AI FinOps` in
  the channel.
- The workspace's install row is marked inactive (it was revoked from
  `/slack`). Re-install via the **Add to Slack** button.

---

## Reference: env vars

| Variable                | Required | What it does                                                              |
|-------------------------|----------|---------------------------------------------------------------------------|
| `SLACK_CLIENT_ID`       | Yes      | OAuth client id from Slack app's Basic Information.                       |
| `SLACK_CLIENT_SECRET`   | Yes      | OAuth client secret. Used server-side to exchange the code for a token.   |
| `SLACK_SIGNING_SECRET`  | Yes      | HMAC key Slack signs every incoming request with.                         |
| `FINOPS_ENCRYPTION_KEY` | Yes      | 64-char hex AES-256-GCM key. Encrypts the stored bot tokens at rest.      |
| `NEXT_PUBLIC_BASE_URL`  | Recommended | Used to build the absolute OAuth redirect URL. Defaults to request origin if unset, which works on most platforms. |

## Reference: routes

| Path                                | Purpose                                                       |
|-------------------------------------|---------------------------------------------------------------|
| `GET  /api/slack/oauth/install`     | Redirects to slack.com for consent.                           |
| `GET  /api/slack/oauth/callback`    | Exchanges the code for a bot token; persists installation.    |
| `POST /api/slack/commands`          | Receives slash commands; signature-verified.                  |
| `POST /api/slack/events`            | Receives Events API payloads (incl. `app_mention`).           |
| `DELETE /api/slack/installations/[id]` | Revoke (deactivate) a stored workspace install.            |
| `GET  /slack`                       | Admin UI: install button, connected workspaces, command help. |
