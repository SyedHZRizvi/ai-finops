# @ai-finops/mcp-server

> An MCP (Model Context Protocol) server that exposes AI FinOps tools — prompt
> optimization, prompt generation, cost analytics, and anomaly detection — to
> Claude Desktop, Cursor, Cline, Sourcegraph Cody, and any other MCP-capable AI
> client.

A CFO can ask Claude *"what's our AI spend this week and where's it
concentrated?"* — Claude calls our tool. A developer in Cursor can run
*"/finops optimize this prompt"* without leaving the IDE. AI FinOps becomes a
first-class agent tool, not just another dashboard.

---

## What is MCP?

The [Model Context Protocol](https://spec.modelcontextprotocol.io/) is an open
standard from Anthropic (released late 2024) for connecting AI assistants to
external tools and data. Think of it as the "USB-C of AI tooling": one wire,
many clients, many servers. As of mid-2025 it is supported by Claude Desktop,
Cursor, Cline, Continue, Sourcegraph Cody, Zed, and a growing list of IDEs and
chat clients.

This package is the MCP **server** for AI FinOps. Drop it into any MCP client
config and the client suddenly gets eight new tools for tracking and
optimizing LLM cost.

## What this server gives you

Eight tools, each one a clear action the host LLM can pattern-match against
plain English:

| Tool                    | What it does                                                                                   | Example user query                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `optimize_prompt`       | Rewrites a prompt to be shorter and cheaper; reports tokens / dollars saved per call.          | *"Improve this prompt and tell me how much I'd save."*              |
| `generate_prompt`       | Builds a high-quality prompt from a problem statement; returns multiple variants, ranked.      | *"Generate me a prompt to do X, optimized for Claude."*             |
| `compare_prompts`       | Side-by-side cost + classification of two prompts.                                             | *"Compare these two prompts and tell me which is cheaper."*         |
| `analyze_prompt`        | Classifies a prompt by category and complexity without changing it.                            | *"Classify and score this prompt."*                                 |
| `get_stats`             | Total AI spend, token usage, call volume, breakdowns by model/category/complexity.             | *"What's our AI spend this week?"*                                  |
| `get_insights`          | Ranked, dollar-impact recommendations with root-cause analysis.                                | *"Why is our AI bill so high?"*                                     |
| `list_recommendations`  | Top N cost-reduction actions, ordered by monthly dollar savings.                               | *"What are the top 5 things we should do?"*                         |
| `list_anomalies`        | Recent unusual events: cost spikes, new model usage, expensive prompts, budget breaches.       | *"Any unusual spend in the last 24h?"*                              |

Each tool returns a clean, formatted text block the LLM can summarize, quote,
or feed into a follow-up question.

---

## Prerequisites

1. **A running AI FinOps dashboard.** This server talks to the dashboard over
   HTTP — it does not run the dashboard itself. Either:
   - Run it locally: `cd /path/to/ai-finops && npm install && npm run dev`
     (defaults to `http://localhost:3000`), or
   - Point at the hosted instance: `https://ai-finops.vercel.app` (or your own
     deployment).
2. **Node.js 18 or newer** on the machine running your MCP client.

---

## Install

### Option A — global install (after publish)

```bash
npm install -g @ai-finops/mcp-server
```

The binary is named `ai-finops-mcp`. You can then point your MCP client at:

```
"command": "ai-finops-mcp"
```

### Option B — install from this monorepo (today)

```bash
cd /path/to/ai-finops/mcp-server
npm install
npm run build
```

This produces `dist/index.js`. Point your MCP client at:

```
"command": "node",
"args": ["/absolute/path/to/ai-finops/mcp-server/dist/index.js"]
```

> Replace `/path/to/ai-finops` with your actual checkout location (e.g.
> `/Users/syed/Projects/ai-finops`).

---

## Configure your MCP client

The shape is the same across every MCP client — name, command, args,
environment. The location of the config file is what differs.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` on
macOS (or `%APPDATA%\Claude\claude_desktop_config.json` on Windows). Create
the file if it doesn't exist.

```json
{
  "mcpServers": {
    "ai-finops": {
      "command": "node",
      "args": ["/path/to/ai-finops/mcp-server/dist/index.js"],
      "env": {
        "FINOPS_BASE_URL": "https://ai-finops.vercel.app",
        "FINOPS_INGEST_TOKEN": "your-token-here"
      }
    }
  }
}
```

Quit and relaunch Claude Desktop. You should see a hammer icon in the input
box — click it to confirm the eight FinOps tools are listed. If not, check
`~/Library/Logs/Claude/mcp*.log` for the server's stderr output.

### Cursor

Open Cursor's settings (`Cmd+,`), search for "MCP", and edit
`~/.cursor/mcp.json` (or use the UI). Same shape as Claude Desktop:

```json
{
  "mcpServers": {
    "ai-finops": {
      "command": "node",
      "args": ["/path/to/ai-finops/mcp-server/dist/index.js"],
      "env": {
        "FINOPS_BASE_URL": "https://ai-finops.vercel.app",
        "FINOPS_INGEST_TOKEN": "your-token-here"
      }
    }
  }
}
```

Reload Cursor. Open the chat sidebar — the FinOps tools appear in the tool
picker.

### Cline (VS Code)

Open the Cline panel, click the settings gear, choose "MCP Servers", then
"Configure MCP Servers". This opens `~/Library/Application
Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
(macOS) for editing:

```json
{
  "mcpServers": {
    "ai-finops": {
      "command": "node",
      "args": ["/path/to/ai-finops/mcp-server/dist/index.js"],
      "env": {
        "FINOPS_BASE_URL": "https://ai-finops.vercel.app",
        "FINOPS_INGEST_TOKEN": "your-token-here"
      }
    }
  }
}
```

Click the refresh icon in the MCP Servers panel. The tools appear under the
`ai-finops` server.

### Continue / Cody / Zed / other MCP clients

The same JSON shape works — name → object with `command`, `args`, `env`. See
your client's documentation for the file location.

---

## Environment variables

| Variable               | Required? | Default                  | Purpose                                                                                  |
| ---------------------- | --------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `FINOPS_BASE_URL`      | No        | `http://localhost:3000`  | Base URL of your running AI FinOps dashboard. Set this for production.                   |
| `FINOPS_INGEST_TOKEN`  | No        | unset                    | Bearer token sent on every request. Required only if your dashboard enforces ingest auth. |

> The MCP server reads these from the `env` block in your client's MCP config.
> They are **not** read from a `.env` file — MCP servers are launched directly
> by the client process, so set them explicitly.

---

## Try it

Once configured, ask the AI client:

> *"Using ai-finops, what's our AI spend in the last 7 days?"*
> *"Optimize this prompt for me: \[paste prompt]. Use claude-sonnet-4-5 for the pricing."*
> *"Compare these two prompts: A = ...; B = .... Which is cheaper?"*
> *"Give me the top 3 cost-reduction recommendations for the last 30 days."*
> *"Are there any unresolved cost-spike anomalies?"*

The model will pick the right tool, call it, and summarize the output.

---

## Tool reference

Each tool's inputs and outputs in detail.

### `optimize_prompt`

**Input:**
- `prompt` (string, required) — the prompt to optimize.
- `model` (string, optional) — model name for accurate pricing (e.g.
  `claude-sonnet-4-5`, `gpt-4o`, `gpt-4o-mini`).

**Output:** the optimized prompt, original/optimized token counts, savings in
tokens and dollars per call, detected category and complexity, and the list of
optimization strategies that fired (compression, redundancy removal, model
downgrade suggestion, output cap, system-prompt extraction, etc.).

### `generate_prompt`

**Input:**
- `problem` (string, required) — what the user wants to solve.
- `targetProvider` (enum, required) — `claude` | `gpt` | `gemini` | `copilot` |
  `cursor` | `perplexity` | `generic`.
- `desiredOutcome`, `audience`, `outputFormat`, `outputLength`, `tone`,
  `mustInclude`, `mustAvoid`, `starterPrompt` — all optional refinements.

**Output:** the detected complexity / category / dimensions, the recommended
model for this task, and several prompt variants (`terse` / `standard` /
`detailed` / `system-and-user`) each with token cost and a rationale. For
multidimensional problems, a suggested split into N sub-prompts that can share
a cached system prompt.

### `compare_prompts`

**Input:**
- `promptA` (string, required) — baseline.
- `promptB` (string, required) — candidate.
- `model` (string, optional).

**Output:** token counts, estimated cost, and classification for each side;
the token / cost delta; a verdict (`a-better` / `b-better` / `tie`); and
human-readable analysis notes describing classification shifts.

### `analyze_prompt`

**Input:**
- `prompt` (string, required).
- `model` (string, optional).

**Output:** category (`factual` / `reasoning` / `creative` / `code` /
`analytical` / `conversational` / `instructional` / `other`), complexity
(`simple` / `moderate` / `complex` / `multidimensional`) with a 0–100 score,
the distinct dimensions detected, and characteristic flags (has code, has
multiple questions, has context dump, has redundancy, has examples).

### `get_stats`

**Input:**
- `period` (enum, optional) — `24h` | `7d` | `30d` | `all`. Default `7d`.

**Output:** total calls, total tokens (input + output), total cost, average
latency, potential savings (absolute and percent), and per-model /
per-category / per-complexity breakdowns sorted by cost.

### `get_insights`

**Input:**
- `period` (enum, optional) — `24h` | `7d` | `30d` | `all`. Default `30d`.

**Output:** totals, projected monthly + annual savings if all recommendations
applied, cost concentration (Pareto curve), ranked root causes
(concentration, model mismatch, output bloat, redundancy clusters,
multidimensional mega-prompts, missing caching, app hotspots), top N
recommendations with action text, the worst model-mismatch offenders, and the
top app hotspots.

### `list_recommendations`

**Input:**
- `period` (enum, optional) — default `30d`.
- `limit` (number, optional) — default `5`.

**Output:** top N recommendations sorted by monthly dollar savings, each with
action text, monthly + annual savings estimate, affected call count, and
confidence. Ends with the cumulative savings total.

### `list_anomalies`

**Input:**
- `severity` (enum, optional) — `info` | `warn` | `critical`.
- `unresolved` (boolean, optional) — if true, only unresolved events.
- `limit` (number, optional) — default `20`.

**Output:** list of recent anomaly events with kind (`cost-spike` /
`new-model` / `expensive-prompt` / `budget-breach` / `latency-spike`),
severity, title, description, detection time, resolution status.

---

## Troubleshooting

**The MCP client says my server failed to start.**
Check the client's MCP log for the server's stderr output. Common causes:

- The path in `args` is wrong. Use an **absolute** path to `dist/index.js`.
- You forgot to run `npm install && npm run build` in the `mcp-server/`
  directory.
- Node 18+ is not on your PATH. Try absolute Node:
  `"command": "/usr/local/bin/node"`.

**Tools list is empty.**
The server registers tools regardless of whether the FinOps dashboard is
reachable. If the list is empty, the server crashed before
`tools/list` — check stderr.

**Every tool call returns "Cannot reach AI FinOps at …".**
Your dashboard isn't running, or `FINOPS_BASE_URL` is wrong. Test from a
terminal:

```bash
curl -s https://ai-finops.vercel.app/api/health
```

If that returns `{"ok": true}`, the dashboard is fine — double-check the URL
in your MCP config and that the `env` block is present.

**`/api/log` returns 401.**
The dashboard has `FINOPS_INGEST_TOKEN` set and requires a bearer token. Add
it to the `env` block in your MCP config. (Note: only the ingest endpoint
enforces auth today; read-only endpoints used by this server don't, so a
missing token will not block stats/insights/anomalies.)

**Claude Desktop hangs after relaunching.**
Most often this is `console.log()` in a custom build polluting stdout. This
server only ever writes to stderr — if you're seeing this on a fresh build,
file an issue with the contents of `~/Library/Logs/Claude/mcp*.log`.

---

## Security notes

- The MCP server runs **inside the user's machine** as a subprocess of their
  AI client. There is no inbound network port to expose. The only outbound
  traffic is HTTP requests to `FINOPS_BASE_URL`.
- `FINOPS_INGEST_TOKEN`, if set, is held in memory and sent only over HTTPS
  when `FINOPS_BASE_URL` is HTTPS. Use HTTPS in production.
- Prompts sent to `optimize_prompt`, `compare_prompts`, etc. are POSTed to the
  dashboard for analysis. If those prompts contain PII or secrets, you are
  responsible for either (a) trusting your own dashboard's storage policy or
  (b) running this server only against a self-hosted instance you control.
- The server does not write to disk and does not modify state on the
  dashboard (it only POSTs to `/api/optimize`, `/api/compare`, `/api/studio`,
  which are analysis-only and persist optimization runs as anonymous logs).

---

## Developing this server

```bash
cd /path/to/ai-finops/mcp-server
npm install
npm run build      # tsc → dist/
npm start          # node dist/index.js (rarely useful — stdio expects a JSON-RPC client)
```

To test against a live MCP client, point its config at `dist/index.js`,
relaunch the client, and tail the client's MCP log file for stderr output.

Architecture in one diagram:

```
┌──────────────────┐  stdio JSON-RPC  ┌──────────────────────┐  HTTP   ┌────────────────────┐
│ Claude / Cursor  │ ───────────────► │ @ai-finops/mcp-server│ ──────► │ AI FinOps dashboard│
│ Cline / etc.     │ ◄─────────────── │  (this package)      │ ◄────── │  (Next.js API)     │
└──────────────────┘                  └──────────────────────┘         └────────────────────┘
```

All business logic — pricing, tokenization, categorization, optimization,
insights — lives on the dashboard. This server is a translation layer.

---

## License

MIT. See repository root.
