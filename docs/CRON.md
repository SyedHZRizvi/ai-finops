# Scheduled Jobs (Vercel Cron)

AI FinOps ships three Vercel Cron jobs so the dashboard actually *runs
itself*. Detection, imports, and the weekly digest all fire on a cadence
without anyone clicking a button. Anomaly alerts land in Slack/Teams on
the next tick; the weekly digest broadcasts itself to whatever webhooks
you have configured.

If a CTO asks "but who's pressing the buttons?", the answer is *nobody*.

## What's scheduled

| Path                              | Cadence (UTC)  | What it does                                                                                       |
| --------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `/api/cron/anomaly-check`         | `0 * * * *`    | Hourly. Runs the anomaly detectors, dedupes against the last 24h of unresolved events, persists survivors, dispatches per-budget webhooks. |
| `/api/cron/scheduled-imports`     | `0 */6 * * *`  | Every 6 hours. Re-imports the last 24h of usage for every active credential (anthropic / openai). Idempotent — same window twice = zero duplicate rows. |
| `/api/cron/digest-broadcast`      | `0 14 * * 1`   | Monday 14:00 UTC. Builds the weekly digest and POSTs it to every active Budget.webhookUrl plus any URL stored in the `digest_webhook_urls` Setting. |

All three return a useful JSON summary, so hitting them manually with
curl gives you the same "what happened" report Vercel's Functions tab
will surface in its logs.

## Enabling in production

On the Vercel project settings, add an environment variable:

```bash
CRON_SECRET=$(openssl rand -hex 32)
```

Then redeploy. Vercel automatically attaches this value as
`Authorization: Bearer <CRON_SECRET>` on every cron-driven invocation.
The endpoints verify it with `crypto.timingSafeEqual` and 401 anything
that doesn't match.

**`CRON_SECRET` is REQUIRED in production.** If it's unset, the cron
endpoints fail-closed (every request including Vercel's own returns 401)
so the dashboard refuses to run unauthenticated scheduled jobs in a
deployed environment. Vercel will still fire the schedule; you'll just
see 401s in the logs until the env var lands.

In non-production environments (NODE_ENV !== 'production'), an unset
`CRON_SECRET` is treated as "auth disabled" — see the local-testing
section below.

## Disabling

Either:

1. Remove the relevant entry from the `crons` array in `vercel.json` and
   redeploy. (Removes the schedule entirely.)
2. Delete `CRON_SECRET` from the Vercel project. (Schedule still fires
   but every request 401s; cheap if you want to mute jobs without a
   redeploy.)

The same logic is reachable via the manual endpoints — `/api/anomaly/check`,
`/api/import`, `/api/digest` — so the cron jobs are convenience, not
correctness-load-bearing.

## Pricing

| Vercel tier  | Cron quota         | Status with current 3 jobs              |
| ------------ | ------------------ | --------------------------------------- |
| Hobby (free) | 2 cron jobs total  | Over quota — comment one out, OR upgrade |
| Pro          | Unlimited cron     | Fine                                    |
| Enterprise   | Unlimited cron     | Fine                                    |

If you're on Hobby and don't want to upgrade, remove one entry from
`vercel.json`. The most expendable is usually `digest-broadcast` —
operators can hit `/digest` directly. Anomaly detection should always
stay on cron because that's the only way alerts actually trigger.

## Local testing

With no `CRON_SECRET` set, `npm run dev` lets you POST to any cron path
unauthenticated:

```bash
curl -X POST http://localhost:3000/api/cron/anomaly-check
curl -X POST http://localhost:3000/api/cron/scheduled-imports
curl -X POST http://localhost:3000/api/cron/digest-broadcast
```

Each returns the same JSON summary the cron run would produce. Set
`CRON_SECRET` locally if you want to exercise the auth path:

```bash
export CRON_SECRET=test-secret
curl -X POST http://localhost:3000/api/cron/anomaly-check \
  -H "Authorization: Bearer test-secret"
```

A request without the header (or with the wrong token) returns 401.

## Configuring digest destinations

Two places add a URL to the weekly digest broadcast:

1. **Per-budget**: Each `Budget` row's `webhookUrl` column. Set via the
   /budget UI. These URLs *also* receive anomaly alerts (the same column
   does both).
2. **Global**: A Setting row with `key = 'digest_webhook_urls'` and a
   JSON-array string of URLs as `value`. Example:

   ```sql
   INSERT INTO Setting (id, key, value, updatedAt)
   VALUES (
     'st_digest_urls',
     'digest_webhook_urls',
     '["https://hooks.slack.com/services/T000/B000/XXX","https://outlook.office.com/webhook/..."]',
     CURRENT_TIMESTAMP
   );
   ```

URLs are deduped across the two sources. Slack and Teams URLs (detected
by hostname) receive a markdown summary with a link back to `/digest` —
the full HTML wouldn't render in those clients. Any other URL receives
**two** POSTs: one with `application/json` (the structured digest
payload) and one with `text/html` (the rendered email body). Each POST
counts independently toward `dispatched` / `failures` in the response.

## What happens on failure

| Failure                                    | Behavior                                              |
| ------------------------------------------ | ----------------------------------------------------- |
| One credential's import key is revoked     | That row is `status: 'failed'` in the response; other credentials still run. ImportJob row is marked `failed` with the error. |
| A Slack webhook is dead                    | Logged with the host + status; other destinations still receive the broadcast. The cron returns 200 with `failures: N`. |
| `buildDigest()` throws                     | The whole digest run fails 500. Next Monday it tries again. |
| `detectAnomalies()` throws                 | The anomaly cron fails 500. Next hour it tries again. |
| `CRON_SECRET` missing in production        | Every cron request 401s. Vercel keeps trying on schedule; once the env var lands the next tick goes through. |

## Code map

- `src/lib/cronAuth.ts` — Bearer-token auth helper shared by all three endpoints.
- `src/lib/importPersist.ts` — dedup + persist helper, used by the scheduled-imports cron.
- `src/app/api/cron/anomaly-check/route.ts` — runs detection / dedupe / dispatch.
- `src/app/api/cron/scheduled-imports/route.ts` — walks active credentials, runs each importer.
- `src/app/api/cron/digest-broadcast/route.ts` — builds weekly digest, broadcasts to webhooks.
- `vercel.json` — `"crons"` array entries that wire up the schedules.
