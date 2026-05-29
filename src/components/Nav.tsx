'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnomalyBadge } from './AnomalyBadge';
import { CommandPaletteHint } from './CommandPaletteHint';
import { SignOutButton } from './SignOutButton';
import { headerGroups as navGroups, allNavItems as items } from '@/lib/navigation';

// Navigation structure lives in src/lib/navigation.ts so this client
// component and the server-side layout footer share one source of truth.
//
// Top nav renders `navGroups` (8 daily-use items in 4 mission groups:
// Track → Classify → Optimize → Control) with subtle vertical dividers
// between groups. Setup / admin / occasional pages live in the footer
// secondary row instead — they're navigable but don't clutter the bar
// every user sees on every page.
//
// Mobile drawer renders the full flat `items` list (header + footer
// extras) since splitting into "primary / secondary" doesn't help on a
// small screen — one scrollable list is friendlier there.

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
