// Single source of truth for the program's navigation structure.
//
// Two consumers:
//   - <Nav /> (client component) renders `headerGroups` as the top bar and
//     `allNavItems` (flat) as the mobile drawer.
//   - The root layout footer (server component) renders `footerExtras` as
//     a secondary line of admin / setup / occasional links.
//
// We split nav items by *how often a regular cost-focused user touches them*:
//   - Header items   = daily cost-management work (Dashboard, Insights,
//                       Optimizer, Budget, Alerts, etc.) — must be one click
//                       away at all times.
//   - Footer extras  = setup-once admin pages (Connectors, API Keys, Slack,
//                       Settings, Audit, Developer API) plus advanced or
//                       weekly-cadence user features (Studio, Templates,
//                       Snapshots, Allocations, Digest). They're still
//                       navigable, just demoted out of the top bar.

export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Top-nav groups — the things a user reducing AI cost touches every day.
 * Mapped to the original program's mission verbs: Track → Classify →
 * Optimize → Control. Eight items total.
 */
export const headerGroups: NavGroup[] = [
  {
    label: 'Track',
    items: [
      { href: '/', label: 'Dashboard' },
      { href: '/prompts', label: 'Prompts' },
    ],
  },
  {
    label: 'Classify',
    items: [
      { href: '/insights', label: 'Insights' },
      { href: '/quality', label: 'Quality' },
    ],
  },
  {
    label: 'Optimize',
    items: [
      { href: '/optimizer', label: 'Optimizer' },
      { href: '/compare', label: 'Compare' },
    ],
  },
  {
    label: 'Control',
    items: [
      { href: '/budget', label: 'Budget' },
      { href: '/anomaly', label: 'Alerts' },
    ],
  },
];

/**
 * Footer secondary row — pages a user touches occasionally (Studio,
 * Templates, Snapshots, Allocations, Digest) or that are admin/setup tier
 * (Connectors, API Keys, Slack, Settings, Audit, Developer API).
 *
 * Order: user-facing extras first, then setup/admin, with Developer API
 * last because it's the narrowest audience.
 */
export const footerExtras: NavItem[] = [
  // Occasional but user-facing
  { href: '/studio', label: 'Studio' },
  { href: '/templates', label: 'Templates' },
  { href: '/snapshots', label: 'Snapshots' },
  { href: '/allocations', label: 'Allocations' },
  { href: '/digest', label: 'Digest' },
  // Admin / setup / developer
  { href: '/import', label: 'Connectors' },
  { href: '/api-keys', label: 'API Keys' },
  { href: '/slack', label: 'Slack' },
  { href: '/settings', label: 'Settings' },
  { href: '/audit', label: 'Audit' },
  { href: '/api-docs', label: 'Developer API' },
];

/**
 * Flat list of every navigable page — used by the mobile drawer (where
 * splitting into header vs. footer doesn't help; a single scrollable list
 * is friendlier on a small screen).
 */
export const allNavItems: NavItem[] = [
  ...headerGroups.flatMap((g) => g.items),
  ...footerExtras,
];
