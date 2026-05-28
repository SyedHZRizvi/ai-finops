# AI FinOps — Enterprise Deployment Guide

## The fundamental constraint

**This tool — and any tool of this category — cannot scan an organization's AI usage from outside the organization.** That is not how LLM provider APIs work. There is no public endpoint to query "give me Org X's token usage."

LLM API calls flow over TLS directly between an enterprise's applications and the provider (Anthropic, OpenAI, Google). The data that describes that traffic lives in three places, all behind the enterprise's own credentials:

1. The enterprise's own application logs and gateways.
2. The provider's admin dashboard (Anthropic Console, OpenAI Usage, GCP Billing).
3. The enterprise's billing/finance system.

A FinOps dashboard works by **becoming the central place those three feeds land**. It does not discover anything by itself.

This guide describes the three viable ways to feed AI FinOps real data, plus a deployment checklist.

---

## Three ways to feed it data

### Path A — Instrument applications with the SDK (best for ongoing traffic)

The SDK ([sdk/](../sdk/)) wraps the LLM call. Every call going forward is logged automatically with accurate input/output token counts from the provider's `usage` field.

Pros:
- Accurate token counts (from the provider's own reporting, not estimated).
- Real-time data in the dashboard.
- Captures prompt text, response text, user, app, latency, custom metadata.

Cons:
- Code change required at every call site.
- Only covers what you instrument; existing apps and notebooks need to be visited.

This is the only path that gives you **per-prompt** data, which the Insights engine needs to surface model-mismatch and redundancy clusters.

### Path B — Backfill from provider admin APIs (best for historical context)

Each major provider exposes admin endpoints with usage rollups. These return *aggregated* counts and costs, not per-prompt content.

| Provider | Endpoint / Export | Granularity |
|---|---|---|
| Anthropic | Admin API: `GET /v1/organizations/usage_report/messages` (requires admin API key) | Per-API-key, per-model, per-day |
| OpenAI | Usage export from the Usage dashboard (CSV) or the `GET /v1/organization/usage/*` endpoints | Per-API-key, per-model, per-minute |
| Google | Cloud Billing export → BigQuery | Per-project, per-SKU, per-day |
| Azure OpenAI | Cost Management exports | Per-resource, per-day |

You can POST each row of those exports to `/api/log` with the appropriate fields. Aggregate rows lose the per-prompt detail, so the Insights engine's redundancy and model-mismatch analysis won't fire on them. They still feed the totals, charts, and per-model breakdowns.

A small importer script — TBD as a future addition — would automate this.

### Path C — Stream from an API gateway

If the enterprise routes LLM traffic through a gateway (Kong, Envoy, a CloudFlare Worker, Portkey, LiteLLM proxy), you can configure the gateway to fire-and-forget a webhook to `/api/log` for every call. This is the cleanest path for an org with mature platform engineering — no code change at call sites, full per-prompt fidelity.

LiteLLM, Portkey, and CloudFlare AI Gateway all support webhooks/log forwarding.

---

## What you cannot do (honest list)

These limitations are inherent to the LLM provider ecosystem; no tool overcomes them today:

- **Sniff traffic from outside the enterprise.** TLS makes this impossible without root certs the enterprise has installed.
- **Read another org's usage with only that org's domain or URL.** There is no public API for this. Any tool claiming this is either lying or proposing to phish admin credentials.
- **Reconcile GitHub Copilot completions.** Microsoft does not expose per-completion token data.
- **Track ChatGPT or Claude desktop app usage** without that org's provider admin API key.
- **Track in-IDE Copilot / JetBrains AI chat usage** at the per-call level.

For these closed surfaces, the Studio (`/studio`) is a parallel value proposition: it helps engineers craft cheaper prompts before they paste them in, even when measurement is impossible.

---

## Deployment checklist

### 1. Pick a host

The dashboard is a stock Next.js 14 app. Any of these work:

- A single Linux VM (run `npm start` behind a reverse proxy).
- Vercel (push to GitHub, connect — works out of the box).
- A container platform (Docker image is trivial — see Dockerfile section below).
- An internal Kubernetes cluster.

### 2. Pick a database

Default is SQLite (`file:./dev.db`), which is **fine for a single-node deployment up to ~1M rows**.

For multi-node or larger scale:
- Edit `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
- Set `DATABASE_URL="postgresql://user:pass@host:5432/finops"` in your environment.
- Run `npx prisma db push` to create the schema.

### 3. Set the ingest secret

Generate a token and set `FINOPS_INGEST_TOKEN` in the dashboard's environment. Distribute the same token to every application/gateway that POSTs to `/api/log`. The SDK reads it from its own `FINOPS_INGEST_TOKEN` env var automatically.

### 4. Instrument or import

- **New apps**: drop in the SDK (see [`sdk/README.md`](../sdk/README.md)).
- **Existing apps with structured logs**: write a one-time script that POSTs to `/api/log`.
- **Provider history**: export from Anthropic/OpenAI admin and POST.

### 5. Open `/insights`

The Insights page synthesizes the dataset into ranked dollar-impact recommendations. Within ~1000 logged calls it begins surfacing useful root causes (concentration, model mismatch, redundancy clusters, output bloat).

---

## Minimal Dockerfile (reference)

```dockerfile
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
COPY --from=build /app/next.config.mjs ./
EXPOSE 3000
CMD ["npm","start"]
```

Run:

```bash
docker build -t ai-finops .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e FINOPS_INGEST_TOKEN="<your secret>" \
  ai-finops
```

---

## Recommended rollout plan (90 days)

| Phase | Day | Action |
|---|---|---|
| 1 | 0-7 | Deploy the dashboard internally. Pilot SDK in one high-volume application. |
| 2 | 7-30 | Roll the SDK into the top three applications by AI spend. Backfill 30 days of provider history via admin API exports. |
| 3 | 30-60 | Review `/insights` weekly. Action the top three recommendations: model routing, prompt caching, output caps. |
| 4 | 60-90 | Set targets: reduce specific category × model spend by N%. Add governance review for any new app exceeding $X/month. |

Realistic outcome from teams that follow this with discipline: **30-60% reduction in AI spend over 90 days**, dominated by model-routing wins (cheaper models for simple work) and prompt caching on stable system prompts.

---

## Working with the AI FinOps roadmap

The current build is a working v0.1.0 reference implementation. For production enterprise use, the typical gaps an org will want to close next:

- **Provider importers**: scheduled jobs that pull from Anthropic / OpenAI / Google admin endpoints.
- **SSO** on the dashboard (currently single-tenant, open).
- **RBAC**: separate views per team / business unit.
- **Webhook alerts**: Slack / PagerDuty notifications when cost crosses a threshold.
- **Retention archival**: roll old rows to Parquet on object storage.
- **Per-app budgets**: hard or soft caps with notification escalation.

None of these are blockers; the data model and ingest layer accommodate all of them.
