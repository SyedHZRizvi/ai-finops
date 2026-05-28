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
