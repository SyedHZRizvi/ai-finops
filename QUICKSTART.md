# AI FinOps — Quick Start

Three ways to run this. Pick the one that fits.

---

## 1. Run locally from the unzipped folder (any OS with Node 18+)

```bash
unzip ai-finops.zip
cd ai-finops
cp .env.example .env
npm install
npm run db:push
npx tsx prisma/seed.ts          # optional — populates demo data
npm run dev                      # opens at http://localhost:3000
```

Works identically on macOS, Linux, Windows (WSL or PowerShell). Total install time: ~2 minutes.

---

## 2. Run as a desktop app (Electron — Mac/Windows/Linux)

After completing step 1:

```bash
npm run electron:dev           # dev mode with hot reload
# or
npm run electron:build:mac     # produces .dmg in release/
npm run electron:build:win     # produces .exe (NSIS) in release/
npm run electron:build:linux   # produces .AppImage + .deb in release/
```

The installer in `release/` is a single double-clickable file. Drop it in your org's MDM/Intune for fleet distribution. See [docs/DESKTOP-APP.md](docs/DESKTOP-APP.md) for code-signing notes.

---

## 3. Deploy to production

Three documented one-command paths in [DEPLOY.md](DEPLOY.md). Short version:

| Host | Free tier | DB | Setup |
|---|---|---|---|
| **Render** | yes | SQLite on persistent disk | Connect GitHub repo, click "Deploy Blueprint" |
| **Fly.io** | yes (limited) | SQLite via LiteFS | `fly launch && fly deploy` |
| **Vercel** | yes | requires Postgres (Neon free tier) | `vercel deploy` |

---

## What you get

Visit `/` after the app starts:

| Route | What |
|---|---|
| `/` | Dashboard — costs, tokens, charts, savings |
| `/insights` | **Why your AI bill is high** + ranked recommendations |
| `/prompts` | Per-prompt browser with filters |
| `/optimizer` | Improve any existing prompt |
| `/studio` | Generate optimized prompts for Claude / GPT / Gemini / Copilot / Cursor / Perplexity |
| `/settings` | Pricing table per model |
| `/import` | Manage provider credentials and run imports |
| `/setup` | First-run wizard (auto-redirected on empty DB) |

---

## Feeding it data

Three paths, fully documented in [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md):

1. **SDK**: wrap your LLM calls — `withAnthropicLogging`, `withOpenAILogging`, `withGeminiLogging`, `withPerplexityLogging`, or `withGenericLogging`. Per-prompt accuracy.
2. **Browser extension**: install [extension/](extension/) in Chrome. Adds an "Optimize" button to claude.ai, chat.openai.com, gemini.google.com, perplexity.ai.
3. **Provider importers**: paste your Anthropic / OpenAI admin keys into `/setup`. Pulls aggregated historical usage.

---

## Project layout

```
ai-finops/
├── src/              Next.js app (App Router, server components)
│   ├── app/          Pages and API routes
│   ├── components/   React components
│   └── lib/          Core engines (categorizer, optimizer, insights, ...)
├── prisma/           Schema + seed
├── electron/         Desktop wrapper (main.ts, tray, server-manager)
├── extension/        Chrome browser extension
├── sdk/              Standalone TypeScript SDK package
└── docs/             User manual + integration + deployment guides
```

See [README.md](README.md) for the full pitch and [docs/AI-FinOps-User-Manual.docx](docs/AI-FinOps-User-Manual.docx) for the 109-heading user manual.
