// Command registry for the Cmd+K palette.
//
// Each entry is fully self-contained: a stable `id` (used for "recent"
// ranking in localStorage), a primary `title`, optional `subtitle` for
// the second line, optional `keywords` for synonyms that aren't visible
// but boost fuzzy matching, an icon name (rendered by CommandPalette),
// an optional `shortcut` shown as a right-aligned tag, and a `run`
// function that receives a minimal router shim.
//
// We avoid importing next/navigation here so this module can be consumed
// by tests, the palette, or any other surface without pulling React.
//
// Shortcuts here are display-only — the actual key handling lives inside
// CommandPalette where we already own the keyboard model.

export type CommandIcon =
  | 'home'
  | 'chart'
  | 'list'
  | 'wand'
  | 'sparkles'
  | 'compare'
  | 'bell'
  | 'budget'
  | 'mail'
  | 'gear'
  | 'plug'
  | 'docs'
  | 'play'
  | 'search'
  | 'add'
  | 'open'
  | 'help'
  | 'logout'
  | 'tour'
  | 'database'
  | 'lightning';

export type CommandSection =
  | 'Navigate'
  | 'Actions'
  | 'Connectors'
  | 'Documentation'
  | 'Help';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string;
  icon: CommandIcon;
  section: CommandSection;
  /** Display-only hint like `['g', 'd']` for "g then d". */
  shortcut?: string[];
  run: (router: { push: (href: string) => void }) => void | Promise<void>;
}

const PROD_URL = 'https://ai-finops.vercel.app';
const REPO_URL = 'https://github.com/SyedHZRizvi/ai-finops';

/** Tiny helper for opening an external URL in a new tab. */
function openExternal(href: string): void {
  if (typeof window === 'undefined') return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

/** Copy text to the clipboard with a silent fallback. */
async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator === 'undefined') return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers / non-secure contexts: best-effort textarea hack.
    if (typeof document === 'undefined') return;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      // give up silently
    }
    document.body.removeChild(ta);
  }
}

/** POST to /api/demo to seed demo data. Best-effort, fires and forgets. */
async function seedDemoData(): Promise<void> {
  if (typeof fetch === 'undefined') return;
  try {
    await fetch('/api/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'seed', count: 100 }),
      cache: 'no-store',
    });
  } catch {
    // Surface nothing — the palette closes after running and the user
    // can refresh the page to see new rows. We deliberately keep this
    // dependency-free so the registry stays sync-friendly.
  }
}

/** POST to /api/anomaly/check to run a fresh anomaly sweep. */
async function runAnomalyCheck(): Promise<void> {
  if (typeof fetch === 'undefined') return;
  try {
    await fetch('/api/anomaly/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
  } catch {
    // ignore
  }
}

export const COMMANDS: CommandItem[] = [
  // -- Navigate -----------------------------------------------------------
  {
    id: 'nav.dashboard',
    title: 'Dashboard',
    subtitle: 'Overview, KPIs, and live activity',
    keywords: 'home overview kpi root start',
    icon: 'home',
    section: 'Navigate',
    shortcut: ['g', 'd'],
    run: (router) => router.push('/'),
  },
  {
    id: 'nav.insights',
    title: 'Insights',
    subtitle: 'Category & complexity breakdowns',
    keywords: 'analytics categories complexity charts',
    icon: 'chart',
    section: 'Navigate',
    shortcut: ['g', 'i'],
    run: (router) => router.push('/insights'),
  },
  {
    id: 'nav.prompts',
    title: 'Prompts',
    subtitle: 'Browse every logged prompt',
    keywords: 'logs history table rows calls',
    icon: 'list',
    section: 'Navigate',
    shortcut: ['g', 'p'],
    run: (router) => router.push('/prompts'),
  },
  {
    id: 'nav.optimizer',
    title: 'Optimizer',
    subtitle: 'Rewrite a prompt and estimate savings',
    keywords: 'optimize rewrite compress shrink suggest savings',
    icon: 'wand',
    section: 'Navigate',
    shortcut: ['g', 'o'],
    run: (router) => router.push('/optimizer'),
  },
  {
    id: 'nav.studio',
    title: 'Studio',
    subtitle: 'Prompt sandbox & generation playground',
    keywords: 'playground sandbox generate experiment',
    icon: 'sparkles',
    section: 'Navigate',
    shortcut: ['g', 's'],
    run: (router) => router.push('/studio'),
  },
  {
    id: 'nav.compare',
    title: 'Compare',
    subtitle: 'A/B two prompts side by side',
    keywords: 'diff ab versus side by side',
    icon: 'compare',
    section: 'Navigate',
    shortcut: ['g', 'c'],
    run: (router) => router.push('/compare'),
  },
  {
    id: 'nav.anomaly',
    title: 'Alerts',
    subtitle: 'Anomaly detection feed',
    keywords: 'anomaly alerts incidents alarms warnings',
    icon: 'bell',
    section: 'Navigate',
    shortcut: ['g', 'a'],
    run: (router) => router.push('/anomaly'),
  },
  {
    id: 'nav.budget',
    title: 'Budget',
    subtitle: 'Spending caps and burn rate',
    keywords: 'budget spend limit cap monthly',
    icon: 'budget',
    section: 'Navigate',
    shortcut: ['g', 'b'],
    run: (router) => router.push('/budget'),
  },
  {
    id: 'nav.digest',
    title: 'Digest',
    subtitle: 'Daily and weekly cost emails',
    keywords: 'email digest report newsletter weekly daily',
    icon: 'mail',
    section: 'Navigate',
    shortcut: ['g', 'g'],
    run: (router) => router.push('/digest'),
  },
  {
    id: 'nav.settings',
    title: 'Settings',
    subtitle: 'Pricing, tags, and preferences',
    keywords: 'preferences config pricing tags',
    icon: 'gear',
    section: 'Navigate',
    shortcut: ['g', ','],
    run: (router) => router.push('/settings'),
  },
  {
    id: 'nav.connectors',
    title: 'Connectors',
    subtitle: 'Import from Anthropic, OpenAI, CSV',
    keywords: 'import sync providers ingest anthropic openai csv',
    icon: 'plug',
    section: 'Navigate',
    shortcut: ['g', 'n'],
    run: (router) => router.push('/import'),
  },
  {
    id: 'nav.api',
    title: 'API Docs',
    subtitle: 'OpenAPI reference and examples',
    keywords: 'api docs openapi swagger reference endpoints',
    icon: 'docs',
    section: 'Navigate',
    shortcut: ['g', 'k'],
    run: (router) => router.push('/api-docs'),
  },
  {
    id: 'nav.setup',
    title: 'Setup',
    subtitle: 'First-run onboarding wizard',
    keywords: 'onboarding wizard install first run getting started',
    icon: 'play',
    section: 'Navigate',
    shortcut: ['g', 'w'],
    run: (router) => router.push('/setup'),
  },

  // -- Actions ------------------------------------------------------------
  {
    id: 'action.generate-demo',
    title: 'Generate demo data',
    subtitle: 'Seed ~100 realistic prompt logs',
    keywords: 'demo seed sample fixture fake fill populate',
    icon: 'database',
    section: 'Actions',
    run: async () => {
      await seedDemoData();
    },
  },
  {
    id: 'action.run-anomaly',
    title: 'Run anomaly check',
    subtitle: 'Sweep recent activity for spikes',
    keywords: 'anomaly detect run scan check sweep',
    icon: 'lightning',
    section: 'Actions',
    run: async () => {
      await runAnomalyCheck();
    },
  },
  {
    id: 'action.open-prod',
    title: 'Open production URL',
    subtitle: PROD_URL,
    keywords: 'production live vercel deployment external',
    icon: 'open',
    section: 'Actions',
    run: () => openExternal(PROD_URL),
  },
  {
    id: 'action.copy-url',
    title: 'Copy current page URL',
    subtitle: 'Put the current location on your clipboard',
    keywords: 'copy url link share clipboard',
    icon: 'add',
    section: 'Actions',
    run: async () => {
      if (typeof window === 'undefined') return;
      await copyToClipboard(window.location.href);
    },
  },
  {
    id: 'action.restart-tour',
    title: 'Restart tour',
    subtitle: 'Replay the guided product walkthrough',
    keywords: 'tour onboarding walkthrough help guide intro',
    icon: 'tour',
    section: 'Actions',
    run: () => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.removeItem('finops:tour-completed-v1');
      } catch {
        // ignore
      }
      window.dispatchEvent(new CustomEvent('finops:start-tour'));
    },
  },
  {
    id: 'action.search-prompts',
    title: 'Search prompts',
    subtitle: 'Jump to the prompt log table',
    keywords: 'search find filter prompts query lookup',
    icon: 'search',
    section: 'Actions',
    run: (router) => router.push('/prompts'),
  },

  // -- Connectors ---------------------------------------------------------
  {
    id: 'connector.anthropic',
    title: 'Add Anthropic credential',
    subtitle: 'Connect Claude to import token usage',
    keywords: 'anthropic claude api key credential connector',
    icon: 'plug',
    section: 'Connectors',
    run: (router) => router.push('/import?provider=anthropic'),
  },
  {
    id: 'connector.openai',
    title: 'Add OpenAI credential',
    subtitle: 'Connect GPT to import token usage',
    keywords: 'openai gpt chatgpt api key credential connector',
    icon: 'plug',
    section: 'Connectors',
    run: (router) => router.push('/import?provider=openai'),
  },
  {
    id: 'connector.run-import',
    title: 'Run import',
    subtitle: 'Pull the latest usage from configured providers',
    keywords: 'import sync run refresh pull fetch usage',
    icon: 'lightning',
    section: 'Connectors',
    run: async () => {
      if (typeof fetch === 'undefined') return;
      try {
        await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });
      } catch {
        // ignore
      }
    },
  },
  {
    id: 'connector.csv',
    title: 'Upload CSV',
    subtitle: 'Bulk import historical usage from a file',
    keywords: 'csv upload import file bulk historical',
    icon: 'plug',
    section: 'Connectors',
    run: (router) => router.push('/import?tab=csv'),
  },

  // -- Documentation ------------------------------------------------------
  {
    id: 'docs.readme',
    title: 'README',
    subtitle: 'Project overview and quick start',
    keywords: 'readme docs documentation overview intro getting started',
    icon: 'docs',
    section: 'Documentation',
    run: () => openExternal(`${REPO_URL}/blob/main/README.md`),
  },
  {
    id: 'docs.integrations',
    title: 'Integrations guide',
    subtitle: 'INTEGRATIONS.md — provider setup walkthroughs',
    keywords: 'integrations providers anthropic openai docs setup',
    icon: 'docs',
    section: 'Documentation',
    run: () => openExternal(`${REPO_URL}/blob/main/docs/INTEGRATIONS.md`),
  },
  {
    id: 'docs.security',
    title: 'Security audit',
    subtitle: 'SECURITY-AUDIT.md — threat model and posture',
    keywords: 'security audit threat model compliance docs',
    icon: 'docs',
    section: 'Documentation',
    run: () => openExternal(`${REPO_URL}/blob/main/docs/SECURITY-AUDIT.md`),
  },
  {
    id: 'docs.api',
    title: 'API reference',
    subtitle: 'OpenAPI spec and endpoint examples',
    keywords: 'api openapi docs endpoints reference swagger',
    icon: 'docs',
    section: 'Documentation',
    run: (router) => router.push('/api-docs'),
  },

  // -- Help ---------------------------------------------------------------
  {
    id: 'help.shortcuts',
    title: 'Show keyboard shortcuts',
    subtitle: 'List every binding the palette supports',
    keywords: 'keyboard shortcuts hotkeys bindings cheatsheet',
    icon: 'help',
    section: 'Help',
    run: () => {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent('finops:show-shortcuts'));
    },
  },
  {
    id: 'help.repo',
    title: 'Open GitHub repo',
    subtitle: REPO_URL,
    keywords: 'github repo source code repository',
    icon: 'open',
    section: 'Help',
    run: () => openExternal(REPO_URL),
  },
  {
    id: 'help.issue',
    title: 'Report an issue',
    subtitle: 'File a bug on GitHub',
    keywords: 'bug issue report feedback github',
    icon: 'help',
    section: 'Help',
    run: () => openExternal(`${REPO_URL}/issues/new`),
  },
];
