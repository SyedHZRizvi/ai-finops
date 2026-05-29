'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnomalyBadge } from './AnomalyBadge';
import { CommandPaletteHint } from './CommandPaletteHint';
import { SignOutButton } from './SignOutButton';

// Nav items organized into mission groups so the original program goal —
// Track → Classify → Optimize — is the first thing the eye lands on. The
// groups also map directly to the 5 layers of cost reduction documented in
// the program: Visibility (Track), Classification (Classify), Recommendations
// + prompt-level work (Optimize), Policy (Control), Plumbing (Connect),
// Operations (Admin). Meta pages (changelog/roadmap/feedback) live in the
// global footer instead — they're about the tool, not about reducing cost.
//
// Subtle vertical dividers render between groups on desktop so the structure
// is visible without needing text labels (which would clutter the bar).
const navGroups: Array<{ label: string; items: Array<{ href: string; label: string }> }> = [
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
      { href: '/studio', label: 'Studio' },
      { href: '/templates', label: 'Templates' },
      { href: '/compare', label: 'Compare' },
    ],
  },
  {
    label: 'Control',
    items: [
      { href: '/budget', label: 'Budget' },
      { href: '/anomaly', label: 'Alerts' },
      { href: '/allocations', label: 'Allocations' },
      { href: '/snapshots', label: 'Snapshots' },
      { href: '/digest', label: 'Digest' },
    ],
  },
  {
    label: 'Connect',
    items: [
      { href: '/import', label: 'Connectors' },
      { href: '/api-keys', label: 'API Keys' },
      { href: '/slack', label: 'Slack' },
      // "Developer API" lives in the Connect group (not Admin) because it's
      // integration plumbing — engineers wiring apps into AI FinOps. The
      // "Developer" prefix on the label makes the audience explicit so a
      // regular dashboard user knows the page isn't for them.
      { href: '/api-docs', label: 'Developer API' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/settings', label: 'Settings' },
      { href: '/audit', label: 'Audit' },
    ],
  },
];

// Flattened list for the mobile drawer — group dividers don't add value in
// a vertical 2-column grid where every item is the same size anyway.
const items = navGroups.flatMap((g) => g.items);

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string): boolean {
    return path === href || (href !== '/' && path.startsWith(href));
  }

  return (
    <header className="border-b border-border bg-panel/60 backdrop-blur-xl sticky top-0 z-20" role="banner">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0 focus-ring" aria-label="AI FinOps home">
          <span className="relative w-8 h-8 rounded-xl bg-brand-gradient shadow-glow flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden
            >
              <path
                d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="font-bold tracking-tight text-base">AI FinOps</span>
          <span className="chip chip-brand ml-1 hidden sm:inline-flex" aria-label="beta">beta</span>
        </Link>

        {/* Desktop nav — wraps gracefully when items don't fit. Items are
            rendered in mission-aligned groups with a thin vertical divider
            between each group. The aria-label on each group element makes
            the structure announceable to screen readers (Track / Classify /
            Optimize / Control / Connect / Admin). */}
        <nav className="hidden lg:flex items-center gap-1 flex-wrap justify-end" aria-label="Primary">
          {navGroups.map((group, gi) => (
            <span key={group.label} className="flex items-center gap-1">
              {gi > 0 && (
                <span
                  aria-hidden
                  className="inline-block w-px h-5 bg-border mx-1"
                  title={group.label}
                />
              )}
              <span
                role="group"
                aria-label={group.label}
                className="flex items-center gap-1"
              >
                {group.items.map((it) => {
                  const active = isActive(it.href);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      aria-current={active ? 'page' : undefined}
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-150 focus-ring ${
                        active
                          ? 'bg-brand/15 text-brandLight border border-brand/30'
                          : 'text-muted hover:text-ink hover:bg-panel2 border border-transparent'
                      }`}
                    >
                      {it.label}
                    </Link>
                  );
                })}
              </span>
            </span>
          ))}
          <CommandPaletteHint />
          <AnomalyBadge />
          <SignOutButton />
        </nav>

        {/* Mobile / narrow trigger */}
        <div className="lg:hidden flex items-center gap-2">
          <CommandPaletteHint compact />
          <AnomalyBadge />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="p-2 rounded-lg border border-border bg-panel2 hover:bg-panel3 focus-ring"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {open ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                  <line x1="6" y1="18" x2="18" y2="6" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round" />
                  <line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round" />
                  <line x1="3" y1="18" x2="21" y2="18" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div id="mobile-nav" className="lg:hidden border-t border-border bg-panel">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 py-3 grid grid-cols-2 gap-1" aria-label="Primary mobile">
            {items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 focus-ring ${
                    active
                      ? 'bg-brand/15 text-brandLight border border-brand/30'
                      : 'text-muted hover:text-ink hover:bg-panel2 border border-transparent'
                  }`}
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
