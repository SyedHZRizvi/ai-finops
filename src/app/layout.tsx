import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';

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
          <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">{children}</main>
          <footer className="text-xs text-muted text-center py-6 border-t border-border/60">
            <Link href="/" className="gradient-text font-semibold hover:opacity-80 transition-opacity">
              AI FinOps
            </Link>
            <span className="mx-2 text-borderBright" aria-hidden>·</span>
            <Link
              href="/prompts"
              className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
            >
              Track
            </Link>
            <span className="mx-2 text-borderBright" aria-hidden>·</span>
            <Link
              href="/insights"
              className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
            >
              Categorize
            </Link>
            <span className="mx-2 text-borderBright" aria-hidden>·</span>
            <Link
              href="/optimizer"
              className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
            >
              Optimize
            </Link>
          </footer>
        </div>
      </body>
    </html>
  );
}
