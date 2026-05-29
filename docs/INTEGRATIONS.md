# AI FinOps — Integration Guide

How to use AI FinOps with every major LLM environment. Four supported paths, from "no integration needed" to "deep programmatic logging".

---

## Decision matrix

| Tool / Environment | API call? | SDK wrap | Browser ext | Studio (paste flow) |
|---|---|---|---|---|
| **Anthropic Claude (API)** | yes | `withAnthropicLogging` | n/a | yes |
| **OpenAI GPT (API)** | yes | `withOpenAILogging` | n/a | yes |
| **Google Gemini (API)** | yes | `withGeminiLogging` | n/a | yes |
| **Perplexity (API)** | yes | `withPerplexityLogging` | n/a | yes |
| **Any other LLM API** | yes | `withGenericLogging` | n/a | yes |
| **claude.ai (web)** | no | — | yes | yes |
| **chat.openai.com (web)** | no | — | yes | yes |
| **gemini.google.com (web)** | no | — | yes | yes |
| **perplexity.ai (web)** | no | — | yes | yes |
| **Cursor IDE** | yes (its agent runs) | wrap the underlying provider call | — | yes |
| **GitHub Copilot (IDE)** | no public token API | — | — | yes (via Studio) |
| **Microsoft Copilot (web)** | no public token API | — | — | yes (via Studio) |

**Key:**
- **API call** — your code makes the LLM call programmatically.
- **SDK wrap** — drop our SDK helper around your call. Token-accurate, automatic logging.
- **Browser ext** — install our Chrome extension; it adds a one-click optimize button to the web UI.
- **Studio** — open `/studio`, describe your problem, paste the generated prompt anywhere.

---

## Path 1 — SDK (your code calls the LLM)

The SDK is **provider-agnostic**, zero-dependency TypeScript. It ships pre-built helpers for the four major providers plus a generic fallback.

### Anthropic Claude

```ts
import { FinOpsClient, withAnthropicLogging } from '@ai-finops/sdk';
import Anthropic from '@anthropic-ai/sdk';

const finops = new FinOpsClient({ baseUrl: 'http://localhost:3000', appName: 'my-app' });
const anthropic = new Anthropic();

const reply = await withAnthropicLogging(
  finops,
  { model: 'claude-sonnet-4', promptText: question },
  () => anthropic.messages.create({
    model: 'claude-sonnet-4',
    max_tokens: 1024,
    messages: [{ role: 'user', content: question }],
  })
);
```

### OpenAI GPT

```ts
import { FinOpsClient, withOpenAILogging } from '@ai-finops/sdk';
import OpenAI from 'openai';

const finops = new FinOpsClient({ baseUrl: 'http://localhost:3000' });
const openai = new OpenAI();

const reply = await withOpenAILogging(
  finops,
  { model: 'gpt-4o', promptText: question },
  () => openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: question }],
  })
);
```

### Google Gemini

```ts
import { FinOpsClient, withGeminiLogging } from '@ai-finops/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const finops = new FinOpsClient({ baseUrl: 'http://localhost:3000' });
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genai.getGenerativeModel({ model: 'gemini-1.5-pro' });

const reply = await withGeminiLogging(
  finops,
  { model: 'gemini-1.5-pro', promptText: question },
  () => model.generateContent(question)
);
```

### Perplexity

Perplexity exposes an OpenAI-compatible chat completions endpoint, so the same shape works:

```ts
import { FinOpsClient, withPerplexityLogging } from '@ai-finops/sdk';
import OpenAI from 'openai';

const finops = new FinOpsClient({ baseUrl: 'http://localhost:3000' });
const ppx = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY!,
  baseURL: 'https://api.perplexity.ai',
});

const reply = await withPerplexityLogging(
  finops,
  { model: 'sonar', promptText: question },
  () => ppx.chat.completions.create({
    model: 'sonar',
    messages: [{ role: 'user', content: question }],
  })
);
```

### Cursor (when it acts as an SDK consumer)

Cursor's IDE chat is a closed surface, but if you write a Cursor **agent rule** or a custom MCP server that calls Claude/GPT, wrap that call with the appropriate helper above.

### Any other LLM (Mistral, Cohere, Together, Bedrock, custom)

Use the generic wrapper — you supply the extractor:

```ts
import { FinOpsClient, withGenericLogging } from '@ai-finops/sdk';

const finops = new FinOpsClient({ baseUrl: 'http://localhost:3000' });

const reply = await withGenericLogging(
  finops,
  {
    model: 'mistral-large-2',
    promptText: question,
    provider: 'mistral',
    extract: (res: any) => ({
      responseText: res.choices[0].message.content,
      inputTokens: res.usage.prompt_tokens,
      outputTokens: res.usage.completion_tokens,
    }),
  },
  () => fetch('https://api.mistral.ai/v1/chat/completions', { /* ... */ }).then(r => r.json())
);
```

For environments where you cannot extract `usage` automatically (e.g., a streaming response), use `client.log({...})` directly after the call and supply token counts yourself.

---

## Path 2 — Browser extension (web UIs)

For end-user chats on **claude.ai, chat.openai.com, gemini.google.com, perplexity.ai**, install the Chrome extension at `extension/` in this repo.

### Install

1. `chrome://extensions`
2. Toggle **Developer mode** on (top-right)
3. **Load unpacked** → select the `extension/` folder
4. Pin the icon to the toolbar
5. Make sure `npm run dev` is running so the dashboard is reachable at `http://localhost:3000`

### What it adds

- A floating purple **Optimize** button on the four supported sites
- One click: captures your currently-typed prompt and asks the local FinOps `/api/optimize` endpoint for an improved version
- **Apply** button replaces the textarea content with the optimized prompt
- **Studio mode** opens `/studio` in a new tab with your prompt pre-filled
- Token + cost savings shown inline

### What it does not do

- It does **not** intercept network traffic — these sites' APIs are not publicly inspectable from a content script. You only get prompt capture, not response capture.
- Selectors can break when the host site redesigns. The selector map lives at the top of `extension/content.js` in the `SITE_CONFIG` constant — edit and reload the unpacked extension.

See [`extension/INSTALL.md`](../extension/INSTALL.md) for full installation walkthrough.

---

## Path 3 — Prompt Studio (works everywhere)

For tools where neither the SDK nor the extension fits — **Copilot, M365 Copilot, ChatGPT desktop, embedded copilots, command-line LLM clients, voice assistants** — the workflow is:

1. Open `http://localhost:3000/studio`
2. Type your problem and desired outcome
3. Pick the target tool from the dropdown (Claude, GPT, Gemini, Copilot, Cursor, Perplexity, Generic)
4. Click **Generate Prompt**
5. Copy the variant that fits (terse / standard / detailed / system-and-user)
6. Paste into the target tool

The Studio applies per-provider conventions automatically:
- **Claude** — wraps context in `<context>` tags, uses `<task>` and `<format>` blocks, supports a system+user split
- **GPT** — uses `## Task` / `## Format` markdown headers
- **Gemini** — terse `LABEL:` sections
- **Copilot / Cursor** — code-comment framing and `@file` references when input looks like a path
- **Perplexity** — appends "Cite primary sources" tail
- **Generic** — clean plain prose

The Studio also returns **split prompts** when your problem is multidimensional, so you can decide whether to ask one big question or several focused ones.

---

## Path 4 — Direct HTTP (no SDK, no extension)

When you cannot install JavaScript or run an extension (Python, Go, Ruby, curl, shell scripts), POST directly:

```bash
curl -X POST http://localhost:3000/api/log \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gpt-4o",
    "promptText": "What is the capital of France?",
    "responseText": "Paris.",
    "inputTokens": 7,
    "outputTokens": 2,
    "appName": "my-cli",
    "metadata": { "trace_id": "abc-123" }
  }'
```

If `FINOPS_INGEST_TOKEN` is set in `.env`, add:

```
-H 'Authorization: Bearer <token>'
```

---

## What you cannot do (yet)

These are honest limitations, not roadmap commitments:

- **Passive interception of closed clients.** ChatGPT desktop, Claude desktop, Microsoft Copilot, JetBrains AI Assistant — these encrypt their traffic to the provider and there is no public client-side telemetry hook. Use the Studio workflow.
- **Cursor IDE chat sessions.** Cursor's chat does not expose per-message token data to extensions. Wrap the underlying provider call if you control the agent definition.
- **GitHub Copilot completions.** Token usage is not surfaced to the IDE. Microsoft bills you separately; AI FinOps cannot reconcile this today.
- **Streaming responses without final usage payload.** Many providers send `usage` only at end-of-stream — confirm your client buffers it before extracting.

For closed environments, the path is always: **use Studio to craft the prompt, paste it in, accept that you cannot measure the call automatically.**

---

## Recommended setup per role

| Your situation | Recommended path |
|---|---|
| Backend engineer integrating Claude/GPT/Gemini | Path 1 (SDK) |
| Product team using ChatGPT/Claude web UIs daily | Path 2 (browser extension) |
| Researcher using Perplexity, Gemini, Copilot interchangeably | Path 3 (Studio) for prompt crafting |
| Data scientist with Python notebooks | Path 4 (direct HTTP) |
| FinOps lead auditing AI spend across all of the above | All four paths feed the same dashboard. Roll out in order: SDK first (largest call volumes), extension second, Studio for governance. |

---

## Getting admin credentials for hosted-cloud providers

The Anthropic and OpenAI importers each pull from a first-party admin API,
so a single secret is enough. The three hosted-cloud providers in the
first block below (Bedrock, Vertex AI, Azure OpenAI) do not expose
per-call admin endpoints — their authoritative usage record lives in the
cloud's billing system. Native importers for those billing APIs are on
the roadmap; in the meantime, all three accept the **CSV upload** path
on the dashboard.

The five LLM-as-a-service providers in the second block (Replicate,
Together AI, Groq, Mistral, Cohere) are covered separately at the end of
this section. Replicate has a working native importer; the other four
validate the API key against a public probe endpoint and steer you to
CSV upload because they do not expose a public usage admin API.

### AWS Bedrock

**Where to look:** AWS Cost Explorer at
<https://console.aws.amazon.com/billing/home#/costexplorer>.

**CSV path (works today):**
1. Open Cost Explorer.
2. Set **Service** filter to `Amazon Bedrock`.
3. Group by `Usage Type` to get input vs output token breakdowns.
4. Set the granularity to `Daily` and pick the date range you want.
5. Click **Download CSV**.
6. On the dashboard, open the **CSV import** card on the connectors page
   and paste the contents.

**Programmatic path (future native importer):**
Create an IAM user with an inline policy granting
`ce:GetCostAndUsage` and `ce:GetCostAndUsageWithResources`. Generate an
access key and store the credential blob on the dashboard as:

```json
{
  "accessKeyId": "AKIA...",
  "secretAccessKey": "...",
  "region": "us-east-1"
}
```

**What you cannot read:** per-prompt content. Bedrock invocations are not
logged with their prompt or response text in Cost Explorer — only token
counts and cost. Use the SDK wrapper (Path 1, `withGenericLogging`) if you
need prompt-level analytics.

### Google Vertex AI

**Where to look:** Cloud Billing reports at
<https://console.cloud.google.com/billing/reports>.

**CSV path (works today):**
1. In the Cloud Console, pick the billing account that pays for your
   Vertex project.
2. Open **Reports**.
3. Filter **Services** to `Vertex AI` (and optionally `Generative
   Language API` if you also use the Gemini API directly).
4. Group by `SKU` so input vs output tokens become separate rows.
5. Pick the date range and export to CSV.
6. Paste into the **CSV import** card on the dashboard.

**Programmatic path (future native importer):**
Enable **BigQuery billing export** under Billing → Billing export. This
materializes a per-day table you can query. Create a service account with
`roles/bigquery.dataViewer` on the export dataset (and
`roles/bigquery.jobUser` on the project), download its JSON key, and
paste the entire JSON blob as the credential on the dashboard.

```json
{
  "type": "service_account",
  "project_id": "...",
  "client_email": "...@<project>.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\n..."
}
```

**What you cannot read:** per-prompt content. The billing export carries
SKU-level aggregates only. Wrap your Vertex calls with
`withGeminiLogging` (Path 1) if you need prompt-level data.

### Azure OpenAI Service

**Where to look:** Azure Portal at <https://portal.azure.com>, then
navigate to **Cost Management + Billing → Cost Management → Exports**.

**CSV path (works today):**
1. In the portal, open **Cost Management → Cost analysis**.
2. Scope to the subscription that owns your Azure OpenAI deployments.
3. Filter **Resource type** to
   `Microsoft.CognitiveServices/accounts` and **Service tier** /
   **Meter sub-category** to the OpenAI rows.
4. Set the date range and granularity (Daily).
5. Click **Download → CSV**.
6. Paste into the **CSV import** card on the dashboard.

**Programmatic path (future native importer):**
Register an Azure AD application, create a client secret, and grant the
app's service principal the `Cost Management Reader` role on the
subscription. Paste the resulting credential blob on the dashboard:

```json
{
  "tenantId": "...",
  "clientId": "...",
  "clientSecret": "...",
  "subscriptionId": "..."
}
```

**What you cannot read:** per-prompt content, and any deployment-level
metadata you have not tagged on the Cognitive Services resource. Azure
Cost Management groups by ResourceId, so naming your deployments
consistently helps a lot when reconciling spend across teams.

### Replicate

**Status:** REAL native importer. Pulls per-day, per-model token and cost
rows from `GET https://api.replicate.com/v1/account/usage`.

**Where to get the API key:**
1. Sign in to <https://replicate.com>.
2. Open <https://replicate.com/account/api-tokens>.
3. Click **Create token**. Give it a descriptive label (e.g.,
   `ai-finops-import`). Replicate tokens look like `r8_...`.
4. Paste the raw token into the dashboard's **Add a connector** form
   with provider `Replicate`. No JSON wrapper required.

**Scope:** the token must belong to the account that owns the billing
record (organization tokens read the org's usage; personal tokens read
your personal account). No additional scope flags are exposed by
Replicate; any account-level token can read `/v1/account/usage`.

**Limitations:** Replicate bills image / audio / video models by hardware
runtime, not tokens. For those rows the importer emits `inputTokens =
outputTokens = 0` and surfaces a warning. Cost totals remain accurate;
only token rollups under-report for non-text models.

### Together AI

**Status:** STUB. Together AI does not currently expose a public usage
admin API, so this importer only validates the key against
`GET https://api.together.xyz/v1/models` and then steers you to CSV
upload.

**Where to get the API key:**
1. Sign in to <https://api.together.ai>.
2. Open **Settings → API Keys** (<https://api.together.ai/settings/api-keys>).
3. Click **Create new key**.
4. Paste the raw key into the dashboard.

**Scope:** any active Together AI key with read access to the models
catalog is sufficient for validation.

**CSV path (works today):**
1. Open <https://api.together.ai/settings/billing>.
2. Export the **Usage** report for your desired date range as CSV.
3. On the dashboard, open the **CSV import** card and paste the contents.

### Groq

**Status:** STUB. Groq does not currently expose a public usage admin
API, so this importer only validates the key against
`GET https://api.groq.com/openai/v1/models` and then steers you to CSV
upload.

**Where to get the API key:**
1. Sign in to <https://console.groq.com>.
2. Open <https://console.groq.com/keys>.
3. Click **Create API Key**. Groq keys look like `gsk_...`.
4. Paste the raw key into the dashboard.

**Scope:** any active Groq key with access to the OpenAI-compatible
surface is sufficient. Free-tier keys validate; only billing-eligible
accounts have usable usage data in the dashboard export.

**CSV path (works today):**
1. Open <https://console.groq.com/settings/billing>.
2. Use the **Usage** tab to export a per-day breakdown as CSV.
3. On the dashboard, open the **CSV import** card and paste the contents.

### Mistral La Plateforme

**Status:** STUB. Mistral's billing UI exposes per-day token rollups but
there is no stable public usage admin API, so this importer only
validates the key against `GET https://api.mistral.ai/v1/models` and then
steers you to CSV upload.

**Where to get the API key:**
1. Sign in to <https://console.mistral.ai>.
2. Open <https://console.mistral.ai/api-keys/>.
3. Click **Create new key**.
4. Paste the raw key into the dashboard.

**Scope:** any active La Plateforme key with permission to list models
is sufficient for validation.

**CSV path (works today):**
1. Open <https://console.mistral.ai/billing/>.
2. Export the **Usage** report for your desired date range as CSV.
3. On the dashboard, open the **CSV import** card and paste the contents.

### Cohere

**Status:** STUB. Cohere's dashboard exposes per-day token rollups but
there is no public usage admin API, so this importer only validates the
key against `GET https://api.cohere.com/v1/models` and then steers you
to CSV upload.

**Where to get the API key:**
1. Sign in to <https://dashboard.cohere.com>.
2. Open <https://dashboard.cohere.com/api-keys>.
3. Click **New Production Key** (trial keys may not have the `models`
   scope and will fail the validation probe).
4. Paste the raw key into the dashboard.

**Scope:** a production key with the default scopes is sufficient. Trial
keys validate against the chat / embed endpoints but may be rejected by
`/v1/models`.

**CSV path (works today):**
1. Open <https://dashboard.cohere.com/billing/usage>.
2. Export the **Usage** breakdown for your desired date range as CSV.
3. On the dashboard, open the **CSV import** card and paste the contents.
