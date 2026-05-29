import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { DemoBanner } from '@/components/DemoBanner';
import { HealthIndicator } from '@/components/HealthIndicator';
import { Tour } from '@/components/Tour';
import { ScrollToTop } from '@/components/ScrollToTop';
import { StreamingPulse } from '@/components/StreamingPulse';
import { CommandPalette } from '@/components/CommandPalette';
import { ThemeProvider } from '@/components/ThemeProvider';
import { THEME_BOOT_SCRIPT } from '@/lib/themeBootScript';
import { footerExtras } from '@/lib/navigation';
import { FeedbackButton } from '@/components/FeedbackButton';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/metadata';

// Resolve absolute URLs for OG images and canonical links.
// Order: explicit env var → Vercel-injected URL → localhost fallback.
const RESOLVED_BASE_URL =
  (process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000').replace(/\/$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(RESOLVED_BASE_URL),
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
    // suppressHydrationWarning: the THEME_BOOT_SCRIPT mutates data-theme on
    // <html> before React hydrates so the page paints with the correct theme
    // immediately (no flash). Without this hint, React would log a noisy
    // mismatch warning for the attribute change.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <div className="min-h-screen flex flex-col">
            <Nav />
            <DemoBanner />
            <Tour />
            <CommandPalette />
            <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">{children}</main>
            <ScrollToTop />
            <FeedbackButton />
            {/* Secondary footer row — admin / setup / occasional pages
                demoted from the top nav so the header can stay focused on
                daily cost-management work. Rendered above the main footer
                row so the brand + status indicators still anchor the
                bottom of the page. */}
            <nav
              aria-label="Secondary navigation"
              className="text-xs text-muted py-4 border-t border-border/40 flex items-center justify-center gap-x-4 gap-y-2 flex-wrap max-w-7xl mx-auto px-6"
            >
              {footerExtras.map((it, i) => (
                <span key={it.href} className="flex items-center gap-x-4">
                  {i > 0 && (
                    <span className="text-borderBright" aria-hidden>·</span>
                  )}
                  <Link
                    href={it.href}
                    className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
                  >
                    {it.label}
                  </Link>
                </span>
              ))}
            </nav>
            <footer className="text-xs text-muted text-center py-6 border-t border-border/60 flex items-center justify-center gap-3 flex-wrap">
              {/* Track / Categorize / Optimize removed from this primary
                  footer row because they duplicated Prompts / Insights /
                  Optimizer in the header. "AI FinOps" stays as a brand
                  link (stylistically distinct from the header logo, common
                  pattern). The Changelog + Roadmap were removed earlier
                  on the same "don't show users tool-meta" principle. */}
              <Link href="/" className="gradient-text font-semibold hover:opacity-80 transition-opacity">
                AI FinOps
              </Link>
              <span className="text-borderBright" aria-hidden>·</span>
              <Link
                href="/welcome"
                className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
              >
                What is this?
              </Link>
              <span className="text-borderBright" aria-hidden>·</span>
              <Link
                href="/feedback"
                className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
              >
                Feedback
              </Link>
              <span className="text-borderBright" aria-hidden>·</span>
              <HealthIndicator />
              <span className="text-borderBright" aria-hidden>·</span>
              <StreamingPulse showLabel />
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
