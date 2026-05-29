'use client';
import { useState, useEffect } from 'react';
import type { ModelPricing, OptimizationResult, OptimizationSuggestion } from '@/lib/types';
import { CATEGORY_CHIP, COMPLEXITY_CHIP } from './PromptTable';

const SAMPLE_PROMPT = `I want you to act as a senior software engineer. Please please please write a Python function that takes a list of integers and returns the sum. Make sure it handles edge cases. Also could you also add type hints? And can you also include a docstring? Also tell me what the time complexity is.`;

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

// ============================================================================
// LLM rewrite types — mirror what /api/optimize/llm POST returns. Kept inline
// (rather than imported from the lib) to keep the client bundle free of any
// server-only imports.
// ============================================================================
type LlmRewriteProvider = 'anthropic' | 'openai';

interface LlmRewriteSuccess {
  ok: true;
  provider: LlmRewriteProvider;
  model: string;
  rewrittenPrompt: string;
  rationale: string;
  latencyMs: number;
}
interface LlmRewriteFailure {
  ok: false;
  reason: 'no-credentials' | 'encryption-key-missing' | 'network' | 'http' | 'malformed' | 'empty';
  message: string;
}
type LlmRewriteResult = LlmRewriteSuccess | LlmRewriteFailure;

export function OptimizerForm() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<ModelPricing[]>([]);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // LLM rewrite — opt-in, available only when a Credential is connected.
  // We probe availability on mount (one GET), and only render the toggle +
  // results when at least one provider is reachable. The toggle defaults to
  // OFF so the heuristic UX stays the same for users who never look at it.
  const [llmAvailable, setLlmAvailable] = useState<{
    available: boolean;
    providers: LlmRewriteProvider[];
  }>({ available: false, providers: [] });
  const [useLlm, setUseLlm] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmResult, setLlmResult] = useState<LlmRewriteResult | null>(null);
  const [llmCopied, setLlmCopied] = useState(false);

  useEffect(() => {
    fetch('/api/pricing', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((json: { items?: ModelPricing[] }) => {
        const rows = Array.isArray(json.items) ? json.items : [];
        setModels(rows);
        if (rows[0]) setModel(rows[0].model);
      })
      .catch(() => {});

    // Probe LLM rewrite availability. Failures degrade silently — the
    // toggle just stays hidden if the probe doesn't return successfully.
    fetch('/api/optimize/llm', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { available: false, providers: [] }))
      .then((json: { available?: boolean; providers?: LlmRewriteProvider[] }) => {
        setLlmAvailable({
          available: Boolean(json.available),
          providers: Array.isArray(json.providers) ? json.providers : [],
        });
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setLlmResult(null);

    // Run the heuristic optimizer + (if requested) the LLM rewrite in
    // parallel. The LLM call is slower so we don't want to gate the
    // heuristic result on it. If LLM fails, we still show the heuristic.
    const heuristicPromise: Promise<OptimizationResult> = fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: model || undefined }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`Optimize failed (${res.status})`);
      return (await res.json()) as OptimizationResult;
    });

    const llmPromise: Promise<LlmRewriteResult | null> =
      useLlm && llmAvailable.available
        ? (() => {
            setLlmLoading(true);
            return fetch('/api/optimize/llm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt }),
            })
              .then((r) => r.json() as Promise<LlmRewriteResult>)
              .catch((err: unknown) => ({
                ok: false,
                reason: 'network',
                message: err instanceof Error ? err.message : 'request failed',
              } as LlmRewriteFailure))
              .finally(() => setLlmLoading(false));
          })()
        : Promise.resolve(null);

    try {
      const [heuristic, llm] = await Promise.all([heuristicPromise, llmPromise]);
      setResult(heuristic);
      if (llm) setLlmResult(llm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  function loadSample() {
    setPrompt(SAMPLE_PROMPT);
    setResult(null);
    setLlmResult(null);
    setError(null);
  }

  async function copyOptimized() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.optimizedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function copyLlmRewrite() {
    if (!llmResult || !llmResult.ok) return;
    try {
      await navigator.clipboard.writeText(llmResult.rewrittenPrompt);
      setLlmCopied(true);
      setTimeout(() => setLlmCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  // The heuristic optimizer was a no-op when these conditions hold. We
  // surface a clear message in that case instead of pretending we
  // rewrote anything.
  const heuristicMadeNoChanges =
    result !== null && result.savedTokens === 0 && result.suggestions.length === 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <form onSubmit={submit} className="card card-pad space-y-4 fade-up">
        <div>
          <label className="label block mb-2">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Paste a prompt to analyze and optimize..."
            className="input min-h-[280px] font-mono text-xs leading-relaxed"
          />
          <div className="text-xs text-muted mt-2 tabular-nums">
            {prompt.length} chars · ~{formatNum(Math.ceil(prompt.length / 4))} tokens
          </div>
        </div>

        <div>
          <label className="label block mb-2">Model</label>
          <select
            className="input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {models.length === 0 && <option value="">Default</option>}
            {models.map((m) => (
              <option key={m.model} value={m.model}>
                {m.model}
                {m.provider ? ` (${m.provider})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* LLM rewrite opt-in. Only renders when a Credential is connected.
            When no creds exist we don't even hint at the option here — there's
            a hint on the "no changes" result card instead, which is the
            moment the user actually cares. */}
        {llmAvailable.available && (
          <label className="flex items-start gap-3 p-3 rounded-xl border border-brand/30 bg-brand/5 cursor-pointer hover:bg-brand/10 transition-colors">
            <input
              type="checkbox"
              checked={useLlm}
              onChange={(e) => setUseLlm(e.target.checked)}
              className="mt-0.5 accent-brand"
            />
            <span className="min-w-0">
              <span className="text-sm font-semibold text-brandLight">
                Also use AI to rewrite this prompt
              </span>
              <span className="block text-xs text-muted mt-0.5 leading-relaxed">
                Calls{' '}
                {llmAvailable.providers.includes('anthropic')
                  ? 'Claude Haiku'
                  : 'GPT-4o-mini'}{' '}
                with your connected credential to restructure for clarity &amp; brevity.
                Adds ~1-3 seconds.
              </span>
            </span>
          </label>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Analyze & Optimize'}
          </button>
          <button type="button" onClick={loadSample} className="btn">
            Try sample
          </button>
          {prompt && (
            <button
              type="button"
              onClick={() => {
                setPrompt('');
                setResult(null);
                setLlmResult(null);
              }}
              className="btn"
            >
              Clear
            </button>
          )}
        </div>

        {error && <div className="text-xs text-bad">Error: {error}</div>}
      </form>

      <div className="space-y-4">
        {!result && !loading && (
          <div className="card card-pad fade-up-delay-1">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 flex items-center justify-center shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5 text-brandLight"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="3" />
                  <path
                    d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                  />
                </svg>
              </div>
              <div>
                <div className="label">Results</div>
                <div className="text-sm text-inkDim mt-1">
                  Paste a prompt on the left and click Analyze.
                </div>
              </div>
            </div>
            <div className="text-xs font-semibold text-inkDim mb-2">You will see:</div>
            <ul className="text-xs text-muted space-y-2">
              {[
                'Token count before and after optimization',
                'Estimated cost savings per call',
                'Category and complexity classification',
                'Specific suggestions with confidence scores',
                'An optimized prompt ready to copy',
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-brandLight mt-0.5" aria-hidden>→</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <button onClick={loadSample} className="btn mt-4">
              Try a sample prompt <span aria-hidden>→</span>
            </button>
          </div>
        )}

        {loading && (
          <div className="card card-pad text-sm text-muted flex items-center gap-2 fade-up-delay-1">
            <span className="inline-block w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            Analyzing prompt...
          </div>
        )}

        {result && (
          <>
            {/* Headline card. Two flavours: a "saved N tokens" win card when
                the heuristic actually shrunk the prompt, OR a clear "no
                verbose patterns detected" card when it didn't. The previous
                version showed "Optimized −0.0%" in the no-change case, which
                wasn't honest. */}
            {result.savedTokens > 0 ? (
              <div className="card card-pad relative overflow-hidden fade-up">
                <div
                  className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20 blur-3xl pointer-events-none"
                  style={{ background: 'radial-gradient(circle, #22c55e 0%, transparent 70%)' }}
                  aria-hidden
                />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="chip chip-good">
                      <span className="w-1.5 h-1.5 rounded-full bg-good pulse-glow" />
                      Optimized
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-2xl font-bold tabular-nums">
                      {formatNum(result.originalTokens)}
                    </span>
                    <span className="text-muted" aria-hidden>
                      →
                    </span>
                    <span className="text-3xl font-bold tabular-nums gradient-text-good">
                      {formatNum(result.optimizedTokens)}
                    </span>
                    <span className="chip chip-good tabular-nums">
                      −{result.savedPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-sm text-inkDim mt-2 tabular-nums">
                    Saves {formatNum(result.savedTokens)} tokens ·{' '}
                    <span className="text-good font-semibold">
                      −{formatUSD(result.estimatedCostSavings)} / call
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card card-pad relative overflow-hidden fade-up">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue/15 border border-blue/30 flex items-center justify-center shrink-0 text-blue">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" strokeLinecap="round" />
                      <line x1="12" y1="8" x2="12.01" y2="8" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink">
                      {heuristicMadeNoChanges
                        ? 'No verbose patterns detected'
                        : 'Suggestions available — no automatic rewrite'}
                    </div>
                    <div className="text-sm text-muted mt-1.5 leading-relaxed">
                      {heuristicMadeNoChanges ? (
                        <>
                          The deterministic optimizer looks for ~30 specific verbose
                          phrasings (e.g. <span className="font-mono">&quot;in order to&quot;</span>,
                          <span className="font-mono">&quot;basically&quot;</span>, polite preambles).
                          None of them match this prompt — so we&apos;d only rewrite by
                          changing meaning, which we won&apos;t do automatically.
                        </>
                      ) : (
                        <>
                          The advisory suggestions below need a judgement call — they aren&apos;t
                          safe to apply automatically. Review and apply manually.
                        </>
                      )}
                    </div>
                    {/* When LLM rewriting is configured but the user didn't tick the
                        toggle, point them at it here — this is the moment they actually
                        want it. When it's not configured, suggest adding credentials. */}
                    {!useLlm && (
                      <div className="text-xs text-inkDim mt-3 p-2.5 rounded-lg bg-panel2 border border-border leading-relaxed">
                        {llmAvailable.available ? (
                          <>
                            <span className="font-semibold text-brandLight">Tip:</span>{' '}
                            tick &quot;Also use AI to rewrite this prompt&quot; on the left and
                            re-analyze to get a structural rewrite from{' '}
                            {llmAvailable.providers.includes('anthropic')
                              ? 'Claude'
                              : 'GPT'}.
                          </>
                        ) : (
                          <>
                            <span className="font-semibold text-brandLight">Tip:</span>{' '}
                            connect an Anthropic or OpenAI credential on{' '}
                            <a href="/import" className="underline hover:text-ink">
                              /import
                            </a>{' '}
                            to unlock AI-powered prompt rewriting (clearer structure,
                            real restructuring, not just regex compression).
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="card card-pad fade-up-delay-1">
              <div className="label mb-3">Analysis</div>
              <div className="flex flex-wrap gap-2">
                <span className={`chip capitalize ${CATEGORY_CHIP[result.analysis.category]}`}>
                  {result.analysis.category}
                </span>
                <span className={`chip capitalize ${COMPLEXITY_CHIP[result.analysis.complexity]}`}>
                  {result.analysis.complexity}
                </span>
                <span className="chip tabular-nums">
                  score {result.analysis.complexityScore.toFixed(0)}
                </span>
                <span className="chip tabular-nums">
                  est. {formatNum(result.analysis.estimatedOutputTokens)} output
                </span>
              </div>
              {result.analysis.dimensions.length > 0 && (
                <div className="mt-4">
                  <div className="label mb-2">Dimensions</div>
                  <div className="flex flex-wrap gap-2">
                    {result.analysis.dimensions.map((d, i) => (
                      <span key={i} className="chip">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {result.suggestions.length > 0 && (
              <div className="space-y-3 fade-up-delay-2">
                <div className="label">Suggestions ({result.suggestions.length})</div>
                {result.suggestions.map((s, i) => (
                  <SuggestionCard key={i} s={s} />
                ))}
              </div>
            )}

            {/* Only show the "Optimized prompt" card when the heuristic
                actually changed the prompt. When it didn't, this card was
                literally a verbatim copy of the input — surfacing it as
                "Optimized prompt" was misleading. */}
            {result.savedTokens > 0 && (
              <div className="card card-pad fade-up-delay-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="label">Optimized prompt</div>
                  <button onClick={copyOptimized} className="btn text-xs">
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-panel2 border border-border rounded-xl p-4 max-h-80 overflow-auto">
                  {result.optimizedPrompt}
                </pre>
              </div>
            )}

            {/* LLM rewrite — three states (loading / success / failure).
                Rendered after the heuristic suggestions so the user sees the
                deterministic result first, then the optional AI rewrite. */}
            {llmLoading && (
              <div className="card card-pad text-sm text-muted flex items-center gap-2 fade-up-delay-3">
                <span className="inline-block w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                Asking{' '}
                {llmAvailable.providers.includes('anthropic') ? 'Claude' : 'GPT'} to
                rewrite the prompt...
              </div>
            )}
            {llmResult && llmResult.ok && (
              <div className="card card-pad fade-up-delay-3 relative overflow-hidden">
                <div
                  className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-15 blur-3xl pointer-events-none"
                  style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
                  aria-hidden
                />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="chip chip-brand">
                        AI-rewritten by{' '}
                        {llmResult.provider === 'anthropic' ? 'Claude' : 'GPT'}
                      </span>
                      <span className="text-xs text-muted font-mono">
                        {llmResult.model}
                      </span>
                    </div>
                    <button onClick={copyLlmRewrite} className="btn text-xs">
                      {llmCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {llmResult.rationale && (
                    <div className="text-xs text-inkDim mb-3 leading-relaxed p-2.5 bg-panel2 rounded-lg border border-border">
                      <span className="font-semibold text-brandLight">What changed:</span>{' '}
                      {llmResult.rationale}
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-panel2 border border-border rounded-xl p-4 max-h-80 overflow-auto">
                    {llmResult.rewrittenPrompt}
                  </pre>
                  <div className="text-[10px] text-muted mt-2 tabular-nums">
                    Generated in {llmResult.latencyMs} ms
                  </div>
                </div>
              </div>
            )}
            {llmResult && !llmResult.ok && (
              <div className="card card-pad fade-up-delay-3 border-warn/30 bg-warn/5">
                <div className="text-sm font-semibold text-warn">
                  AI rewrite unavailable
                </div>
                <div className="text-xs text-muted mt-1.5 leading-relaxed">
                  {llmResult.message}
                </div>
                {llmResult.reason === 'no-credentials' && (
                  <a href="/import" className="btn text-xs mt-3 inline-flex">
                    Connect a provider →
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SuggestionCard({ s }: { s: OptimizationSuggestion }) {
  const confPct = Math.round(s.confidence * 100);
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{s.title}</div>
          <div className="text-xs text-muted mt-1 leading-relaxed">{s.description}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-good tabular-nums font-semibold">
            −{formatNum(s.estimatedTokenSavings)} tok
          </div>
          <div className="text-xs text-good tabular-nums">
            −{formatUSD(s.estimatedCostSavings)}
          </div>
        </div>
      </div>

      {(s.before || s.after) && (
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs font-mono">
          {s.before && (
            <div>
              <div className="label mb-1.5">Before</div>
              <pre className="whitespace-pre-wrap break-words bg-bad/5 border border-bad/30 rounded-lg p-2.5 max-h-40 overflow-auto">
                {s.before}
              </pre>
            </div>
          )}
          {s.after && (
            <div>
              <div className="label mb-1.5">After</div>
              <pre className="whitespace-pre-wrap break-words bg-good/5 border border-good/30 rounded-lg p-2.5 max-h-40 overflow-auto">
                {s.after}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted mb-1.5">
          <span>Confidence</span>
          <span className="tabular-nums font-semibold text-inkDim">{confPct}%</span>
        </div>
        <div className="w-full h-1.5 bg-panel2 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-gradient"
            style={{ width: `${confPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
