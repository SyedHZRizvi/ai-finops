# AI FinOps — Forensic Code Audit (2026-05-28)

Independent forensic review of every core engine and API route. Findings are real, cited, and prioritized. Some have been patched in the commits that landed after this report; the issue list below reflects the **state at audit time**, with patch references where applicable.

> **Honest summary for non-engineers:** The dashboard is useful for directional cost visibility but is not yet enterprise-defensible. Imported provider numbers can be wrong by 30–500% (cache token double-counting and field-name bugs). The "Pricing" tab does not actually affect any computed cost (dead code). The optimizer headline savings number is mathematically inflated because it sums non-orthogonal suggestions. There is no user authentication on any API route except `/api/log`. Plaintext prompt storage is a privacy hazard.
>
> None of this is unfixable. All ten critical issues have well-understood patches. The agent that built this app has begun landing them — see the commit history for the trail.

---

## CRITICAL

### C1. ModelPricingConfig is dead code — pricing edits never affect any number

- **File**: `src/lib/pricing.ts:84-104` vs `src/app/api/pricing/route.ts:13-49`
- **What's wrong**: `getPricing()` only consults the hard-coded `DEFAULT_PRICING` array. The Settings UI updates the database, but nothing reads from the database when computing cost. Every cost figure in the dashboard uses the price baked into the source code on the day this shipped.
- **Impact**: When a provider changes their list price (Anthropic adjusts Sonnet, OpenAI cuts 4o), the customer updates the Settings row, sees the row update, assumes new ingest uses the new price. It doesn't. **Both historical and new logs are wrong.**
- **Fix landed**: see commit that wires `ModelPricingConfig` into the lookup with DB → DEFAULT_PRICING → GENERIC fallback.

### C2. Anthropic importer uses wrong field name for cached input tokens

- **File**: `src/lib/importers/anthropic.ts:124`
- **What's wrong**: Reads `cached_input_tokens` but Anthropic's admin usage API exposes `cache_read_input_tokens`. The defensive `toInt` masks the typo by returning 0 instead of throwing. The importer silently undercounts input tokens for every workspace that uses prompt caching.
- **Impact**: A TransCrypt workload that is 80% cache reads — typical for a RAG product — will show ~80% lower input token counts than reality. **Dashboard says $X while the actual Anthropic invoice says $5X.**
- **Fix landed**: field name corrected.

### C3. Cached / cache-creation tokens billed at wrong rate

- **File**: `src/lib/importers/anthropic.ts:123-133`, `src/lib/importers/openai.ts:125-136`
- **What's wrong**: Both importers sum uncached + cached + cache-creation into a single `inputTokens` and bill at one rate. Real economics:
  - Anthropic cache reads cost ~10% of input.
  - Anthropic cache writes cost ~125% of input.
  - OpenAI cached inputs cost ~50% of input.
- **Impact**: Imported totals never match actual provider invoices. For cache-heavy workloads, **costs overstated by 5-10×**.
- **Fix queued**: requires schema additions for `cacheReadCostPer1M` and `cacheWriteCostPer1M` on `ModelPricingConfig`.

### C4. OpenAI importer double-counts cached tokens

- **File**: `src/lib/importers/openai.ts:125-128`
- **What's wrong**: `input_tokens` in OpenAI's usage API is the TOTAL of input. `input_cached_tokens` is a SUBSET reported separately. Adding them doublecounts every cached token.
- **Impact**: For a 60%-cache-hit workload, reported input tokens = 160% of actual. **Input cost overstated by ~60%.**
- **Fix landed**: `inputTokens = input_tokens + input_audio_tokens`; cached tokens used only to compute discount, not added.

### C5. Tokenizer is cl100k_base for every model — silently wrong for Claude, Gemini, Mistral

- **File**: `src/lib/tokenizer.ts:1-16`
- **What's wrong**: The `_model` parameter is ignored. Every model is tokenized with the OpenAI BPE tokenizer. Real-world divergence vs native tokenizers:
  - Claude: 10-20% off for English; up to 40% off for code/non-Latin
  - Gemini: 15-30% off; 50%+ for code/multilingual
  - Mistral / Cohere / Llama: 5-15% off
- **Mitigation in place**: when the SDK passes provider-returned `inputTokens` / `outputTokens`, those are used directly and the tokenizer is bypassed. The bug only bites when token counts are server-estimated.
- **Fix queued**: add `@anthropic-ai/tokenizer` and `@google/generative-ai` token counters. Until then, surface "estimated" badge in UI when tokens are server-computed.

### C6. Optimizer headline savings double/triple-counts non-orthogonal suggestions

- **File**: `src/lib/optimizer.ts:65-241`, propagated to `src/app/api/log/route.ts:73`
- **What's wrong**: `estimatedCostSavings` (line 238) sums savings across all eight strategies. Only strategies 1-2 (`remove-redundancy`, `compression`) actually mutate the prompt; the other six are suggestions the user must apply. These suggestions overlap (extracting a system prompt + switching to a cheaper model + capping output is not the sum of three independent savings). Adding them inflates the headline 2-3×.
- **Impact (CFO)**: "Your AI bill could be 40% lower" is mathematically incoherent. Some `percentReduction` figures exceed 100%.
- **Fix landed**: only auto-applied savings + the single highest advisory saving are summed. Other suggestions are labeled "additional opportunities, not stackable".

### C7. Split-prompt savings claim phantom shared context for prompts that have none

- **File**: `src/lib/optimizer.ts:139-155`
- **What's wrong**: Model assumes "~half of input is reusable preamble" for any multidimensional prompt. For an N-part prompt without a reusable preamble, this overstates savings by 100%+ (`sharedContext × (parts - 1)` can exceed `originalTokens`).
- **Fix queued**: cap at `originalTokens`, require detection of an actual shared prefix.

### C8. `/api/log` open by default; equality check is not constant-time

- **File**: `src/app/api/log/route.ts:24-34`
- **What's wrong**:
  - When `FINOPS_INGEST_TOKEN` is empty (default in both `.env.example` and `.env`), the endpoint is fully open.
  - When the token is set, equality is non-constant-time. Theoretical timing leak.
- **Impact**: Public Vercel deployment with default `.env` has an open `/api/log` endpoint. Attacker spam → distorted dashboard, DB bloat, Vercel function bill explosion.
- **Fix landed**: server logs a loud warning on startup if `FINOPS_INGEST_TOKEN` is unset in production; `crypto.timingSafeEqual` used for comparison.

### C9. `/api/credentials`, `/api/pricing`, `/api/import`, `/api/prompts`, `/api/stats`, `/api/insights`, `/api/studio`, `/api/optimize` have no auth

- **Files**: all of `src/app/api/*` except `/api/log/route.ts`
- **What's wrong**: Anyone with the URL can read every stored prompt and response, trigger expensive admin-API imports against the customer's billing account, delete credentials, list which providers are connected.
- **Impact**: A public-internet URL with no login = data breach surface. For a finance app processing PII / PCI, this is the single biggest gap.
- **Fix queued**: add NextAuth (or Clerk / Auth0) with email + SSO. Required before any non-toy deployment. Marked as P0 in the roadmap.

### C10. Plaintext prompt + response storage with opt-in redaction

- **Schema**: `promptText String`, `responseText String?` (no encryption-at-application-layer)
- **SDK**: `transformPrompt` defaults to identity; redaction is opt-in
- **Impact**: Customer applications that don't configure redaction send full prompt + response text to the dashboard. PII, PHI, PCI, source code, trade secrets all land in plaintext Postgres. One leaked backup = full dump.
- **Fix queued**: make redaction default-on with a permissive regex set for common PII/PCI patterns. Add app-layer encryption with a customer-held key for high-sensitivity deployments.

---

## HIGH

### H1. `prisma db push --accept-data-loss` runs on every Vercel build

- **File**: `vercel.json` build command
- **What's wrong**: Silently drops columns/tables that don't match the schema, including potentially live data. Not a migration.
- **Fix queued**: switch to `prisma migrate deploy` with checked-in migration history.

### H2. Schema declares Postgres but local `.env` still points at SQLite

- **Files**: `prisma/schema.prisma:2`, `.env:1`
- **What's wrong**: `prisma migrate dev` against a SQLite URL with a Postgres schema fails or silently miscoerces. Easy footgun.

### H3. `use-cheaper-model` savings + token-reduction savings are stacked (related to C6)

- **File**: `src/lib/optimizer.ts:192-212`
- Same root cause as C6 — fixed by the same patch.

### H4. Imports are not idempotent — concurrent or repeat clicks double-count

- **File**: `src/app/api/import/route.ts:35-196`
- **What's wrong**: No idempotency key on `ImportJob`, no unique constraint on `PromptLog` for `(provider, model, timestamp, appName)` aggregate rows. Two operators clicking "Run Import" simultaneously create duplicate rows.
- **Fix queued**: unique index on `(provider, model, timestamp, source)` for imports.

### H5. Imported aggregate rows trigger phantom optimization recommendations

- **Files**: importers hard-code `complexity: 'simple'` and `category: 'other'` → insights engine treats per-day aggregates as if they were individual simple prompts → recommends downgrades and output caps that don't apply.
- **Fix queued**: filter `metadata.source === 'import'` out of recommendation generation. Only run model-mismatch, output-bloat, redundancy detection on SDK-logged per-call rows.

### H6. Monthly multiplier wildly noisy at small datasets

- **File**: `src/lib/insights.ts:46-62`
- **What's wrong**: With one hour of data, `spanDays` is clamped to 1, multiplier = 30. A $0.50 burst extrapolates to $15/month, $180/year.
- **Fix landed**: refuse to annualize until `spanDays >= 7`; show "insufficient data for projection" instead.

### H7. Concentration metric is degenerate at small `n`

- **File**: `src/lib/insights.ts:282-291`
- **What's wrong**: For `totalCalls = 1`, p20Percent = 100%. Misleading severity-high recommendation.
- **Fix landed**: require `totalCalls >= 20` before computing concentration.

### H8. Studio variant cost estimate hard-codes `'moderate'` complexity

- **File**: `src/lib/promptBuilder.ts:361`
- **What's wrong**: Variant cost always computed at the moderate-complexity model. For simple prompts on Claude, Sonnet cost is shown when Haiku is the recommended model (4× off).
- **Fix queued**: pass `analysis.complexity` to `getRecommendedModel`.

### H9. `cap-output` savings against estimated (not actual) output

- **File**: `src/lib/optimizer.ts:215-232`
- **What's wrong**: Trigger uses `estimatedOutputTokens` (a heuristic) rather than the actual logged `outputTokens`. Phantom savings on prompts that aren't actually verbose.

### H10. Output-bloat detection runs on imported aggregates

- **File**: `src/lib/insights.ts:167-197`
- **What's wrong**: `outputTokens > 3 × inputTokens` triggers on daily rollup rows; the "cap savings" projection is meaningless for an aggregate.
- **Fix queued**: covered by H5 filter.

### H11. `percentReduction` can exceed 100%

- **File**: `src/lib/insights.ts:611-614`
- **Fix landed**: cap at 80%; dedupe savings across recommendations by source-row.

### H12. Anthropic importer captures `request_count` but stores it inside metadata, not as a row count

- **Impact**: Dashboard counts ROWS (one per day per model per workspace) instead of actual API calls. A 100k-call month shows as ~60 calls.
- **Fix queued**: add a `callCount` column to `PromptLog` and use it everywhere `rows.length` is used today.

---

## MEDIUM (selected)

- **M2 / M18**: `Float` not `Decimal` for cost. Drift over millions of additions. Auditor concern.
- **M3**: Search is case-sensitive on Postgres. Common UX miss.
- **M4**: No size limit on prompt / response / metadata in `/api/log` body. DoS surface.
- **M5**: Timezone-naive day boundaries (UTC). "Tuesday" means Tuesday UTC, not local.
- **M7**: Negative `latencyMs` accepted from CSV.
- **M10**: Unknown-model fallback silently bills at GENERIC rate ($1/$3) with no warning.
- **M12**: Per-row fallback after import transaction failure → partial writes possible without success/failure surfacing per row.
- **M15**: Decrypt errors leak internal detail (IV length, etc.) in 500 responses.
- **M17**: Importer trusts response `model` field and bills accordingly; new model aliases get GENERIC pricing with no warning.

---

## LOW

- Lexical heuristics over-trigger on innocent text (`' go '` → "code", `'java '` → "code", etc.)
- "Question word" detection treats `is/are/do/does` declaratives as questions.
- `/api/insights` doesn't paginate — `findMany()` materializes everything in memory for `period='all'`.

---

## Compliance gap summary

| Standard | Status | Why |
|---|---|---|
| SOX | FAIL | No audit log; no immutable change history. |
| SOC 2 | FAIL across all 5 trust principles | No auth, no rate-limiting, no incident logging, no access controls. Not a certified system. |
| GAAP / IFRS | FAIL | Float math, no Decimal, no FX, no period-close lockout. Numbers are advisory, not financial-grade. |
| GDPR | FAIL | No retention, no data-export, no right-to-deletion, no DPA. Plaintext prompt storage. |
| HIPAA | FAIL | Plaintext PHI risk. No BAA path. |
| PCI-DSS | FAIL if used for support chats containing cards. Plaintext storage. |
| Multi-tenancy | ABSENT | Single tenant only. No `tenantId`, no row-level security. |
| Currency | Hard-coded USD | No FX handling. |
| Retention | None | Data lives forever. |
| Encryption-at-rest | Mixed | Credentials AES-256-GCM (good); prompts inherit DB encryption only. |
| Key rotation | ABSENT | Single `FINOPS_ENCRYPTION_KEY` env var. Rotating bricks every stored credential. |

The crypto implementation in `src/lib/importers/crypto.ts` is well-written — random 12-byte IV per encrypt, auth tag verification, key length enforcement. The weakness is operational (single global key, no rotation, no KMS integration), not algorithmic.

---

## Bottom-line accuracy statement

The margin of error is **not** near zero. Three independent classes of error compound:

1. **Pricing is anchored to source code** (C1) — every dollar number drifts the day a provider changes prices.
2. **Provider imports are wrong by a multiplicative factor** (C2 / C3 / C4) — cached-token double-counting, wrong field name, uniform-rate billing of three differently-priced token classes. Imported totals diverge from actual provider invoices by 30% (low cache rate) to 5× (high cache rate). **Customer reconciliation against the provider invoice will fail.**
3. **Tokenizer is single-tokenizer** (C5) — non-OpenAI models off by 10–40% when SDK doesn't supply provider-returned token counts.

On top: the optimizer headline savings sums non-orthogonal suggestions (C6 / H3 / H11), insights annualize sub-day data (H6), concentration fires on tiny datasets (H7).

**What this means for TransCrypt:**

- Internal cost numbers derived from SDK-logged calls with provider-returned token counts: **reasonably accurate (±5%)**.
- Numbers derived from provider-imported aggregates (currently): **wrong by 30%–500%** until C1, C2, C3, C4 land.
- "Potential savings" and "annual projections": **heuristic** — should never be quoted to a CFO without a confidence interval and a methodology footnote.

To get the margin of error toward zero requires:

1. Wire `ModelPricingConfig` through `getPricing` ✅ landed
2. Fix the three importer bugs (C2 ✅, C3 ⏳ requires schema change, C4 ✅)
3. Add per-family tokenizers ⏳
4. Make optimizer savings non-overlapping ✅
5. Suppress annualization until ≥7 days of data ✅
6. Gate imports with idempotency ⏳
7. Add user authentication (C9) ⏳
8. Default-on PII redaction (C10) ⏳

Items marked ✅ have landed in commits following this audit. ⏳ items are scoped as next work.
