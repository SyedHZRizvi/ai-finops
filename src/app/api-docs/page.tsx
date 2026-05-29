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
            <div className="chip chip-brand mb-3">API reference · OpenAPI 3.0</div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight gradient-text">
              AI FinOps API
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

      <ApiExplorer spec={spec} />
    </div>
  );
}
