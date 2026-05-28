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
    <header className="border-b border-border bg-panel/70 backdrop-blur sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-gradient-to-br from-brand to-brand2" />
          <span className="font-semibold tracking-tight">AI FinOps</span>
          <span className="chip ml-2">beta</span>
        </Link>
        <nav className="flex items-center gap-1">
          {items.map((it) => {
            const active = path === it.href || (it.href !== '/' && path.startsWith(it.href));
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  active ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink hover:bg-panel2'
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
