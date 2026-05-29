'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnomalyBadge } from './AnomalyBadge';
import { CommandPaletteHint } from './CommandPaletteHint';
import { SignOutButton } from './SignOutButton';

const items = [
  { href: '/', label: 'Dashboard' },
  { href: '/insights', label: 'Insights' },
  { href: '/quality', label: 'Quality' },
  { href: '/snapshots', label: 'Snapshots' },
  { href: '/prompts', label: 'Prompts' },
  { href: '/optimizer', label: 'Optimizer' },
  { href: '/studio', label: 'Studio' },
  { href: '/templates', label: 'Templates' },
  { href: '/compare', label: 'Compare' },
  { href: '/anomaly', label: 'Alerts' },
  { href: '/budget', label: 'Budget' },
  { href: '/allocations', label: 'Allocations' },
  { href: '/digest', label: 'Digest' },
  { href: '/settings', label: 'Settings' },
  { href: '/api-keys', label: 'API Keys' },
  { href: '/import', label: 'Connectors' },
  { href: '/slack', label: 'Slack' },
  { href: '/audit', label: 'Audit' },
  { href: '/api-docs', label: 'API' },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string): boolean {
    return path === href || (href !== '/' && path.startsWith(href));
  }

  return (
    <header className="border-b border-border bg-panel/60 backdrop-blur-xl sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
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
          <span className="chip chip-brand ml-1 hidden sm:inline-flex">beta</span>
        </Link>

        {/* Desktop nav — wraps gracefully when items don't fit */}
        <nav className="hidden lg:flex items-center gap-1 flex-wrap justify-end">
          {items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-brand/15 text-brandLight border border-brand/30'
                    : 'text-muted hover:text-ink hover:bg-panel2 border border-transparent'
                }`}
              >
                {it.label}
              </Link>
            );
          })}
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
            className="p-2 rounded-lg border border-border bg-panel2 hover:bg-panel3"
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
        <div className="lg:hidden border-t border-border bg-panel">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 py-3 grid grid-cols-2 gap-1">
            {items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
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
