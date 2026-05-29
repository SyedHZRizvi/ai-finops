// Server-rendered digest view at /digest. The page wrapper itself uses the
// dashboard's dark theme (so it doesn't clash with the rest of the app),
// but the *embedded* digest HTML is the same self-contained light-mode
// document we serve to /api/digest — meaning the page is a faithful
// preview of what an email recipient would see, and screenshots taken
// here match what lands in the inbox.

import Link from 'next/link';
import { buildDigest, type DigestPeriod } from '@/lib/digest';
import { renderDigestHtml, renderDigestMarkdown } from '@/lib/digestHtml';
import { DigestControls } from '@/components/DigestControls';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
const VALID_PERIODS = new Set<DigestPeriod>(['daily', 'weekly', 'monthly']);

function parsePeriod(raw: string | undefined): DigestPeriod {
  if (raw && (VALID_PERIODS as Set<string>).has(raw)) return raw as DigestPeriod;
  return 'weekly';
}

interface DigestPageProps {
  searchParams: { period?: string };
}

export default async function DigestPage({ searchParams }: DigestPageProps) {
  const period = parsePeriod(searchParams.period);

  // Build the digest server-side. If anything throws (DB down, schema not
  // migrated yet), show a friendly empty state instead of a stack trace.
  let html = '';
  let markdown = '';
  let failure: string | null = null;
  try {
    const data = await buildDigest(period);
    html = renderDigestHtml(data, BASE_URL);
    markdown = renderDigestMarkdown(data);
  } catch (err) {
    failure = err instanceof Error ? err.message : 'failed to build digest';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between fade-up gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text">Digest</h1>
          <p className="text-sm text-muted mt-1 leading-relaxed max-w-2xl">
            A shareable, email-ready summary of AI spend. The view below is exactly what gets sent —
            screenshot it, paste it into Gmail / Outlook, or POST it to a Slack/Teams webhook.
          </p>
        </div>
        <Link href="/" className="btn">
          <span aria-hidden>←</span> Dashboard
        </Link>
      </div>

      {failure ? (
        <div className="card card-pad border-warn/40 bg-warn/5 text-sm text-warn">
          <div className="font-semibold mb-1">Couldn&apos;t build the digest</div>
          <div className="text-xs text-muted leading-relaxed">{failure}</div>
        </div>
      ) : (
        <>
          <div className="fade-up-delay-1">
            <DigestControls period={period} html={html} markdown={markdown} />
          </div>

          {/*
            The rendered digest itself. We mount the full self-contained HTML
            document (including its own <style>) via dangerouslySetInnerHTML
            inside a panel. Browsers will parse the inner <html>/<head>/<body>
            fragment as ordinary nested markup — they won't strip the <style>
            block because it lives inside a regular element. This is the same
            HTML we serve at /api/digest?format=html, just embedded in the
            dashboard frame.
          */}
          <div
            className="card overflow-hidden fade-up-delay-2"
            style={{ background: '#f3f4f6' }}
          >
            <div
              dangerouslySetInnerHTML={{ __html: html }}
              // Reset color/font inside the digest so the dark theme above
              // doesn't bleed into the email-light document below.
              style={{ color: '#111827' }}
            />
          </div>

          <div className="text-xs text-muted text-center leading-relaxed">
            Direct link:{' '}
            <Link
              href={`/api/digest?period=${period}&format=html`}
              className="underline underline-offset-4 hover:text-ink"
            >
              /api/digest?period={period}&amp;format=html
            </Link>
            {' · '}
            <Link
              href={`/api/digest?period=${period}&format=json`}
              className="underline underline-offset-4 hover:text-ink"
            >
              JSON
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
