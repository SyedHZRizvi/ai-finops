import './globals.css';
import type { Metadata } from 'next';
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
            <span className="gradient-text font-semibold">AI FinOps</span>
            <span className="mx-2 text-muted">·</span>
            Track <span className="mx-1 text-borderBright">·</span> Categorize{' '}
            <span className="mx-1 text-borderBright">·</span> Optimize
          </footer>
        </div>
      </body>
    </html>
  );
}
