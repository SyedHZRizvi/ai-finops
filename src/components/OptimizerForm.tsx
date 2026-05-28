'use client';
import { useState, useEffect } from 'react';
import type { ModelPricing, OptimizationResult, OptimizationSuggestion } from '@/lib/types';

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

export function OptimizerForm() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<ModelPricing[]>([]);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/pricing', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((json: { items?: ModelPricing[] }) => {
        const rows = Array.isArray(json.items) ? json.items : [];
        setModels(rows);
        if (rows[0]) setModel(rows[0].model);
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: model || undefined }),
      });
      if (!res.ok) throw new Error(`Optimize failed (${res.status})`);
      const data = (await res.json()) as OptimizationResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  function loadSample() {
    setPrompt(SAMPLE_PROMPT);
    setResult(null);
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <form onSubmit={submit} className="card card-pad space-y-3">
        <div>
          <label className="label block mb-1">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Paste a prompt to analyze and optimize..."
            className="input min-h-[280px] font-mono text-xs leading-relaxed"
          />
          <div className="text-xs text-muted mt-1 tabular-nums">
            {prompt.length} chars · ~{formatNum(Math.ceil(prompt.length / 4))} tokens
          </div>
        </div>

        <div>
          <label className="label block mb-1">Model</label>
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

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="btn btn-primary disabled:opacity-50"
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
          <div className="card card-pad">
            <div className="label">Results</div>
            <div className="text-sm text-muted mt-2">
              Paste a prompt on the left and click Analyze. You will see:
            </div>
            <ul className="text-xs text-muted mt-3 space-y-1.5 list-disc list-inside">
              <li>Token count before and after optimization</li>
              <li>Estimated cost savings per call</li>
              <li>Category and complexity classification</li>
              <li>Specific suggestions with confidence scores</li>
              <li>An optimized prompt ready to copy</li>
            </ul>
            <button onClick={loadSample} className="btn mt-4">
              Try a sample prompt <span aria-hidden>→</span>
            </button>
          </div>
        )}

        {loading && (
          <div className="card card-pad text-sm text-muted">Analyzing prompt...</div>
        )}

        {result && (
          <>
            <div className="card card-pad border-good/40 bg-good/5">
              <div className="label text-good/90">Optimized</div>
              <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                <span className="text-2xl font-semibold tabular-nums">
                  {formatNum(result.originalTokens)}
                </span>
                <span className="text-muted" aria-hidden>
                  →
                </span>
                <span className="text-2xl font-semibold tabular-nums text-good">
                  {formatNum(result.optimizedTokens)}
                </span>
                <span className="chip border-good/40 text-good tabular-nums">
                  −{result.savedPercent.toFixed(1)}%
                </span>
              </div>
              <div className="text-xs text-muted mt-1 tabular-nums">
                Saves {formatNum(result.savedTokens)} tokens ·{' '}
                <span className="text-good">−{formatUSD(result.estimatedCostSavings)} / call</span>
              </div>
            </div>

            <div className="card card-pad">
              <div className="label mb-2">Analysis</div>
              <div className="flex flex-wrap gap-2">
                <span className="chip capitalize">{result.analysis.category}</span>
                <span className="chip capitalize">{result.analysis.complexity}</span>
                <span className="chip tabular-nums">
                  score {result.analysis.complexityScore.toFixed(0)}
                </span>
                <span className="chip tabular-nums">
                  est. {formatNum(result.analysis.estimatedOutputTokens)} output
                </span>
              </div>
              {result.analysis.dimensions.length > 0 && (
                <div className="mt-3">
                  <div className="label mb-1">Dimensions</div>
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
              <div className="space-y-2">
                <div className="label">Suggestions ({result.suggestions.length})</div>
                {result.suggestions.map((s, i) => (
                  <SuggestionCard key={i} s={s} />
                ))}
              </div>
            )}

            <div className="card card-pad">
              <div className="flex items-center justify-between mb-2">
                <div className="label">Optimized prompt</div>
                <button onClick={copyOptimized} className="btn text-xs">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-panel2 border border-border rounded-lg p-3 max-h-80 overflow-auto">
                {result.optimizedPrompt}
              </pre>
            </div>
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
          <div className="text-sm font-medium">{s.title}</div>
          <div className="text-xs text-muted mt-0.5">{s.description}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-good tabular-nums">
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
              <div className="label mb-1">Before</div>
              <pre className="whitespace-pre-wrap break-words bg-bad/5 border border-bad/30 rounded-lg p-2 max-h-40 overflow-auto">
                {s.before}
              </pre>
            </div>
          )}
          {s.after && (
            <div>
              <div className="label mb-1">After</div>
              <pre className="whitespace-pre-wrap break-words bg-good/5 border border-good/30 rounded-lg p-2 max-h-40 overflow-auto">
                {s.after}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-muted mb-1">
          <span>Confidence</span>
          <span className="tabular-nums">{confPct}%</span>
        </div>
        <div className="w-full h-1.5 bg-panel2 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full"
            style={{ width: `${confPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
