'use client';

// Fallback when the root layout itself crashes (before Tailwind has a
// chance to load). MUST render its own <html>/<body>. Uses inline
// styles only — we cannot assume Tailwind utilities are available
// since the rendering pipeline that loads them may have failed.

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Critical: root layout failed:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#070810',
          color: '#f3f4f8',
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          fontFeatureSettings: "'cv11', 'ss01'",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
        }}
      >
        <main
          style={{
            maxWidth: '640px',
            width: '100%',
            background:
              'radial-gradient(circle at 0% 0%, rgba(139,92,246,0.15) 0px, transparent 40%), radial-gradient(circle at 100% 100%, rgba(34,211,238,0.10) 0px, transparent 40%), linear-gradient(180deg, #181a26 0%, #0f1018 100%)',
            border: '1px solid #363b50',
            borderRadius: '24px',
            padding: '40px',
            boxShadow:
              '0 2px 8px rgba(0, 0, 0, 0.4), 0 0 80px -20px rgba(139, 92, 246, 0.35)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '5px 10px',
              borderRadius: '999px',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              background: 'rgba(245, 158, 11, 0.1)',
              color: '#f59e0b',
              fontWeight: 500,
              marginBottom: '20px',
            }}
          >
            Critical error
          </div>
          <h1
            style={{
              fontSize: '40px',
              lineHeight: 1.1,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: 0,
              background:
                'linear-gradient(135deg, #a78bfa 0%, #67e8f9 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
            }}
          >
            Something broke.
          </h1>
          <p
            style={{
              fontSize: '15px',
              color: '#c9cbd6',
              lineHeight: 1.6,
              marginTop: '14px',
              marginBottom: 0,
            }}
          >
            AI FinOps hit an unrecoverable error while loading. This is rare
            and almost always a transient issue. Reload to try again — if it
            persists, get in touch with the team.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: '12px',
                color: '#7b829a',
                marginTop: '14px',
                marginBottom: 0,
              }}
            >
              Error ID:{' '}
              <code
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                  color: '#c9cbd6',
                }}
              >
                {error.digest}
              </code>
            </p>
          )}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '28px',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#fff',
                background:
                  'linear-gradient(135deg, #8b5cf6 0%, #22d3ee 100%)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'transform 0.15s ease',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#f3f4f8',
                background: '#181a26',
                border: '1px solid #262a3a',
                borderRadius: '12px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Reload home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
