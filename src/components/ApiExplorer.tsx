'use client';
//
// In-house OpenAPI explorer. Deliberately built from scratch (no
// swagger-ui-react) so the look matches the rest of the dashboard and
// nothing is shipped in the bundle that we don't need.
//
// Layout:
//   [search] ------------ [Download spec]
//   [sidebar of endpoints by tag] | [selected endpoint detail]
//                                 |   - params table
//                                 |   - request body schema
//                                 |   - responses with example JSON
//                                 |   - Try-it-out form

import { useMemo, useState, useCallback, useEffect } from 'react';
import type {
  OpenAPIDocument,
  OpenApiHttpMethod,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPathItem,
  OpenApiSchema,
} from '@/lib/openapi';

type SchemaOrRef = OpenApiSchema | { $ref: string };

interface FlatEndpoint {
  method: OpenApiHttpMethod;
  path: string;
  op: OpenApiOperation;
  tag: string;
}

const METHOD_ORDER: OpenApiHttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

// Color-code HTTP methods consistently across the explorer.
// GET=blue, POST=good (green), PUT=warn (amber), DELETE=bad (red)
const METHOD_CHIP: Record<OpenApiHttpMethod, string> = {
  get: 'chip-blue',
  post: 'chip-good',
  put: 'chip-warn',
  patch: 'chip-warn',
  delete: 'chip-bad',
};

const METHOD_TEXT: Record<OpenApiHttpMethod, string> = {
  get: 'text-blue',
  post: 'text-good',
  put: 'text-warn',
  patch: 'text-warn',
  delete: 'text-bad',
};

function isRef(s: SchemaOrRef | undefined): s is { $ref: string } {
  return !!s && typeof (s as { $ref?: string }).$ref === 'string';
}

// -- Schema resolution + example generation --------------------------------
//
// To render a response body example without depending on a JSON validator,
// we walk the schema and synthesize a sensible value for each property. This
// powers both the readable "response shape" preview and the default
// request-body payload in the try-it-out form.

function resolveRef(spec: OpenAPIDocument, ref: string): OpenApiSchema | undefined {
  // Refs in OpenAPI 3.0 look like "#/components/schemas/Foo".
  const m = ref.match(/^#\/components\/schemas\/(.+)$/);
  if (!m) return undefined;
  return spec.components.schemas[m[1]];
}

function exampleForSchema(
  schema: SchemaOrRef | undefined,
  spec: OpenAPIDocument,
  visited: Set<string> = new Set(),
): unknown {
  if (!schema) return null;
  if (isRef(schema)) {
    // Guard against infinite recursion on self-referential schemas.
    if (visited.has(schema.$ref)) return null;
    visited.add(schema.$ref);
    const resolved = resolveRef(spec, schema.$ref);
    return exampleForSchema(resolved, spec, visited);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  if (schema.oneOf && schema.oneOf.length > 0) {
    return exampleForSchema(schema.oneOf[0], spec, visited);
  }
  if (schema.anyOf && schema.anyOf.length > 0) {
    return exampleForSchema(schema.anyOf[0], spec, visited);
  }
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (t === 'string') {
    if (schema.format === 'date-time') return new Date().toISOString();
    if (schema.format === 'uri') return 'https://example.com';
    if (schema.default !== undefined) return schema.default;
    return 'string';
  }
  if (t === 'integer') return schema.default ?? 0;
  if (t === 'number') return schema.default ?? 0;
  if (t === 'boolean') return schema.default ?? false;
  if (t === 'null') return null;
  if (t === 'array') {
    return [exampleForSchema(schema.items, spec, visited)];
  }
  if (t === 'object' || schema.properties) {
    const out: Record<string, unknown> = {};
    if (schema.properties) {
      for (const [k, v] of Object.entries(schema.properties)) {
        out[k] = exampleForSchema(v, spec, visited);
      }
    }
    return out;
  }
  return null;
}

function jsonExample(schema: SchemaOrRef | undefined, spec: OpenAPIDocument): string {
  if (!schema) return '{}';
  try {
    const ex = exampleForSchema(schema, spec);
    return JSON.stringify(ex, null, 2);
  } catch {
    return '{}';
  }
}

// Render a one-line type label like "array<PromptLog>" or "string (date-time)".
function typeLabel(schema: SchemaOrRef | undefined, spec: OpenAPIDocument): string {
  if (!schema) return '—';
  if (isRef(schema)) {
    const name = schema.$ref.replace(/^#\/components\/schemas\//, '');
    return name;
  }
  const t = Array.isArray(schema.type) ? schema.type.join('|') : schema.type ?? 'object';
  if (t === 'array') {
    return `array<${typeLabel(schema.items, spec)}>`;
  }
  if (schema.enum) {
    return `enum(${schema.enum.map((v) => JSON.stringify(v)).join(' | ')})`;
  }
  if (schema.format) return `${t} (${schema.format})`;
  return t;
}

// -- Top-level component ---------------------------------------------------

interface ApiExplorerProps {
  spec: OpenAPIDocument;
}

export function ApiExplorer({ spec }: ApiExplorerProps) {
  const endpoints = useMemo<FlatEndpoint[]>(() => {
    const list: FlatEndpoint[] = [];
    for (const [path, item] of Object.entries(spec.paths)) {
      const pi = item as OpenApiPathItem;
      for (const method of METHOD_ORDER) {
        const op = pi[method];
        if (!op) continue;
        // Per-route tag is required so the sidebar can group consistently.
        const tag = op.tags[0] ?? 'Other';
        list.push({ method, path, op, tag });
      }
    }
    return list;
  }, [spec]);

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(() =>
    endpoints[0] ? endpoints[0].op.operationId : '',
  );

  // Allow URL deep-links like #operationId to jump straight to an endpoint.
  // We don't update the hash on every click (which can break browser back).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = window.location.hash.replace(/^#/, '');
    if (h && endpoints.some((e) => e.op.operationId === h)) {
      setSelectedId(h);
    }
  }, [endpoints]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return endpoints;
    return endpoints.filter((e) =>
      e.path.toLowerCase().includes(q)
      || e.method.toLowerCase().includes(q)
      || e.op.summary.toLowerCase().includes(q)
      || e.tag.toLowerCase().includes(q)
      || e.op.operationId.toLowerCase().includes(q),
    );
  }, [endpoints, query]);

  // Group by tag — preserve the order in spec.tags, then any unknown tag last.
  const grouped = useMemo(() => {
    const order = new Map<string, number>();
    spec.tags.forEach((t, i) => order.set(t.name, i));
    const groups = new Map<string, FlatEndpoint[]>();
    for (const e of filtered) {
      const arr = groups.get(e.tag) ?? [];
      arr.push(e);
      groups.set(e.tag, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const ai = order.get(a) ?? 999;
      const bi = order.get(b) ?? 999;
      return ai - bi;
    });
  }, [filtered, spec.tags]);

  const selected = useMemo(
    () => endpoints.find((e) => e.op.operationId === selectedId) ?? endpoints[0],
    [endpoints, selectedId],
  );

  const downloadHref = '/api/openapi.json';

  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    if (typeof window !== 'undefined') {
      // Update hash without triggering a scroll jump.
      history.replaceState(null, '', `#${id}`);
    }
  }, []);

  return (
    <div className="space-y-5">
      <div className="card card-pad flex flex-col md:flex-row md:items-center gap-3 fade-up">
        <div className="flex-1">
          <input
            type="text"
            className="input"
            placeholder="Search endpoints (e.g. prompts, stats, GET)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search endpoints"
          />
        </div>
        <a
          href={downloadHref}
          download="ai-finops-openapi.json"
          className="btn-primary whitespace-nowrap"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download OpenAPI spec
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-5">
        {/* Sidebar */}
        <aside className="card fade-up-delay-1 max-h-[80vh] overflow-y-auto">
          {grouped.length === 0 && (
            <div className="p-6 text-sm text-muted">No endpoints match.</div>
          )}
          {grouped.map(([tag, items]) => (
            <div key={tag} className="py-2">
              <div className="px-4 pt-3 pb-1 label">{tag}</div>
              <ul>
                {items.map((e) => {
                  const isActive = selected?.op.operationId === e.op.operationId;
                  return (
                    <li key={e.op.operationId}>
                      <button
                        type="button"
                        onClick={() => onSelect(e.op.operationId)}
                        className={`w-full text-left px-4 py-2 flex items-start gap-2 transition-colors duration-100 ${
                          isActive
                            ? 'bg-brand/10 border-l-2 border-brand'
                            : 'border-l-2 border-transparent hover:bg-panel2'
                        }`}
                      >
                        <span
                          className={`chip uppercase ${METHOD_CHIP[e.method]} shrink-0 mt-0.5`}
                          aria-label={e.method.toUpperCase()}
                        >
                          {e.method}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-mono text-xs text-inkDim truncate">
                            {e.path}
                          </span>
                          <span className="block text-[11px] text-muted truncate">
                            {e.op.summary}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        {/* Detail pane */}
        <section className="min-w-0">
          {selected ? (
            <EndpointDetail key={selected.op.operationId} endpoint={selected} spec={spec} />
          ) : (
            <div className="card card-pad text-muted">Select an endpoint to view details.</div>
          )}
        </section>
      </div>
    </div>
  );
}

// -- Endpoint detail -------------------------------------------------------

interface EndpointDetailProps {
  endpoint: FlatEndpoint;
  spec: OpenAPIDocument;
}

function EndpointDetail({ endpoint, spec }: EndpointDetailProps) {
  const { method, path, op } = endpoint;
  const [tryOpen, setTryOpen] = useState(false);

  const requestSchema = useMemo<SchemaOrRef | undefined>(() => {
    const json = op.requestBody?.content?.['application/json'];
    return json?.schema;
  }, [op]);

  const requestExample = useMemo(() => {
    const json = op.requestBody?.content?.['application/json'];
    if (json?.example !== undefined) return json.example;
    return exampleForSchema(requestSchema, spec);
  }, [op, requestSchema, spec]);

  const responseEntries = useMemo(
    () =>
      Object.entries(op.responses).sort(([a], [b]) => {
        const ai = parseInt(a, 10) || 999;
        const bi = parseInt(b, 10) || 999;
        return ai - bi;
      }),
    [op.responses],
  );

  return (
    <div className="card fade-up-delay-1 overflow-hidden">
      <header className="px-6 py-5 border-b border-border flex flex-wrap items-center gap-3">
        <span className={`chip uppercase ${METHOD_CHIP[method]} text-sm`}>{method}</span>
        <code className="font-mono text-sm text-inkDim break-all">{path}</code>
        <span className="ml-auto text-xs text-muted">
          <code className="font-mono">{op.operationId}</code>
        </span>
      </header>

      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">{op.summary}</h2>
          {op.description && (
            <p className="text-sm text-inkDim leading-relaxed">{op.description}</p>
          )}
          {op.security && op.security.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <span className="chip chip-warn">
                <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                Bearer auth (if configured)
              </span>
            </div>
          )}
        </div>

        {/* Parameters table */}
        {op.parameters && op.parameters.length > 0 && (
          <section>
            <div className="label mb-2">Parameters</div>
            <div className="card overflow-hidden">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>In</th>
                    <th>Type</th>
                    <th>Required</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {op.parameters.map((p) => (
                    <tr key={`${p.in}-${p.name}`}>
                      <td className="font-mono text-xs">{p.name}</td>
                      <td className="text-xs text-muted">{p.in}</td>
                      <td className="font-mono text-xs">{typeLabel(p.schema, spec)}</td>
                      <td className="text-xs">
                        {p.required ? (
                          <span className="chip chip-warn">required</span>
                        ) : (
                          <span className="text-muted text-xs">optional</span>
                        )}
                      </td>
                      <td className="text-xs text-inkDim">{p.description ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Request body */}
        {requestSchema && (
          <section>
            <div className="label mb-2">Request body</div>
            <div className="text-xs text-muted mb-2">
              Content-Type: <code className="font-mono text-inkDim">application/json</code>
              {' · '}Schema: <code className="font-mono text-inkDim">{typeLabel(requestSchema, spec)}</code>
            </div>
            <CodeBlock>{JSON.stringify(requestExample, null, 2)}</CodeBlock>
          </section>
        )}

        {/* Responses */}
        <section>
          <div className="label mb-2">Responses</div>
          <div className="space-y-3">
            {responseEntries.map(([status, resp]) => {
              const json = resp.content?.['application/json'];
              const csv = resp.content?.['text/csv'];
              const exampleSchema = json?.schema;
              const exampleText = exampleSchema
                ? jsonExample(exampleSchema, spec)
                : csv
                  ? '(streamed CSV file)'
                  : '(no body)';
              return (
                <div key={status} className="border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-panel2/50 flex items-center gap-3">
                    <span className={`chip ${statusChip(status)}`}>{status}</span>
                    <span className="text-sm text-inkDim">{resp.description}</span>
                    {exampleSchema && (
                      <span className="ml-auto text-xs text-muted font-mono">
                        {typeLabel(exampleSchema, spec)}
                      </span>
                    )}
                  </div>
                  {(json || csv) && (
                    <CodeBlock>{exampleText}</CodeBlock>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Try it out */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="label">Try it out</div>
            <button
              type="button"
              className="btn"
              onClick={() => setTryOpen((v) => !v)}
              aria-expanded={tryOpen}
            >
              {tryOpen ? 'Hide' : 'Try it out'}
            </button>
          </div>
          {tryOpen && (
            <TryItOut
              method={method}
              path={path}
              parameters={op.parameters ?? []}
              requestBody={requestExample}
              hasBody={!!requestSchema}
              requiresAuth={Array.isArray(op.security) && op.security.length > 0}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function statusChip(status: string): string {
  if (status.startsWith('2')) return 'chip-good';
  if (status.startsWith('3')) return 'chip-blue';
  if (status.startsWith('4')) return 'chip-warn';
  if (status.startsWith('5')) return 'chip-bad';
  return '';
}

// -- Try-it-out form -------------------------------------------------------

interface TryItOutProps {
  method: OpenApiHttpMethod;
  path: string;
  parameters: OpenApiParameter[];
  requestBody: unknown;
  hasBody: boolean;
  requiresAuth: boolean;
}

interface TryResult {
  status: number;
  durationMs: number;
  contentType: string;
  body: string;
}

function TryItOut({ method, path, parameters, requestBody, hasBody, requiresAuth }: TryItOutProps) {
  // Separate query, path, and header params — they're filled differently in
  // the constructed request.
  const pathParams = parameters.filter((p) => p.in === 'path');
  const queryParams = parameters.filter((p) => p.in === 'query');
  const headerParams = parameters.filter((p) => p.in === 'header');

  const [pathValues, setPathValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of pathParams) init[p.name] = '';
    return init;
  });
  const [queryValues, setQueryValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of queryParams) init[p.name] = '';
    return init;
  });
  const [headerValues, setHeaderValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of headerParams) init[p.name] = '';
    return init;
  });
  const [token, setToken] = useState('');
  const [bodyText, setBodyText] = useState(() =>
    hasBody ? JSON.stringify(requestBody ?? {}, null, 2) : '',
  );

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function buildUrl(): string {
    let p = path;
    // Substitute :path / {path} segments with provided values.
    for (const param of pathParams) {
      const v = encodeURIComponent(pathValues[param.name] ?? '');
      p = p.replace(`{${param.name}}`, v);
    }
    const qs = new URLSearchParams();
    for (const param of queryParams) {
      const v = queryValues[param.name];
      if (v && v.length > 0) qs.set(param.name, v);
    }
    const suffix = qs.toString();
    return suffix ? `${p}?${suffix}` : p;
  }

  async function onRun(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setRunning(true);
    const url = buildUrl();
    const headers: Record<string, string> = {};
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (token.trim()) headers['Authorization'] = `Bearer ${token.trim()}`;
    for (const p of headerParams) {
      const v = headerValues[p.name];
      if (v && v.length > 0) headers[p.name] = v;
    }

    const init: RequestInit = {
      method: method.toUpperCase(),
      headers,
    };
    if (hasBody && bodyText.trim().length > 0) {
      // Validate JSON client-side so we give a useful error rather than
      // letting the server reject it.
      try {
        JSON.parse(bodyText);
      } catch (err) {
        setError(`Request body is not valid JSON: ${err instanceof Error ? err.message : 'parse error'}`);
        setRunning(false);
        return;
      }
      init.body = bodyText;
    }

    const t0 = performance.now();
    try {
      const res = await fetch(url, init);
      const ct = res.headers.get('content-type') ?? '';
      let body: string;
      if (ct.includes('application/json')) {
        try {
          const j = await res.json();
          body = JSON.stringify(j, null, 2);
        } catch {
          body = await res.text();
        }
      } else {
        const txt = await res.text();
        // Truncate very large non-JSON bodies (e.g. big CSV exports) so the
        // explorer stays usable.
        body = txt.length > 50_000 ? `${txt.slice(0, 50_000)}\n...(truncated, ${txt.length} bytes)` : txt;
      }
      setResult({
        status: res.status,
        durationMs: Math.round(performance.now() - t0),
        contentType: ct,
        body,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <form onSubmit={onRun} className="space-y-4 border border-border rounded-xl p-4 bg-panel2/30">
      <div className="text-xs text-muted">
        Request:{' '}
        <span className={`font-mono ${METHOD_TEXT[method]} font-semibold uppercase`}>{method}</span>{' '}
        <code className="font-mono text-inkDim">{buildUrl()}</code>
      </div>

      {pathParams.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pathParams.map((p) => (
            <div key={p.name}>
              <label className="label block mb-1">
                {p.name}{p.required && <span className="text-bad ml-0.5">*</span>}
                <span className="ml-1 text-muted normal-case">(path)</span>
              </label>
              <input
                className="input"
                value={pathValues[p.name] ?? ''}
                onChange={(e) =>
                  setPathValues((s) => ({ ...s, [p.name]: e.target.value }))
                }
                placeholder={p.description ?? ''}
              />
            </div>
          ))}
        </div>
      )}

      {queryParams.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {queryParams.map((p) => (
            <div key={p.name}>
              <label className="label block mb-1">
                {p.name}{p.required && <span className="text-bad ml-0.5">*</span>}
                <span className="ml-1 text-muted normal-case">(query)</span>
              </label>
              <input
                className="input"
                value={queryValues[p.name] ?? ''}
                onChange={(e) =>
                  setQueryValues((s) => ({ ...s, [p.name]: e.target.value }))
                }
                placeholder={p.example !== undefined ? String(p.example) : (p.description ?? '')}
              />
            </div>
          ))}
        </div>
      )}

      {headerParams.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {headerParams.map((p) => (
            <div key={p.name}>
              <label className="label block mb-1">
                {p.name}{p.required && <span className="text-bad ml-0.5">*</span>}
                <span className="ml-1 text-muted normal-case">(header)</span>
              </label>
              <input
                className="input"
                value={headerValues[p.name] ?? ''}
                onChange={(e) =>
                  setHeaderValues((s) => ({ ...s, [p.name]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      )}

      {requiresAuth && (
        <div>
          <label className="label block mb-1">Bearer token (optional)</label>
          <input
            className="input font-mono"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="FINOPS_INGEST_TOKEN value (only needed if configured)"
          />
        </div>
      )}

      {hasBody && (
        <div>
          <label className="label block mb-1">Request body (JSON)</label>
          <textarea
            className="input font-mono text-xs leading-relaxed"
            rows={Math.min(20, Math.max(6, bodyText.split('\n').length))}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={running}>
          {running ? 'Sending...' : 'Execute'}
        </button>
        {result && (
          <span className="text-xs text-muted tabular-nums">
            {result.status} · {result.durationMs}ms · {result.contentType || 'no content-type'}
          </span>
        )}
      </div>

      {error && (
        <div className="text-sm text-bad border border-bad/40 bg-bad/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {result && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`chip ${statusChip(String(result.status))}`}>{result.status}</span>
            <span className="text-xs text-muted">Response</span>
          </div>
          <CodeBlock>{result.body}</CodeBlock>
        </div>
      )}
    </form>
  );
}

// -- Code block ------------------------------------------------------------

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-panel2 border border-border rounded-xl px-4 py-3 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words text-inkDim max-h-[420px] overflow-y-auto">
      {children}
    </pre>
  );
}
