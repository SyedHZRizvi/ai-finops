import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { DemoBanner } from '@/components/DemoBanner';
import { HealthIndicator } from '@/components/HealthIndicator';
import { Tour } from '@/components/Tour';
import { ScrollToTop } from '@/components/ScrollToTop';
import { StreamingPulse } from '@/components/StreamingPulse';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/metadata';

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    type: 'website',
    siteName: SITE_NAME,
    images: ['/og-default.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ['/og-default.svg'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen flex flex-col">
          <Nav />
          <DemoBanner />
          <Tour />
          <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">{children}</main>
          <ScrollToTop />
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
            <span className="text-borderBright" aria-hidden>·</span>
            <StreamingPulse showLabel />
          </footer>
        </div>
      </body>
    </html>
  );
}
