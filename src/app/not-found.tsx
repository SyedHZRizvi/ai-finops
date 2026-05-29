import Link from 'next/link';
import type { Metadata } from 'next';

// Custom 404. Rendered inside the root layout (Next.js wraps it
// automatically with the <html>/<body> from src/app/layout.tsx, which
// also gives us the Nav). It must not pull anything that needs the DB,
// since a 404 should be reachable even when the data layer is down.

export const metadata: Metadata = {
  title: '404 — Page not found · AI FinOps',
  description: "The page you're looking for doesn't exist.",
  robots: { index: false, follow: false },
};

interface QuickLink {
  href: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  iconClass: string;
}

const LINKS: QuickLink[] = [
  {
    href: '/',
    label: 'Dashboard',
    desc: 'Live cost, tokens, and call volume across your AI footprint.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
    iconClass: 'bg-blue/15 border-blue/30 text-blue',
  },
  {
    href: '/insights',
    label: 'Insights',
    desc: 'Ranked, dollar-impact recommendations to cut your AI bill.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="16 7 22 7 22 13" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    iconClass: 'bg-good/15 border-good/30 text-good',
  },
  {
    href: '/optimizer',
    label: 'Optimizer',
    desc: 'Paste a prompt — see cost, category, and a leaner rewrite.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    iconClass: 'bg-brand/15 border-brand/30 text-brandLight',
  },
];

export default function NotFound() {
  return (
    <div className="space-y-6">
      <section className="hero">
        <div className="relative z-10 max-w-2xl">
          <div className="chip chip-brand mb-4">404 · Page not found</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text">
            Lost?
          </h1>
          <p className="text-sm md:text-base text-inkDim mt-3 leading-relaxed">
            This page doesn&apos;t exist — it may have moved, been renamed,
            or perhaps it never existed at all. Pick a destination below to
            get back on track.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/" className="btn-primary">
              Back to dashboard <span aria-hidden>→</span>
            </Link>
            <Link href="/insights" className="btn">
              View insights
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 fade-up-delay-1">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="card card-interactive card-grad card-pad">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${link.iconClass}`}>
              {link.icon}
            </div>
            <div className="font-semibold text-sm">{link.label}</div>
            <div className="text-xs text-muted mt-1.5 leading-relaxed">{link.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
