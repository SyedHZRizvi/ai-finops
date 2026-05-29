import { headers } from 'next/headers';
import { buildOpenApiSpec } from '@/lib/openapi';
import { ApiExplorer } from '@/components/ApiExplorer';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AI FinOps — API Docs',
  description: 'Interactive OpenAPI explorer for the AI FinOps API',
};

// Server component. We build the spec inline (rather than fetch /api/openapi.json)
// so the page renders even when the openapi.json route hasn't been built/cached
// yet and we don't pay a network hop just to render the docs.
export default function ApiDocsPage() {
  const h = headers();
  const forwardedHost = h.get('x-forwarded-host');
  const forwardedProto = h.get('x-forwarded-proto');
  const host = forwardedHost ?? h.get('host') ?? 'localhost:3000';
  const proto = forwardedProto
    ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  const baseUrl = `${proto}://${host}`;
  const spec = buildOpenApiSpec(baseUrl);

  return (
    <div className="space-y-6">
      <header className="hero">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="chip chip-brand mb-3">For developers · OpenAPI 3.0</div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight gradient-text">
              Developer API Reference
            </h1>
            <p className="text-sm md:text-base text-inkDim mt-2 max-w-2xl leading-relaxed">
              {spec.info.description}
            </p>
            <div className="text-xs text-muted mt-3">
              Base URL: <code className="font-mono text-inkDim">{baseUrl}</code>
              <span className="mx-2 text-borderBright">·</span>
              Version: <code className="font-mono text-inkDim">{spec.info.version}</code>
            </div>
          </div>
        </div>
      </header>

      {/* Audience disclaimer. This page is integration documentation — request
          bodies, response codes, JSON schemas — only useful to engineers
          wiring applications into AI FinOps. Regular dashboard users should
          not see this content presented as "the program's main API page". */}
      <div className="card card-pad border-blue/30 bg-blue/5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue/15 border border-blue/30 flex items-center justify-center shrink-0 text-blue">
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M16 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">
            This page is for engineers integrating apps with AI FinOps
          </div>
          <div className="text-xs text-muted mt-1.5 leading-relaxed">
            Request bodies, response codes, and JSON schemas for the HTTP API.
            If you&apos;re using the AI FinOps dashboard to monitor or reduce
            your AI cost,{' '}
            <strong className="text-inkDim font-semibold">you don&apos;t need this page</strong>
            {' '}— head back to the{' '}
            <a href="/" className="underline hover:text-ink">
              Dashboard
            </a>
            ,{' '}
            <a href="/insights" className="underline hover:text-ink">
              Insights
            </a>
            , or{' '}
            <a href="/optimizer" className="underline hover:text-ink">
              Optimizer
            </a>
            . This reference exists so your developers can wire their
            applications to the AI FinOps ingest endpoint (
            <code className="font-mono text-inkDim">POST /api/log</code>) and
            read data programmatically.
          </div>
        </div>
      </div>

      <ApiExplorer spec={spec} />
    </div>
  );
}
