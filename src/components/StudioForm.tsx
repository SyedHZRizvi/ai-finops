'use client';
import { useState } from 'react';
import { PROVIDER_STYLES } from '@/lib/providerStyles';
import type {
  AudienceLevel,
  OutcomeFormat,
  OutputLength,
  StudioRequest,
  StudioResult,
  StudioVariant,
  TargetProvider,
  Tone,
} from '@/lib/types';

const PROVIDERS: TargetProvider[] = [
  'claude', 'gpt', 'gemini', 'copilot', 'cursor', 'perplexity', 'generic',
];

const AUDIENCES: { value: AudienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'general', label: 'General' },
  { value: 'expert', label: 'Expert' },
  { value: 'executive', label: 'Executive' },
];

const FORMATS: { value: OutcomeFormat | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'free-text', label: 'Free text' },
  { value: 'bullet-list', label: 'Bullet list' },
  { value: 'numbered-list', label: 'Numbered list' },
  { value: 'table', label: 'Table' },
  { value: 'code', label: 'Code' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'essay', label: 'Essay' },
  { value: 'summary', label: 'Summary' },
  { value: 'qa-pairs', label: 'Q&A pairs' },
  { value: 'step-by-step', label: 'Step-by-step' },
];

const LENGTHS: { value: OutputLength; label: string }[] = [
  { value: 'brief', label: 'Brief' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
];

const TONES: { value: Tone; label: string }[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'technical', label: 'Technical' },
  { value: 'persuasive', label: 'Persuasive' },
];

const SAMPLE = {
  problem: 'Analyze our SaaS churn',
  desiredOutcome: 'Identify top 3 leading indicators with evidence',
};

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 0.01) return `$${n.toFixed(5)}`;
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

function splitCsv(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

export function StudioForm() {
  const [problem, setProblem] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [targetProvider, setTargetProvider] = useState<TargetProvider>('claude');
  const [audience, setAudience] = useState<AudienceLevel | ''>('');
  const [outputFormat, setOutputFormat] = useState<OutcomeFormat | 'auto'>('auto');
  const [outputLength, setOutputLength] = useState<OutputLength | ''>('');
  const [tone, setTone] = useState<Tone>('neutral');
  const [mustInclude, setMustInclude] = useState('');
  const [mustAvoid, setMustAvoid] = useState('');

  const [result, setResult] = useState<StudioResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!problem.trim() || !desiredOutcome.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const body: StudioRequest = {
        problem,
        desiredOutcome,
        targetProvider,
        tone,
      };
      if (audience) body.audience = audience;
      if (outputFormat !== 'auto') body.outputFormat = outputFormat;
      if (outputLength) body.outputLength = outputLength;
      const inc = splitCsv(mustInclude);
      const avoid = splitCsv(mustAvoid);
      if (inc.length) body.mustInclude = inc;
      if (avoid.length) body.mustAvoid = avoid;

      const res = await fetch('/api/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Studio failed (${res.status})`);
      const data = (await res.json()) as StudioResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  function loadSample() {
    setProblem(SAMPLE.problem);
    setDesiredOutcome(SAMPLE.desiredOutcome);
    setResult(null);
    setError(null);
  }

  function clearAll() {
    setProblem('');
    setDesiredOutcome('');
    setMustInclude('');
    setMustAvoid('');
    setResult(null);
    setError(null);
  }

  const providerLabel = PROVIDER_STYLES[targetProvider].label;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <form onSubmit={submit} className="card card-pad space-y-3">
        <div className="flex items-center justify-between">
          <div className="label">Inputs</div>
          <button type="button" onClick={loadSample} className="btn text-xs">
            Try sample
          </button>
        </div>

        <div>
          <label className="label block mb-1">Problem</label>
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="What problem are you trying to solve? Be specific."
            className="input min-h-[120px] text-sm leading-relaxed"
          />
        </div>

        <div>
          <label className="label block mb-1">Desired Outcome</label>
          <textarea
            value={desiredOutcome}
            onChange={(e) => setDesiredOutcome(e.target.value)}
            placeholder="What does a good answer look like? Format, depth, deliverable."
            className="input min-h-[80px] text-sm leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label block mb-1">Target Provider</label>
            <select
              className="input"
              value={targetProvider}
              onChange={(e) => setTargetProvider(e.target.value as TargetProvider)}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_STYLES[p].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label block mb-1">Audience</label>
            <select
              className="input"
              value={audience}
              onChange={(e) => setAudience(e.target.value as AudienceLevel | '')}
            >
              <option value="">Auto</option>
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label block mb-1">Format</label>
            <select
              className="input"
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as OutcomeFormat | 'auto')}
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label block mb-1">Length</label>
            <select
              className="input"
              value={outputLength}
              onChange={(e) => setOutputLength(e.target.value as OutputLength | '')}
            >
              <option value="">Auto</option>
              {LENGTHS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label block mb-1">Tone</label>
            <select
              className="input"
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
            >
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label block mb-1">Must Include (comma-separated)</label>
          <input
            type="text"
            value={mustInclude}
            onChange={(e) => setMustInclude(e.target.value)}
            placeholder="key terms, points, files"
            className="input"
          />
        </div>

        <div>
          <label className="label block mb-1">Must Avoid (comma-separated)</label>
          <input
            type="text"
            value={mustAvoid}
            onChange={(e) => setMustAvoid(e.target.value)}
            placeholder="topics, phrasings, jargon to skip"
            className="input"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={loading || !problem.trim() || !desiredOutcome.trim()}
            className="btn btn-primary disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Prompt'}
          </button>
          {(problem || desiredOutcome) && (
            <button type="button" onClick={clearAll} className="btn">
              Clear
            </button>
          )}
        </div>

        {error && <div className="text-xs text-bad">Error: {error}</div>}
      </form>

      <div className="space-y-4">
        {!result && !loading && (
          <div className="card card-pad">
            <div className="label">Result</div>
            <div className="text-sm text-muted mt-2">
              Describe your problem on the left and click Generate. You will see:
            </div>
            <ul className="text-xs text-muted mt-3 space-y-1.5 list-disc list-inside">
              <li>Auto-detected category, complexity, and dimensions</li>
              <li>Recommended model for your target provider</li>
              <li>3-4 prompt variants (terse, standard, detailed, system+user)</li>
              <li>Token count and estimated cost per variant</li>
              <li>Split prompts when the problem is multidimensional</li>
            </ul>
            <button onClick={loadSample} className="btn mt-4">
              Load sample <span aria-hidden>→</span>
            </button>
          </div>
        )}

        {loading && (
          <div className="card card-pad text-sm text-muted">Generating prompt...</div>
        )}

        {result && (
          <>
            <div className="card card-pad">
              <div className="label">{providerLabel}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="chip capitalize">{result.detectedCategory}</span>
                <span className="chip capitalize">{result.detectedComplexity}</span>
                <span className="chip">model: {result.recommendedModel}</span>
              </div>
              {result.detectedDimensions.length > 0 && (
                <div className="mt-3">
                  <div className="label mb-1">Dimensions</div>
                  <div className="flex flex-wrap gap-2">
                    {result.detectedDimensions.map((d, i) => (
                      <span key={i} className="chip">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {result.warnings.length > 0 && (
              <div className="card card-pad border-warn/40 bg-warn/5">
                <div className="label text-warn/90 mb-2">Warnings</div>
                <ul className="text-xs space-y-1.5">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-warn shrink-0" aria-hidden>!</span>
                      <span className="text-ink/90">{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.tips.length > 0 && (
              <div className="card card-pad">
                <div className="label mb-2">Tips</div>
                <ul className="text-xs space-y-1.5">
                  {result.tips.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-brand shrink-0" aria-hidden>•</span>
                      <span className="text-ink/90">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3">
              <div className="label">Variants ({result.variants.length})</div>
              {result.variants.map((v, i) => (
                <VariantCard key={i} variant={v} />
              ))}
            </div>

            {result.splitPrompts && result.splitPrompts.length > 0 && (
              <div className="card card-pad">
                <div className="label mb-2">Split prompts ({result.splitPrompts.length})</div>
                <div className="text-xs text-muted mb-3">
                  Multidimensional problem detected. Run these as separate, focused calls.
                </div>
                <ol className="space-y-2 list-decimal list-inside">
                  {result.splitPrompts.map((p, i) => (
                    <SplitPromptItem key={i} index={i + 1} prompt={p} />
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VariantCard({ variant }: { variant: StudioVariant }) {
  const [copied, setCopied] = useState(false);
  const [copiedSystem, setCopiedSystem] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(variant.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function copySystem() {
    if (!variant.systemPrompt) return;
    try {
      await navigator.clipboard.writeText(variant.systemPrompt);
      setCopiedSystem(true);
      setTimeout(() => setCopiedSystem(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-sm font-medium capitalize">{variant.style.replace(/-/g, ' ')}</div>
          <div className="text-xs text-muted italic mt-0.5">{variant.rationale}</div>
        </div>
        <div className="text-right shrink-0 text-xs tabular-nums">
          <div>{formatNum(variant.tokenCount)} tok in</div>
          <div className="text-muted">~{formatNum(variant.estimatedOutputTokens)} tok out</div>
          <div className="text-good">{formatUSD(variant.estimatedCost)} / call</div>
        </div>
      </div>

      {variant.systemPrompt && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <div className="label">System</div>
            <button onClick={copySystem} className="btn text-xs">
              {copiedSystem ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-panel2 border border-border rounded-lg p-3 max-h-40 overflow-auto">
            {variant.systemPrompt}
          </pre>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="label">{variant.systemPrompt ? 'User' : 'Prompt'}</div>
          <button onClick={copyPrompt} className="btn text-xs">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-panel2 border border-border rounded-lg p-3 max-h-80 overflow-auto">
          {variant.prompt}
        </pre>
      </div>
    </div>
  );
}

function SplitPromptItem({ index, prompt }: { index: number; prompt: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <li className="text-xs">
      <div className="inline-flex items-center gap-2 mb-1">
        <span className="text-muted">#{index}</span>
        <button onClick={copy} className="btn text-xs py-0.5">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-panel2 border border-border rounded-lg p-2">
        {prompt}
      </pre>
    </li>
  );
}
