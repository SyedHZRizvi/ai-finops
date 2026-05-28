# @ai-finops/sdk

## What it is

`@ai-finops/sdk` is the TypeScript client for the AI FinOps dashboard. Drop it
into any Node 18+ app that calls an LLM, wrap your `messages.create` /
`chat.completions.create` call, and every request is automatically streamed to
your self-hosted FinOps dashboard — where it is priced, categorized, scored
for complexity, and analyzed for optimization opportunities. Zero runtime
dependencies, provider-agnostic, fire-and-forget by default so the SDK never
sits on the hot path of your user-facing requests.

## Install

```bash
npm install @ai-finops/sdk
```

If you are using this inside the FinOps monorepo, you can also reference it by
relative path until it is published:

```json
{
  "dependencies": {
    "@ai-finops/sdk": "file:../sdk"
  }
}
```

## Quick start

Three ways to use the SDK, from highest-level to lowest:

### 1. Provider helper wrappers (recommended)

```ts
import Anthropic from '@anthropic-ai/sdk';
import { FinOpsClient, withAnthropicLogging } from '@ai-finops/sdk';

const anthropic = new Anthropic();
const finops = new FinOpsClient({ appName: 'my-app' });

const message = await withAnthropicLogging(
  finops,
  { model: 'claude-sonnet-4-5', promptText: userMessage, userId: user.id },
  () =>
    anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userMessage }],
    }),
);
```

### 2. Generic `wrap` config object

For any provider — pass an extractor that pulls token counts and response text
out of the response shape your SDK returns.

```ts
const result = await finops.wrap({
  provider: 'cohere',
  model: 'command-r-plus',
  promptText: prompt,
  call: () => cohere.chat({ model: 'command-r-plus', message: prompt }),
  extract: (res) => ({
    responseText: res.text,
    inputTokens: res.meta?.tokens?.input_tokens,
    outputTokens: res.meta?.tokens?.output_tokens,
  }),
});
```

### 3. Manual `log`

You've already called the LLM and just want to log it.

```ts
await finops.log({
  model: 'gpt-4o-mini',
  provider: 'openai',
  promptText: prompt,
  responseText: answer,
  inputTokens: 142,
  outputTokens: 87,
  latencyMs: 412,
});
```

## Configuration

### Environment variables

| Variable               | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `FINOPS_BASE_URL`      | Base URL of your dashboard (default `http://localhost:3000`). |
| `FINOPS_INGEST_TOKEN`  | Bearer token sent with every `/api/log` request.        |

### `FinOpsClientOptions`

| Option           | Type                                | Default                      | Purpose                                                                 |
| ---------------- | ----------------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `baseUrl`        | `string`                            | `FINOPS_BASE_URL` or `http://localhost:3000` | Dashboard origin.                                            |
| `token`          | `string`                            | `FINOPS_INGEST_TOKEN`        | Bearer token. Omit when self-hosted on a trusted network.               |
| `appName`        | `string`                            | —                            | Attached to every log; lets the dashboard segment by application.       |
| `defaultUserId`  | `string`                            | —                            | Default `userId` when none is passed per-call.                          |
| `fireAndForget`  | `boolean`                           | `true`                       | When true, `log` returns immediately and POSTs in the background.       |
| `timeoutMs`      | `number`                            | `3000`                       | Abort the ingest POST after this many ms.                               |
| `onError`        | `(err: Error) => void`              | silent                       | Called whenever ingest fails. Never re-thrown to the caller.            |
| `transformPrompt`| `(prompt: string) => string`        | identity                     | Redact / truncate prompt and response text before it leaves the process.|

## Provider examples

### Anthropic

See [`examples/anthropic-example.ts`](./examples/anthropic-example.ts).

```ts
import Anthropic from '@anthropic-ai/sdk';
import { FinOpsClient, withAnthropicLogging } from '@ai-finops/sdk';

const anthropic = new Anthropic();
const finops = new FinOpsClient();

await withAnthropicLogging(
  finops,
  { model: 'claude-sonnet-4-5', promptText: 'Summarize Hamlet.' },
  () =>
    anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 256,
      messages: [{ role: 'user', content: 'Summarize Hamlet.' }],
    }),
);
```

### OpenAI

See [`examples/openai-example.ts`](./examples/openai-example.ts).

```ts
import OpenAI from 'openai';
import { FinOpsClient, withOpenAILogging } from '@ai-finops/sdk';

const openai = new OpenAI();
const finops = new FinOpsClient();

await withOpenAILogging(
  finops,
  { model: 'gpt-4o-mini', promptText: 'Write a haiku.' },
  () =>
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Write a haiku.' }],
    }),
);
```

### Raw `fetch`

If you call the model API directly, just use `client.log` after the response
lands.

```ts
const start = Date.now();
const res = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] }),
});
const json = await res.json();

await finops.log({
  model: 'gpt-4o-mini',
  provider: 'openai',
  promptText: prompt,
  responseText: json.choices[0].message.content,
  inputTokens: json.usage?.prompt_tokens,
  outputTokens: json.usage?.completion_tokens,
  latencyMs: Date.now() - start,
});
```

## What gets logged

Every call to `/api/log` records:

- `model`, `provider`, `appName`, `userId` — for slicing the dashboard.
- `promptText` and `responseText` — the actual content sent / received.
- `inputTokens` / `outputTokens` — auto-computed server-side from the prompt
  and response if you do not supply them. If your provider returns exact
  counts, pass them in for accuracy.
- `latencyMs` — measured by `wrap` automatically; pass explicitly with `log`.
- `metadata` — any arbitrary JSON you want attached (feature flag, A/B arm,
  trace ID, etc.).
- **Total cost** and **potential saved cost** — computed by the dashboard
  using a per-model price table.
- **Category** — the dashboard runs the prompt through a classifier
  (summarization, code-gen, RAG, chat, classification, …).
- **Complexity score** — heuristic measure of prompt difficulty used to
  recommend cheaper models where appropriate.

## Privacy note

By default the SDK sends the full `promptText` and `responseText` to your
self-hosted FinOps dashboard. The dashboard is yours — nothing leaves your
infrastructure — but if you handle PII or regulated data, redact before
sending. Use `transformPrompt`:

```ts
const finops = new FinOpsClient({
  transformPrompt: (text) =>
    text
      .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]')
      .slice(0, 4000),
});
```

`transformPrompt` is applied to both prompt and response text before the POST.

## Reducing cost with FinOps

The point of streaming every call through this SDK is that the dashboard sees
patterns no single call can. It clusters similar prompts, identifies templates
that could be compressed, finds requests routed to an expensive model that a
cheaper model would have handled fine, and surfaces concrete rewrites at
`/optimizer`. In practice, teams that pipe their LLM traffic through the
dashboard typically see 20–40% spend reduction within the first month — not
from algorithmic magic, but from making waste visible.
