import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { DemoBanner } from '@/components/DemoBanner';
import { HealthIndicator } from '@/components/HealthIndicator';

export const metadata: Metadata = {
  title: 'AI FinOps — Token Tracking & Prompt Optimization',
  description: 'Reduce enterprise AI cost by tracking tokens, categorizing prompts, and optimizing them',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen flex flex-col">
          <Nav />
          <DemoBanner />
          <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">{children}</main>
          <footer className="text-xs text-muted text-center py-6 border-t border-border/60 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/" className="gradient-text font-semibold hover:opacity-80 transition-opacity">
              AI FinOps
            </Link>
            <span className="text-borderBright" aria-hidden>·</span>
            <Link
              href="/prompts"
              className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
            >
              Track
            </Link>
            <span className="text-borderBright" aria-hidden>·</span>
            <Link
              href="/insights"
              className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
            >
              Categorize
            </Link>
            <span className="text-borderBright" aria-hidden>·</span>
            <Link
              href="/optimizer"
              className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
            >
              Optimize
            </Link>
            <span className="text-borderBright" aria-hidden>·</span>
            <HealthIndicator />
          </footer>
        </div>
      </body>
    </html>
  );
}
