import type { Metadata } from 'next';
import { LoginForm } from '@/components/LoginForm';
import { MagicLinkForm } from '@/components/MagicLinkForm';
import { isAuthEnabled } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  // Search engines have no business indexing the gate.
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  searchParams: { error?: string; next?: string };
}

/**
 * Is magic-link sign-in available? It is enabled whenever the operator has
 * configured a From: address — that's the minimum required for any email
 * to leave the box. Transport-specific config (API keys, SMTP URL) is
 * checked by the mailer itself.
 */
function isMagicLinkEnabled(): boolean {
  const from = (process.env.FINOPS_MAIL_FROM ?? '').trim();
  // We also accept the console transport when explicitly opted in — handy
  // for self-hosted demos where the operator wants to copy-paste links from
  // server logs.
  const transport = (process.env.FINOPS_MAIL_TRANSPORT ?? '').trim().toLowerCase();
  return from.length > 0 || transport === 'console';
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  // When auth is fully disabled we still render a stub so the route doesn't
  // 404 if someone visits it manually. The middleware never redirects here
  // in that mode, so this is purely a courtesy.
  const passwordEnabled = isAuthEnabled();
  const magicEnabled = isMagicLinkEnabled();

  // Sanitize `next` to a relative path so we can't be turned into an open
  // redirect (`?next=https://evil.example`). Anything not starting with `/`
  // or starting with `//` is dropped.
  const rawNext = searchParams.next ?? '';
  const safeNext =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '';

  // Auto-detect: when only magic-link is configured (no password), drop the
  // password form entirely so the page doesn't look like it requires a
  // password no one has. When ONLY a password is configured, drop the
  // magic-link form. When BOTH are configured, show password first
  // (existing UX) and magic-link below the divider.
  const showPassword = passwordEnabled;
  const showMagic = magicEnabled;
  const showDivider = showPassword && showMagic;
  const showNothing = !showPassword && !showMagic;

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-md hero space-y-6 fade-up">
        <div className="flex items-center gap-3">
          <span className="relative w-10 h-10 rounded-xl bg-brand-gradient shadow-glow flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-white"
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
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI FinOps</h1>
            <p className="text-xs text-muted">Sign in to continue</p>
          </div>
        </div>

        {showPassword && (
          <LoginForm initialError={searchParams.error ?? null} next={safeNext} />
        )}

        {showDivider && (
          <div
            className="relative text-center text-[11px] uppercase tracking-wider text-muted font-semibold"
            aria-hidden
          >
            <span className="relative bg-bg px-3 z-10">or</span>
            <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
          </div>
        )}

        {showMagic && <MagicLinkForm />}

        {showNothing && (
          <div className="card card-pad text-sm text-muted leading-relaxed">
            Authentication is currently disabled — this dashboard is open to
            everyone. Set <code className="font-mono">FINOPS_DASHBOARD_PASSWORD</code>{' '}
            to enable the password gate, or{' '}
            <code className="font-mono">FINOPS_MAIL_FROM</code> (plus a mail
            transport) to enable magic-link sign-in.
          </div>
        )}

        <p className="text-xs text-muted text-center">
          {showPassword && !showMagic
            ? 'Single shared password. Sessions last 30 days.'
            : showMagic && !showPassword
              ? 'Magic-link sign-in. Sessions last 30 days.'
              : showDivider
                ? 'Either method works. Sessions last 30 days.'
                : null}
        </p>
      </div>
    </div>
  );
}
