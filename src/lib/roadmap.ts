// Public-facing roadmap rendered at /roadmap. Hand-curated so the product
// narrative stays coherent — shipped items mirror the actual delivered
// scope (and link back to their CHANGELOG version), and forward-looking
// items reflect work that is genuinely on the table.
//
// Five lifecycle states + five categories. The page groups by status so
// readers see momentum (a long Shipped column) first.

export type RoadmapStatus = 'shipped' | 'in-progress' | 'planned' | 'considering';

export type RoadmapCategory =
  | 'platform'
  | 'analytics'
  | 'integrations'
  | 'governance'
  | 'experience';

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  category: RoadmapCategory;
  /** Version where this item shipped — only set when status === 'shipped'. */
  shippedIn?: string;
  /** Free-form ETA when in-progress / planned. Never on shipped items. */
  eta?: string;
}

export const ROADMAP: RoadmapItem[] = [
  // -------- Shipped (mirror CHANGELOG) ---------------------------------
  {
    id: 'dashboard-insights',
    title: 'Dashboard, Insights, Optimizer, Studio',
    description:
      'Core loop: log a prompt, see its cost and category, drill into insights, rewrite it cheaper.',
    status: 'shipped',
    category: 'platform',
    shippedIn: '0.0.1',
  },
  {
    id: 'csv-export',
    title: 'CSV export for prompts, insights, recommendations',
    description:
      'Streamed CSV exports across every analytical surface — finance can hand the data to BI without an integration.',
    status: 'shipped',
    category: 'analytics',
    shippedIn: '0.1.0',
  },
  {
    id: 'budgets',
    title: 'Monthly budgets with threshold alerts',
    description:
      'Per-scope (global, app, user) caps with optional webhook dispatch at 75 / 90 / 100 %.',
    status: 'shipped',
    category: 'governance',
    shippedIn: '0.1.0',
  },
  {
    id: 'forecast',
    title: 'Monthly cost forecast',
    description:
      'EWMA-smoothed projection of the current month\'s spend so you can see breach risk before the calendar closes.',
    status: 'shipped',
    category: 'analytics',
    shippedIn: '0.1.0',
  },
  {
    id: 'file-importers',
    title: 'CSV importers for Anthropic / OpenAI / gateway exports',
    description:
      'File-based importers for legacy billing exports with per-row dedup against PromptLog.',
    status: 'shipped',
    category: 'integrations',
    shippedIn: '0.1.0',
  },
  {
    id: 'demo-mode',
    title: 'One-click demo data',
    description:
      'Seed realistic multi-app, multi-model usage so evaluators can drive the dashboard without integrating first.',
    status: 'shipped',
    category: 'experience',
    shippedIn: '0.1.0',
  },
  {
    id: 'anomaly-detection',
    title: 'Persistent anomaly detection',
    description:
      'Detect cost spikes, new models, expensive prompts, budget breaches, latency spikes. Webhook dispatch with 24-hour deduplication.',
    status: 'shipped',
    category: 'analytics',
    shippedIn: '0.2.0',
  },
  {
    id: 'daily-digest',
    title: 'Daily / weekly digest',
    description:
      'Printable HTML summary card with email + Slack hand-off via existing webhook plumbing.',
    status: 'shipped',
    category: 'analytics',
    shippedIn: '0.2.0',
  },
  {
    id: 'sdk-adapters',
    title: 'Node + Python SDK adapters',
    description:
      'First-party SDKs that share a TypeScript-defined log shape with the API.',
    status: 'shipped',
    category: 'integrations',
    shippedIn: '0.2.0',
  },
  {
    id: 'api-explorer',
    title: 'Interactive API docs',
    description:
      'Live OpenAPI explorer at /api-docs with example bodies and response schemas.',
    status: 'shipped',
    category: 'experience',
    shippedIn: '0.2.0',
  },
  {
    id: 'sse-realtime',
    title: 'Real-time SSE stream',
    description:
      'Server-sent events push new prompt logs to subscribed dashboards without a refresh.',
    status: 'shipped',
    category: 'platform',
    shippedIn: '0.3.0',
  },
  {
    id: 'ab-compare',
    title: 'A/B prompt compare',
    description:
      'Side-by-side diff of two prompts with token + cost deltas. Word-level highlighting.',
    status: 'shipped',
    category: 'analytics',
    shippedIn: '0.3.0',
  },
  {
    id: 'onboarding-tour',
    title: 'In-app onboarding tour',
    description:
      'First-visit walkthrough of the dashboard, optimizer, insights, and snapshots.',
    status: 'shipped',
    category: 'experience',
    shippedIn: '0.3.0',
  },
  {
    id: 'command-palette',
    title: 'Cmd-K command palette',
    description:
      'Keyboard-driven navigation with fuzzy search across every page and quick action.',
    status: 'shipped',
    category: 'experience',
    shippedIn: '0.4.0',
  },
  {
    id: 'template-gallery',
    title: 'Prompt template gallery',
    description:
      'Curated library of prompt templates with category, target model, token estimate, and "Use in Studio" hand-off.',
    status: 'shipped',
    category: 'experience',
    shippedIn: '0.4.0',
  },
  {
    id: 'magic-link-auth',
    title: 'Magic-link auth',
    description:
      'Single-use SHA-256-hashed tokens, 15-minute expiry, never stored plaintext. Standard session cookie + middleware-protected routes.',
    status: 'shipped',
    category: 'governance',
    shippedIn: '0.4.0',
  },
  {
    id: 'mcp-server',
    title: 'MCP server for Claude Desktop',
    description:
      'Stand-alone server exposing insights, prompts, optimizer, and budget tools so Claude Desktop can query FinOps data natively.',
    status: 'shipped',
    category: 'integrations',
    shippedIn: '0.4.0',
  },
  {
    id: 'cron-jobs',
    title: 'Scheduled imports, anomaly checks, digests',
    description:
      'Bearer-secret-gated cron endpoints run hourly / daily without external orchestration.',
    status: 'shipped',
    category: 'platform',
    shippedIn: '0.5.0',
  },
  {
    id: 'quality-score',
    title: 'Output quality scoring',
    description:
      'Heuristic quality score per prompt — length adequacy, refusal markers, repetition, structural fit.',
    status: 'shipped',
    category: 'analytics',
    shippedIn: '0.5.0',
  },
  {
    id: 'per-app-forecast',
    title: 'Per-app forecast',
    description:
      'Monthly projection broken out by appName so you can flag the apps about to breach their budget.',
    status: 'shipped',
    category: 'analytics',
    shippedIn: '0.5.0',
  },
  {
    id: 'cloud-importers',
    title: 'Native cloud importers',
    description:
      'Connect Anthropic, OpenAI, Google, Azure, or an LLM gateway directly. Credentials encrypted at rest with AES-256-GCM.',
    status: 'shipped',
    category: 'integrations',
    shippedIn: '0.6.0',
  },
  {
    id: 'api-keys',
    title: 'Per-app ingest API keys',
    description:
      'Issue, scope, and revoke per-app tokens. Raw values shown once; only SHA-256 hashes in DB.',
    status: 'shipped',
    category: 'governance',
    shippedIn: '0.6.0',
  },
  {
    id: 'annotations',
    title: 'Per-prompt annotations',
    description:
      'Mark prompts as investigating, optimized, or won\'t-fix. Bulk triage modal for many prompts at once.',
    status: 'shipped',
    category: 'experience',
    shippedIn: '0.6.0',
  },
  {
    id: 'allocations',
    title: 'Cost allocation rules',
    description:
      'Re-split shared LLM pool cost across teams or apps by percentage with live preview before saving.',
    status: 'shipped',
    category: 'governance',
    shippedIn: '0.6.0',
  },
  {
    id: 'snapshots',
    title: 'Insights snapshots',
    description:
      'Pin moment-in-time copies of the insights output and compare any two — used to report on cost-reduction campaigns.',
    status: 'shipped',
    category: 'analytics',
    shippedIn: '0.7.0',
  },
  {
    id: 'slack-integration',
    title: 'Native Slack workspace',
    description:
      'OAuth installation, slash commands, encrypted per-workspace tokens with signed-request verification.',
    status: 'shipped',
    category: 'integrations',
    shippedIn: '0.7.0',
  },
  {
    id: 'audit-log',
    title: 'Append-only audit log',
    description:
      'Append-only log of every mutating dashboard action. Filter bar, payload column, 8 KB cap per row.',
    status: 'shipped',
    category: 'governance',
    shippedIn: '0.7.0',
  },
  {
    id: 'vitest-suite',
    title: 'Vitest test suite',
    description:
      'Coverage of the optimizer, tokenizer, forecasting, anomaly detection, allocations, audit, and importer math.',
    status: 'shipped',
    category: 'platform',
    shippedIn: '0.7.0',
  },

  // -------- In progress -----------------------------------------------
  {
    id: 'multi-tenant-workspaces',
    title: 'Multi-tenant workspaces',
    description:
      'Top-level workspace isolation so multiple orgs can share a deployment. Workspace-scoped budgets, allocations, audit, and importers.',
    status: 'in-progress',
    category: 'platform',
    eta: 'Q3 2026',
  },
  {
    id: 'native-azure-importer',
    title: 'Native Azure OpenAI importer',
    description:
      'Pull usage rows from Azure OpenAI deployments without CSV plumbing — match the existing Anthropic / OpenAI shape.',
    status: 'in-progress',
    category: 'integrations',
    eta: 'Q3 2026',
  },
  {
    id: 'real-smtp',
    title: 'Real SMTP for magic links + digests',
    description:
      'First-class SMTP integration so magic-link login emails and daily digests stop relying on webhook fan-out.',
    status: 'in-progress',
    category: 'platform',
    eta: 'Q3 2026',
  },
  {
    id: 'multi-currency',
    title: 'Multi-currency support',
    description:
      'Track and display cost in EUR, GBP, JPY in addition to USD. Per-workspace default currency with FX-rate snapshots.',
    status: 'in-progress',
    category: 'analytics',
    eta: 'Q3 2026',
  },
  {
    id: 'csv-streaming-import',
    title: 'Streaming multi-GB CSV imports',
    description:
      'Replace the current in-memory CSV parser with a streaming pipeline so single-shot imports of full provider exports stop OOM-ing.',
    status: 'in-progress',
    category: 'integrations',
    eta: 'Q3 2026',
  },
  {
    id: 'optimizer-llm-pass',
    title: 'LLM-assisted optimizer pass',
    description:
      'Optional second-pass rewrite that calls a small model to refine the heuristic optimizer\'s output, gated behind your own provider credentials.',
    status: 'in-progress',
    category: 'analytics',
    eta: 'Q3 2026',
  },
  {
    id: 'dashboard-customization',
    title: 'Customizable dashboard layout',
    description:
      'Drag-to-reorder cards on the dashboard with per-user layout persistence.',
    status: 'in-progress',
    category: 'experience',
    eta: 'Q4 2026',
  },

  // -------- Planned ---------------------------------------------------
  {
    id: 'rbac',
    title: 'Role-based access control',
    description:
      'Replace the single-shared-password model with named users, roles (admin, analyst, viewer), and per-route enforcement.',
    status: 'planned',
    category: 'governance',
    eta: 'Q4 2026',
  },
  {
    id: 'llm-judge-quality',
    title: 'LLM-judge quality scoring',
    description:
      'Optional LLM-judge mode for the quality dashboard that beats the current heuristic scores on adherence + factuality.',
    status: 'planned',
    category: 'analytics',
    eta: 'Q4 2026',
  },
  {
    id: 'jira-linear-integration',
    title: 'Jira + Linear integration',
    description:
      'Push triaged prompts and anomalies into a Jira or Linear ticket from the dashboard, with bidirectional status sync.',
    status: 'planned',
    category: 'integrations',
    eta: 'Q4 2026',
  },
  {
    id: 'cost-attribution-tags',
    title: 'Tag-based cost attribution',
    description:
      'Slice cost by arbitrary user-supplied tags (cost center, customer id) — extends the existing free-form tag column into a first-class facet.',
    status: 'planned',
    category: 'analytics',
    eta: 'Q4 2026',
  },
  {
    id: 'webhook-templates',
    title: 'Webhook payload templates',
    description:
      'Configurable Slack / Teams / generic webhook templates with per-event variable interpolation.',
    status: 'planned',
    category: 'integrations',
    eta: 'Q1 2027',
  },
  {
    id: 'sso-saml',
    title: 'SAML / OIDC single sign-on',
    description:
      'Enterprise SSO with the standard identity providers (Okta, Azure AD, Google Workspace).',
    status: 'planned',
    category: 'governance',
    eta: 'Q1 2027',
  },
  {
    id: 'historical-import',
    title: 'Backfill historical usage',
    description:
      'Importers extended to backfill arbitrary date ranges instead of only "since last import."',
    status: 'planned',
    category: 'integrations',
    eta: 'Q1 2027',
  },
  {
    id: 'prompt-versioning',
    title: 'Prompt versioning',
    description:
      'Track named prompt versions over time so optimizer rewrites form a navigable history per appName.',
    status: 'planned',
    category: 'analytics',
    eta: 'Q1 2027',
  },

  // -------- Considering ----------------------------------------------
  {
    id: 'mobile-native-apps',
    title: 'Mobile native apps',
    description:
      'iOS + Android viewers focused on dashboard, anomalies, and digest. Read-only first; mutations stay on the web.',
    status: 'considering',
    category: 'experience',
  },
  {
    id: 'voice-integration',
    title: 'Voice query integration',
    description:
      'Ask "what\'s driving cost today?" via a voice assistant (Siri shortcut / Google Assistant) backed by the MCP server.',
    status: 'considering',
    category: 'experience',
  },
  {
    id: 'cost-anomaly-rca',
    title: 'Automated anomaly root-cause analysis',
    description:
      'When an anomaly fires, attribute the spike to the specific app / model / prompt cluster responsible and surface it in the alert.',
    status: 'considering',
    category: 'analytics',
  },
  {
    id: 'fine-tune-tracking',
    title: 'Fine-tune cost tracking',
    description:
      'Capture training costs alongside inference costs so the per-model TCO picture is honest.',
    status: 'considering',
    category: 'analytics',
  },
  {
    id: 'embeddings-tracking',
    title: 'Embeddings + retrieval cost tracking',
    description:
      'First-class support for embedding calls and vector-store retrievals — currently lumped under "other" if logged at all.',
    status: 'considering',
    category: 'analytics',
  },
  {
    id: 'browser-extension',
    title: 'Browser extension capture',
    description:
      'Browser extension that snapshots LLM calls from chat UIs (Claude, ChatGPT, Gemini) for personal-use tracking.',
    status: 'considering',
    category: 'integrations',
  },
  {
    id: 'gpu-cost-tracking',
    title: 'Self-hosted GPU cost tracking',
    description:
      'Attribute self-hosted inference (vLLM, Ollama) cost via amortized GPU-hour math when no per-call dollar amount exists.',
    status: 'considering',
    category: 'analytics',
  },
  {
    id: 'multi-region-deploy',
    title: 'Multi-region deployment guides',
    description:
      'First-party deployment recipes for EU / APAC residency requirements — covers DB, importers, cron, and SSE pinning.',
    status: 'considering',
    category: 'platform',
  },
];
