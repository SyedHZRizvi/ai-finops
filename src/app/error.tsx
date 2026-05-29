'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Root error boundary. Catches errors thrown anywhere inside the
// (default) route group. Must be a client component — `reset` is a
// function passed from the framework. Wrapped by the root layout, so
// the Nav stays visible above this content.

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console so the dev can grep it. In prod
    // the digest is the canonical identifier — `error.message` is
    // hidden by Next.js anyway when running production builds.
    // eslint-disable-next-line no-console
    console.error('Unhandled error in app route:', error);
  }, [error]);

  const showDetails = process.env.NODE_ENV !== 'production';

  return (
    <div className="space-y-6">
      <section className="hero">
        <div className="relative z-10 max-w-2xl">
          <div className="chip chip-warn mb-4">Error · Something went wrong</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text-warn">
            We hit a snag
          </h1>
          <p className="text-sm md:text-base text-inkDim mt-3 leading-relaxed">
            An unexpected error occurred while rendering this page. The team
            has been notified. You can try again — most transient failures
            (DB hiccups, rate limits, network blips) resolve on retry.
          </p>
          {error.digest && (
            <div className="text-xs text-muted mt-3">
              Error ID: <code className="font-mono text-inkDim">{error.digest}</code>
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={reset} className="btn-primary">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <polyline points="23 4 23 10 17 10" strokeLinecap="round" strokeLinejoin="round" />
                <path
                  d="M20.49 15a9 9 0 11-2.12-9.36L23 10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Try again
            </button>
            <Link href="/" className="btn">
              Back to dashboard
            </Link>
          </div>
        </div>
      </section>

      {showDetails && error.message && (
        <details className="card card-pad fade-up-delay-1">
          <summary className="cursor-pointer text-sm font-semibold text-inkDim hover:text-ink select-none">
            Error details (development only)
          </summary>
          <pre className="mt-4 text-xs text-muted overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        </details>
      )}
    </div>
  );
}
