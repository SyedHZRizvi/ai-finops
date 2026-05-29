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

## Framework adapters

The wrappers above are great when you own every LLM call site. Real apps
usually go through a framework — LangChain, Vercel AI SDK, or just the raw
OpenAI SDK with calls scattered across many files. The adapters below plug
into each framework's native extension point so you instrument the whole app
with one line.

All three adapters keep the SDK zero-dependency: we declare each framework's
public interface inline as TypeScript types, and the adapter is a structural
match — you install the framework, we never do.

### LangChain

LangChain calls `BaseCallbackHandler` lifecycle methods as a run progresses.
`FinOpsLangChainHandler` implements that contract — attach it once and every
LLM call inside that runnable (or chain of runnables) is logged.

See [`examples/langchain-example.ts`](./examples/langchain-example.ts).

```bash
npm install @langchain/openai @langchain/core
```

```ts
import { ChatOpenAI } from '@langchain/openai';
import { FinOpsClient, FinOpsLangChainHandler } from '@ai-finops/sdk';

const finops = new FinOpsClient({ appName: 'rag-pipeline' });
const handler = new FinOpsLangChainHandler(finops);

const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
  callbacks: [handler],
});

await model.invoke('Summarize this doc.');
```

The handler reads tokens from `llmOutput.tokenUsage`, the model from the run
metadata, and the response text from the `generations` array. Errors during
a run drop the cached prompt so memory stays bounded. Reuse the same handler
across many models and chains — it's stateful per run, not per app.

For multi-tenant apps, supply `resolveUserId` to lift the user off LangChain
metadata or tags:

```ts
const handler = new FinOpsLangChainHandler(finops, {
  resolveUserId: ({ metadata }) =>
    typeof metadata?.userId === 'string' ? metadata.userId : undefined,
});

await chain.invoke({ input }, { metadata: { userId: 'user_123' } });
```

### Vercel AI SDK

The AI SDK has a `LanguageModelV1Middleware` interface with `wrapGenerate` and
`wrapStream` hooks. `finopsMiddleware` returns a middleware you pass through
`wrapLanguageModel` — every `generateText`, `streamText`, `generateObject`,
and `streamObject` call against the wrapped model is logged.

See [`examples/vercel-ai-sdk-example.ts`](./examples/vercel-ai-sdk-example.ts).

```bash
npm install ai @ai-sdk/openai
```

```ts
import { generateText, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { FinOpsClient, finopsMiddleware } from '@ai-finops/sdk';

const finops = new FinOpsClient({ appName: 'my-app' });
const model = wrapLanguageModel({
  model: openai('gpt-4o-mini'),
  middleware: finopsMiddleware(finops),
});

const { text } = await generateText({ model, prompt: 'Write a haiku.' });
```

For streaming, the middleware tees the stream — the consumer-facing stream is
unchanged and we accumulate text + final usage on a parallel reader. One log
is sent per call after the stream completes (or aborts).

`resolveUserId` and `resolveMetadata` let you lift fields off the request:

```ts
finopsMiddleware(finops, {
  resolveUserId: (params) => {
    const u = params.headers?.['x-user-id'];
    return typeof u === 'string' ? u : undefined;
  },
  resolveMetadata: () => ({ feature: 'summarizer' }),
});
```

### OpenAI SDK middleware

The OpenAI Node SDK exposes a `fetch` option on its constructor. Pass the
FinOps fetch wrapper and every chat completion, completion, and responses-API
call routed through that client is logged — including streaming responses.

See [`examples/openai-middleware-example.ts`](./examples/openai-middleware-example.ts).

```bash
npm install openai
```

```ts
import OpenAI from 'openai';
import { FinOpsClient, finopsOpenAIFetch } from '@ai-finops/sdk';

const finops = new FinOpsClient({ appName: 'my-app' });
const openai = new OpenAI({
  fetch: finopsOpenAIFetch(finops),
});

await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Write a haiku.' }],
});
```

Streaming works the same way: the wrapper tees the SSE response, so your
`for await (const chunk of stream)` loop sees every chunk live, and a single
FinOps log is sent after the stream finishes. Pass
`stream_options: { include_usage: true }` if you want exact token counts —
otherwise the dashboard's server-side tokenizer fills them in.

Because this is "just a `fetch`", it also works for OpenAI-compatible
endpoints. Tag the provider so the dashboard reports correctly:

```ts
const groq = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
  fetch: finopsOpenAIFetch(finops, { provider: 'groq' }),
});
```
