// Hand-curated changelog for AI FinOps. This is rendered as a public
// "What's new" surface at /changelog, so the tone should be readable by
// engineering leaders and finance ops alike — not raw commit messages.
//
// Conventions:
//   - `version` is semver, latest at index 0.
//   - `date` is ISO yyyy-mm-dd (the date the wave shipped).
//   - `title` is a short narrative banner that explains the *theme* of the
//     release, not just a list of features.
//   - `summary` is one sentence — what changed at a glance.
//   - `sections` group items by sub-theme; items are imperative-mood
//     bullets ("Add X", "Fix Y") that map to actual user-visible changes.
//   - `tags` color-code the release at the card level. Most waves carry
//     `feature`; bug-fix-only releases use `fix`; encryption / auth work
//     uses `security`; perf-focused changes use `performance`; small UX
//     refinements use `polish`.

export type ChangelogTag =
  | 'feature'
  | 'fix'
  | 'security'
  | 'performance'
  | 'polish';

export interface ChangelogSection {
  heading: string;
  items: string[];
}

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  summary: string;
  sections: ChangelogSection[];
  tags: ChangelogTag[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '0.7.0',
    date: '2026-05-29',
    title: 'Tests, Snapshots, Slack, and Audit',
    summary:
      'A reliability-and-collaboration wave: a real Vitest suite, point-in-time insights snapshots, native Slack workspace integration, and a tamper-evident audit log for every dashboard mutation.',
    tags: ['feature', 'security'],
    sections: [
      {
        heading: 'Snapshots',
        items: [
          'Pin moment-in-time copies of the insights output at /snapshots.',
          'Compare any two snapshots side-by-side at /snapshots/compare — used to report on cost-reduction campaigns.',
          'Snapshots immutably store the full computed payload so historical baselines never drift.',
        ],
      },
      {
        heading: 'Slack',
        items: [
          'OAuth installation flow for the AI FinOps Slack app.',
          'Slash commands (/finops cost, /finops insights) backed by signed Slack request verification.',
          'Per-workspace tokens encrypted at rest with the same AES-256-GCM scheme as provider credentials.',
        ],
      },
      {
        heading: 'Audit log',
        items: [
          'Append-only audit log at /audit — every budget change, credential rotation, anomaly resolve, allocation edit, API key revoke, pricing change, demo seed, import run, annotation, snapshot, and login flows through it.',
          'Filter bar (action, target kind, actor, since) with URL-driven pagination.',
          'Payload column captures before/after JSON, capped at 8 KB.',
        ],
      },
      {
        heading: 'Testing',
        items: [
          'Vitest harness covering the optimizer, tokenizer, forecasting, anomaly detection, allocations, audit, and importer math.',
          'Tests use the in-process Prisma client against an isolated SQLite shadow for fast feedback.',
        ],
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-04-30',
    title: 'Native cloud importers, API keys, annotations, allocations',
    summary:
      'Bring-your-own provider keys are now a first-class concept — connect Anthropic, OpenAI, Google, Azure, or an LLM gateway and pull usage natively without CSV plumbing.',
    tags: ['feature', 'security'],
    sections: [
      {
        heading: 'Cloud importers',
        items: [
          'Encrypted provider credentials (Anthropic, OpenAI, Google, Azure, Gateway) at /settings — AES-256-GCM, never logged.',
          'Native importers pull usage rows directly from provider APIs and persist them as PromptLog entries.',
          'Per-provider import jobs tracked in ImportJob with status, range, and record count.',
        ],
      },
      {
        heading: 'API keys',
        items: [
          'Per-app ingest tokens at /api-keys — issue, scope to one or more app names, revoke, and track last-used.',
          'Raw tokens shown ONCE at creation; only SHA-256 hash stored in the DB.',
          '/api/log enforces scoped keys when the FINOPS_REQUIRE_API_KEY flag is set.',
        ],
      },
      {
        heading: 'Annotations',
        items: [
          'Per-prompt annotations (status + free-form note) at /prompts — mark items as investigating, optimized, or wont-fix.',
          'Bulk annotation modal lets you triage many prompts at once.',
        ],
      },
      {
        heading: 'Allocations',
        items: [
          'Allocation rules at /allocations re-split shared LLM pool costs across teams or apps by percentage.',
          'Live preview shows how the rule will rewrite the next dashboard breakdown before you save.',
        ],
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-03-31',
    title: 'Marketing landing, cron, quality, per-app forecasts',
    summary:
      'A polish wave: a real landing page, automated cron-driven imports + digests + anomaly checks, an LLM-output quality score, and per-app forecasting that breaks the projection out by application instead of one global number.',
    tags: ['feature', 'polish'],
    sections: [
      {
        heading: 'Landing + welcome',
        items: [
          'Public marketing landing at / with hero, pricing table, and "what is this?" walkthrough.',
          '/welcome onboarding tour highlighting the dashboard, optimizer, and insights surfaces.',
        ],
      },
      {
        heading: 'Cron',
        items: [
          'Scheduled imports run hourly via /api/cron/scheduled-imports.',
          'Daily anomaly check at /api/cron/anomaly-check writes detected events into AnomalyEvent.',
          'Daily digest broadcast at /api/cron/digest-broadcast emails (or webhooks) the summary card.',
          'Cron endpoints gated behind a shared bearer secret so they can\'t be triggered externally.',
        ],
      },
      {
        heading: 'Quality',
        items: [
          'Quality dashboard at /quality scores prompt outputs using heuristic signals — length adequacy, refusal markers, repetition, structural fit.',
          'Per-prompt quality chip surfaces in the prompts table.',
        ],
      },
      {
        heading: 'Per-app forecast',
        items: [
          'Per-app forecast table at /api/forecast/per-app projects monthly cost broken down by appName.',
          'Highlights which apps are likely to breach their budget before the calendar month closes.',
        ],
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-02-28',
    title: 'Command palette, templates, auth, MCP',
    summary:
      'A productivity wave: keyboard-driven navigation, a curated prompt template gallery, real magic-link authentication, and an MCP server so Claude Desktop can query your FinOps data directly.',
    tags: ['feature', 'security'],
    sections: [
      {
        heading: 'Command palette',
        items: [
          'Cmd/Ctrl-K command palette with fuzzy search over every page and quick action.',
          'Keyboard shortcut hint chip in the nav.',
        ],
      },
      {
        heading: 'Templates',
        items: [
          'Curated prompt template library at /templates — categorized, tagged, with target-model affinity and token estimates.',
          'Detail panel + "Use in Studio" hand-off so you can take a template into the playground in one click.',
        ],
      },
      {
        heading: 'Auth',
        items: [
          'Magic-link login flow at /login — single-use SHA-256-hashed tokens, 15-minute expiry, never stored as plaintext.',
          'Standard finops_session cookie issued on verification; middleware protects every dashboard route.',
          'auth.login / auth.logout / auth.failed events captured in the audit log.',
        ],
      },
      {
        heading: 'MCP server',
        items: [
          'Stand-alone MCP server (mcp-server/) exposing FinOps insights, prompts, optimizer, and budget tools.',
          'Claude Desktop can ask "what\'s driving cost this week?" and get a real answer from your data.',
        ],
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-01-31',
    title: 'Real-time, A/B compare, tour, polish',
    summary:
      'A live-feedback wave: server-sent events stream new prompt logs in real time, an A/B compare view diffs two prompts head-to-head, and an in-app onboarding tour walks first-time users through the surface.',
    tags: ['feature', 'polish'],
    sections: [
      {
        heading: 'Real-time',
        items: [
          'Server-sent events stream at /api/stream pushes new PromptLog rows to subscribed clients.',
          'Live ticker on the dashboard surfaces the most recent log without a refresh.',
          'Auto-refresh component re-fetches its data when the SSE channel signals new activity.',
          'Streaming pulse indicator in the footer shows the SSE connection is healthy.',
        ],
      },
      {
        heading: 'A/B compare',
        items: [
          'Side-by-side prompt diff at /compare with token + cost deltas.',
          'Diff view highlights word-level changes in the prompt and response.',
        ],
      },
      {
        heading: 'Tour',
        items: [
          'First-visit tour overlays at /welcome highlight the dashboard, optimizer, insights, and snapshots.',
          'Tour state persisted in localStorage so it doesn\'t replay.',
        ],
      },
      {
        heading: 'Polish',
        items: [
          'Saved filters at /prompts persist your favorite slices in localStorage.',
          'Scroll-to-top button anchored bottom-right.',
          'Anomaly badge in the nav surfaces the unresolved-alert count.',
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2025-12-31',
    title: 'Anomaly, digest, SDK adapters, API docs, saved views',
    summary:
      'A platform wave: persistent anomaly detection with webhook dispatch, a daily digest summary, first-party SDK adapters for Node/Python/cURL, an interactive API explorer, and saved views on the prompts page.',
    tags: ['feature'],
    sections: [
      {
        heading: 'Anomaly detection',
        items: [
          'Persisted AnomalyEvent rows for cost spikes, new models, expensive prompts, budget breaches, and latency spikes.',
          'Per-event webhook dispatch (Slack-/Teams-compatible) with deduplication by scopeKey within a 24-hour window.',
          'Alerts surface at /anomaly with resolve/dismiss controls.',
        ],
      },
      {
        heading: 'Digest',
        items: [
          'Daily/weekly digest card at /digest renders a printable HTML summary.',
          'Hand-off to email or Slack via the existing webhook plumbing.',
        ],
      },
      {
        heading: 'SDK adapters',
        items: [
          'First-party SDK packages for Node and Python with a shared TypeScript-defined log shape.',
          'cURL recipes in the API docs for low-friction integration tests.',
        ],
      },
      {
        heading: 'API docs',
        items: [
          'Interactive API explorer at /api-docs reads the live openapi.json.',
          'Per-endpoint example bodies and response schemas.',
        ],
      },
      {
        heading: 'Saved views',
        items: [
          'Save filter combinations on /prompts and recall them from the nav dropdown.',
        ],
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2025-11-30',
    title: 'Export, Budget, Forecast, Importers, Demo mode',
    summary:
      'A productionization wave: CSV export everywhere, monthly budgets with threshold alerts, a baseline cost forecast, file-based importers for legacy provider exports, and a one-click demo mode that seeds realistic data.',
    tags: ['feature'],
    sections: [
      {
        heading: 'Export',
        items: [
          'CSV export for prompts, insights, and recommendations from each respective page.',
          'Streamed export pipeline so large datasets don\'t buffer in memory.',
        ],
      },
      {
        heading: 'Budget',
        items: [
          'Per-scope budgets (global, app, user) at /budget with monthly limit and currency.',
          'Threshold alerts at 75 / 90 / 100 % with optional webhook dispatch.',
          'Budget banner on the dashboard once any active budget exists.',
        ],
      },
      {
        heading: 'Forecast',
        items: [
          'Monthly cost forecast card extrapolating from the current month\'s burn.',
          'Backed by a small EWMA model that smooths daily noise.',
        ],
      },
      {
        heading: 'Importers',
        items: [
          'File-based CSV importers at /import for legacy Anthropic, OpenAI, and gateway billing exports.',
          'Per-row dedup against PromptLog so re-imports are idempotent.',
        ],
      },
      {
        heading: 'Demo mode',
        items: [
          'One-click "seed demo data" toggle at /settings populates the DB with realistic multi-app, multi-model usage.',
          'Demo banner surfaces while demo data is loaded.',
        ],
      },
    ],
  },
  {
    version: '0.0.1',
    date: '2025-10-31',
    title: 'Initial: Dashboard, Insights, Optimizer, Studio, Prompts, Settings',
    summary:
      'First public release. The core loop: log a prompt, see its category and cost on the dashboard, drill into insights, and rewrite it cheaper in the optimizer or studio.',
    tags: ['feature'],
    sections: [
      {
        heading: 'Dashboard',
        items: [
          'Live cost, token, and call totals at /.',
          'Category breakdown chart, model breakdown, top spenders.',
        ],
      },
      {
        heading: 'Insights',
        items: [
          'Heuristic insights at /insights — model mismatches, output bloat, prompt redundancy clusters, savings highlight.',
          'Recommendation list with estimated savings per suggestion.',
        ],
      },
      {
        heading: 'Optimizer',
        items: [
          'Side-by-side optimizer at /optimizer rewrites a prompt to use fewer tokens while preserving intent.',
          'Estimated saved tokens + cost per rewrite.',
        ],
      },
      {
        heading: 'Studio',
        items: [
          'Prompt-engineering playground at /studio with live token + cost preview.',
        ],
      },
      {
        heading: 'Prompts',
        items: [
          'Searchable, filterable log of every prompt at /prompts.',
          'Per-prompt detail panel with raw input, response, dimensions, and cost breakdown.',
        ],
      },
      {
        heading: 'Settings',
        items: [
          'Model pricing config (per-model input + output rates) at /settings.',
          'Currency and locale defaults.',
        ],
      },
    ],
  },
];
