# AI FinOps

**Deliver AI by reducing the cost of AI to the enterprise.**

A self-hosted dashboard + SDK that tracks every LLM call your applications make, classifies prompts by category and complexity, and surfaces concrete ways to spend fewer tokens — compression, restructuring, model downgrades, output caps, and prompt-caching candidates.

The thesis is simple: **you can't optimize what you can't measure, and most teams measure raw spend without ever looking at *which kinds of questions* are driving it.** This app puts the question itself at the center of cost control.

---

## What you get

- **Universal token & cost tracking** across any LLM provider (Anthropic, OpenAI, Google, on-prem, custom) via one tiny SDK or direct HTTP ingest.
- **Prompt categorization** — every call is auto-classified as `factual` / `reasoning` / `creative` / `code` / `analytical` / `conversational` / `instructional` / `other`.
- **Complexity scoring** — `simple` / `moderate` / `complex` / `multidimensional`, plus a 0-100 score and the detected *dimensions* (distinct facets) of each prompt.
- **Live optimizer** — paste any prompt; get a rewritten version plus 1-N suggestions ranked by confidence and estimated dollar savings.
- **Savings dashboard** — projected monthly cost reduction if you applied all optimizations.
- **Pluggable pricing** — edit per-model input/output rates from the Settings page; ships with current rates for major models.
- **Zero vendor lock-in** — SQLite by default, the SDK has zero runtime deps, the dashboard is pure Next.js you can run anywhere.

---

## Quick start

```bash
cd /Users/syed/Projects/ai-finops

# Install deps (this also runs `prisma generate`)
npm install

# Create the SQLite schema
npm run db:push

# Seed pricing rows + 40+ demo prompt logs so the dashboard isn't empty
npx tsx prisma/seed.ts

# Run the dashboard
npm run dev
```

Then open <http://localhost:3000>.

Pages:
- **/** — Dashboard: cost, tokens, savings opportunity, charts, recent prompts.
- **/prompts** — Browse / filter every logged call. Click any row for full detail.
- **/optimizer** — Paste a prompt → get an optimized version and ranked suggestions.
- **/settings** — Edit per-model pricing.

---

## How prompts get into the system

Two ways:

### 1. The SDK (recommended)

Drop the wrapper around your existing LLM calls — works with any provider.

```ts
import { FinOpsClient, withAnthropicLogging } from '@ai-finops/sdk';
import Anthropic from '@anthropic-ai/sdk';

const finops = new FinOpsClient({ baseUrl: 'http://localhost:3000', appName: 'my-app' });
const anthropic = new Anthropic();

const reply = await withAnthropicLogging(
  finops,
  { model: 'claude-sonnet-4', promptText: userQuestion, userId: 'user_42' },
  () => anthropic.messages.create({
    model: 'claude-sonnet-4',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userQuestion }],
  })
);
```

See [sdk/README.md](sdk/README.md) for OpenAI, raw fetch, and manual-log patterns. The SDK is fire-and-forget by default — logging never blocks or fails your LLM call.

### 2. Direct HTTP

```bash
curl -X POST http://localhost:3000/api/log \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gpt-4o",
    "promptText": "Explain transformers in two sentences.",
    "responseText": "...",
    "inputTokens": 12,
    "outputTokens": 84
  }'
```

If `FINOPS_INGEST_TOKEN` is set in `.env`, include `Authorization: Bearer <token>`.

---

## How optimization works

For every prompt logged or pasted into `/optimizer`, the engine runs eight rule-based strategies, deterministically, with no LLM call required:

| Strategy | What it does |
|---|---|
| `remove-redundancy` | Strips filler ("please could you kindly", "as I mentioned earlier", repeated synonyms). |
| `compression` | Substitutes verbose patterns ("in order to" → "to", "due to the fact that" → "because", etc). |
| `restructure` | If multiple questions are detected, proposes a numbered-list reformat that lowers output tokens. |
| `split` | If multidimensional, recommends splitting into N prompts that share a cached system prompt. |
| `few-shot-reduction` | Detects example-heavy prompts and recommends trimming. |
| `system-prompt-extraction` | Hoists stable context (>50 tokens of role/background) into a cacheable system prompt. |
| `use-cheaper-model` | If complexity ≤ moderate, suggests the cheapest equivalent (Sonnet → Haiku, GPT-4o → 4o-mini). |
| `cap-output` | If expected output is long but complexity is modest, suggests an explicit word cap. |

Each suggestion carries:
- **Token savings estimate**
- **Dollar savings estimate** using the model's pricing
- **Confidence** (0-1)

Strategies 1 & 2 actually rewrite the prompt; the rest are suggestions with before/after diffs.

---

## Architecture

```
┌────────────────────┐    POST /api/log    ┌────────────────────────┐
│ Your app + SDK     │ ──────────────────► │ Next.js API routes     │
└────────────────────┘                     │                        │
                                           │ tokenize → categorize  │
                                           │ → score complexity     │
                                           │ → cost + optimize      │
                                           └──────────┬─────────────┘
                                                      │
                                              ┌───────▼────────┐
                                              │ SQLite (Prisma)│
                                              └───────┬────────┘
                                                      │
                                       ┌──────────────▼──────────────┐
                                       │ Dashboard / Prompts /        │
                                       │ Optimizer / Settings (Next)  │
                                       └──────────────────────────────┘
```

- **Frontend / backend**: Next.js 14 (app router), React 18, Tailwind, Recharts.
- **DB**: SQLite via Prisma. Swap `DATABASE_URL` to Postgres for production; no code changes.
- **Token counting**: `gpt-tokenizer` (cl100k_base) as a provider-agnostic approximator. SDK callers may pass exact `inputTokens` / `outputTokens` from the provider's `usage` field and the dashboard will prefer those.
- **Cost**: pure-function table editable from `/settings`. Hot-reloads.
- **No background workers**, no Redis, no queue. Single Node process.

---

## Project layout

```
ai-finops/
├── prisma/
│   ├── schema.prisma        # PromptLog, ModelPricingConfig, OptimizationLog
│   └── seed.ts              # Pricing rows + 40 demo logs
├── src/
│   ├── app/
│   │   ├── page.tsx         # /        Dashboard
│   │   ├── prompts/         # /prompts Browse + filter
│   │   ├── optimizer/       # /optimizer  Live optimizer
│   │   ├── settings/        # /settings Pricing config
│   │   └── api/             # log, stats, prompts, optimize, pricing
│   ├── components/          # Charts, tables, optimizer form, etc.
│   └── lib/
│       ├── tokenizer.ts     # countTokens / estimateOutputTokens
│       ├── categorizer.ts   # analyzePrompt → category + complexity + dimensions
│       ├── optimizer.ts     # optimizePrompt → 8 strategies, ranked suggestions
│       ├── pricing.ts       # DEFAULT_PRICING + getPricing + calculateCost
│       ├── types.ts         # Shared types (used by app AND sdk consumers)
│       └── db.ts            # Prisma singleton
└── sdk/                     # Standalone TypeScript SDK package
    ├── src/                 # FinOpsClient, wrap(), provider helpers
    └── examples/            # anthropic, openai, manual-log
```

---

## Environment

`.env` (already copied from `.env.example`):

```ini
DATABASE_URL="file:./dev.db"
FINOPS_INGEST_TOKEN=""         # set to a secret to require Bearer auth on /api/log
```

For production: swap `DATABASE_URL` to a Postgres URL, set `FINOPS_INGEST_TOKEN`, and `npm run build && npm start`.

---

## Production cost-reduction playbook

The dashboard surfaces *opportunities*. The actual reduction in your bill comes from these moves, in roughly this order:

1. **Turn on prompt caching** for any system prompt the optimizer flags as `system-prompt-extraction`. Often a 60–90% cost cut on those calls with one config change.
2. **Apply the auto-rewritten prompts** for high-volume call sites (chatbots, internal tools). The compression strategies alone typically remove 15–30% of input tokens with zero quality loss.
3. **Route by complexity.** Send `simple` and `factual` calls to the cheapest model in the family (Haiku, 4o-mini, Flash). The optimizer flags these as `use-cheaper-model`. This usually has the largest dollar impact.
4. **Cap output where complexity is modest.** `cap-output` suggestions exist because the most common waste in chat apps is verbose answers to simple questions.
5. **Split multidimensional asks** so each sub-question can be cached, retried, or routed independently.

---

## Roadmap (not built — leave for v0.2)

- Auth on the dashboard itself (currently single-tenant, open).
- Real-time cost alerts (Slack/PagerDuty webhooks).
- Retention-based archival to Parquet.
- A/B comparison: same prompt, two models, side-by-side cost+quality.
- LLM-assisted optimization (using a cheap model to rewrite, scored against the deterministic rules).

---

Built as a working reference implementation of AI FinOps — track, categorize, optimize.
