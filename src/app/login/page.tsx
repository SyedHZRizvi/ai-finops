import type { Metadata } from 'next';
import { LoginForm } from '@/components/LoginForm';
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

export default function LoginPage({ searchParams }: LoginPageProps) {
  // When auth is fully disabled we still render a stub so the route doesn't
  // 404 if someone visits it manually. The middleware never redirects here
  // in that mode, so this is purely a courtesy.
  const enabled = isAuthEnabled();

  // Sanitize `next` to a relative path so we can't be turned into an open
  // redirect (`?next=https://evil.example`). Anything not starting with `/`
  // or starting with `//` is dropped.
  const rawNext = searchParams.next ?? '';
  const safeNext =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '';

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

        {enabled ? (
          <LoginForm initialError={searchParams.error ?? null} next={safeNext} />
        ) : (
          <div className="card card-pad text-sm text-muted leading-relaxed">
            Authentication is currently disabled — this dashboard is open to
            everyone. Set the <code className="font-mono">FINOPS_DASHBOARD_PASSWORD</code>{' '}
            environment variable to enable the gate.
          </div>
        )}

        <p className="text-xs text-muted text-center">
          Single shared password. Sessions last 30 days.
        </p>
      </div>
    </div>
  );
}
