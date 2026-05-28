'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: 'Dashboard' },
  { href: '/insights', label: 'Insights' },
  { href: '/prompts', label: 'Prompts' },
  { href: '/optimizer', label: 'Optimizer' },
  { href: '/studio', label: 'Studio' },
  { href: '/settings', label: 'Settings' },
  { href: '/import', label: 'Connectors' },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-border bg-panel/60 backdrop-blur-xl sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
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
          <span className="chip chip-brand ml-1">beta</span>
        </Link>
        <nav className="flex items-center gap-1">
          {items.map((it) => {
            const active = path === it.href || (it.href !== '/' && path.startsWith(it.href));
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
        </nav>
      </div>
    </header>
  );
}
