'use client';
import { useEffect, useState } from 'react';
import type { ModelPricing, Category, Complexity } from '@/lib/types';
import type { CompareResult } from '@/lib/compare';
import { CATEGORY_CHIP, COMPLEXITY_CHIP } from './PromptTable';
import { DiffView } from './DiffView';

const SAMPLE_A = `I want you to act as a senior software engineer. Please please please write a Python function that takes a list of integers and returns the sum. Make sure it handles edge cases. Also could you also add type hints? And can you also include a docstring? Also tell me what the time complexity is.`;
const SAMPLE_B = `Write a Python function that sums a list of integers. Include type hints, a docstring, edge-case handling for empty input, and note the time complexity.`;

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 0.0001) return `$${n.toFixed(6)}`;
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

function signedPct(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function isCategory(v: string): v is Category {
  return v in CATEGORY_CHIP;
}

function isComplexity(v: string): v is Complexity {
  return v in COMPLEXITY_CHIP;
}

interface CopyState {
  side: 'a' | 'b' | null;
}

export function CompareForm() {
  const [promptA, setPromptA] = useState('');
  const [labelA, setLabelA] = useState('');
  const [promptB, setPromptB] = useState('');
  const [labelB, setLabelB] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<ModelPricing[]>([]);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyState>({ side: null });

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
    if (!promptA.trim() || !promptB.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          a: { prompt: promptA, ...(labelA.trim() ? { label: labelA.trim() } : {}) },
          b: { prompt: promptB, ...(labelB.trim() ? { label: labelB.trim() } : {}) },
          model: model || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Compare failed (${res.status})`);
      const data = (await res.json()) as CompareResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  function loadSample() {
    setPromptA(SAMPLE_A);
    setPromptB(SAMPLE_B);
    setLabelA('Original');
    setLabelB('Optimized');
    setResult(null);
    setError(null);
  }

  function swap() {
    setPromptA(promptB);
    setPromptB(promptA);
    setLabelA(labelB);
    setLabelB(labelA);
    setResult(null);
  }

  async function copySide(side: 'a' | 'b') {
    if (!result) return;
    const text = side === 'a' ? result.a.prompt : result.b.prompt;
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ side });
      setTimeout(() => setCopied({ side: null }), 1500);
    } catch {
      /* ignore */
    }
  }

  const canSubmit = promptA.trim().length > 0 && promptB.trim().length > 0 && !loading;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="card card-pad space-y-4 fade-up">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PromptColumn
            heading="Prompt A"
            label={labelA}
            onLabelChange={setLabelA}
            value={promptA}
            onChange={setPromptA}
            labelPlaceholder="Original"
            promptPlaceholder="Paste the first prompt here..."
          />
          <PromptColumn
            heading="Prompt B"
            label={labelB}
            onLabelChange={setLabelB}
            value={promptB}
            onChange={setPromptB}
            labelPlaceholder="Optimized"
            promptPlaceholder="Paste the second prompt here..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
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
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary disabled:opacity-50"
            >
              {loading ? 'Comparing...' : 'Compare'}
            </button>
            <button type="button" onClick={loadSample} className="btn">
              Try sample
            </button>
            <button
              type="button"
              onClick={swap}
              className="btn"
              disabled={!promptA && !promptB}
            >
              Swap A {'↔'} B
            </button>
          </div>
        </div>

        {error && <div className="text-xs text-bad">Error: {error}</div>}
      </form>

      {!result && !loading && (
        <EmptyResults onSample={loadSample} />
      )}

      {loading && (
        <div className="card card-pad text-sm text-muted flex items-center gap-2 fade-up-delay-1">
          <span className="inline-block w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Computing diff and comparison...
        </div>
      )}

      {result && (
        <ResultsPanel
          result={result}
          labelA={labelA || 'Prompt A'}
          labelB={labelB || 'Prompt B'}
          onCopy={copySide}
          copied={copied}
        />
      )}
    </div>
  );
}

interface PromptColumnProps {
  heading: string;
  label: string;
  onLabelChange: (v: string) => void;
  value: string;
  onChange: (v: string) => void;
  labelPlaceholder: string;
  promptPlaceholder: string;
}

function PromptColumn({
  heading,
  label,
  onLabelChange,
  value,
  onChange,
  labelPlaceholder,
  promptPlaceholder,
}: PromptColumnProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label">{heading}</span>
        <input
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder={labelPlaceholder}
          className="input !py-1.5 !text-xs max-w-[180px]"
          aria-label={`${heading} label`}
        />
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={promptPlaceholder}
        className="input min-h-[240px] font-mono text-xs leading-relaxed"
      />
      <div className="text-xs text-muted tabular-nums">
        {value.length} chars
      </div>
    </div>
  );
}

function EmptyResults({ onSample }: { onSample: () => void }) {
  return (
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
            <path d="M16 3h5v5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 21H3v-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 3l-7 7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <div className="label">Side-by-side comparison</div>
          <div className="text-sm text-inkDim mt-1">
            Drop two versions of a prompt above to see the diff and savings.
          </div>
        </div>
      </div>
      <ul className="text-xs text-muted space-y-2">
        {[
          'Token and cost savings (or extra spend) per call',
          'Line-level diff with added / removed highlighting',
          'Classification shift: category, complexity, dimensions',
          'A clear verdict: which one is better, and by how much',
        ].map((t) => (
          <li key={t} className="flex gap-2">
            <span className="text-brandLight mt-0.5" aria-hidden>{'→'}</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <button onClick={onSample} className="btn mt-4">
        Try a sample pair <span aria-hidden>{'→'}</span>
      </button>
    </div>
  );
}

interface ResultsPanelProps {
  result: CompareResult;
  labelA: string;
  labelB: string;
  onCopy: (side: 'a' | 'b') => void;
  copied: CopyState;
}

function ResultsPanel({ result, labelA, labelB, onCopy, copied }: ResultsPanelProps) {
  return (
    <div className="space-y-4">
      <VerdictHero result={result} labelA={labelA} labelB={labelB} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 fade-up-delay-1">
        <StatCard
          title="Tokens"
          a={result.a.tokens}
          b={result.b.tokens}
          delta={result.savings.tokens}
          deltaPct={result.savings.tokensPercent}
          formatter={formatNum}
        />
        <StatCard
          title="Estimated cost / call"
          a={result.a.estimatedCost}
          b={result.b.estimatedCost}
          delta={result.savings.cost}
          deltaPct={result.savings.costPercent}
          formatter={formatUSD}
        />
        <StatCard
          title="Estimated output"
          a={result.a.estimatedOutputTokens}
          b={result.b.estimatedOutputTokens}
          delta={result.a.estimatedOutputTokens - result.b.estimatedOutputTokens}
          deltaPct={
            result.a.estimatedOutputTokens > 0
              ? ((result.a.estimatedOutputTokens - result.b.estimatedOutputTokens) /
                  result.a.estimatedOutputTokens) *
                100
              : 0
          }
          formatter={formatNum}
        />
      </div>

      <ClassificationCard result={result} labelA={labelA} labelB={labelB} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 fade-up-delay-3">
        <DiffPanel
          heading={labelA}
          subheading="Removed segments in red"
          segments={result.diff}
          mode="before"
          onCopy={() => onCopy('a')}
          copied={copied.side === 'a'}
        />
        <DiffPanel
          heading={labelB}
          subheading="Added segments in green"
          segments={result.diff}
          mode="after"
          onCopy={() => onCopy('b')}
          copied={copied.side === 'b'}
        />
      </div>

      {result.analysisNotes.length > 0 && (
        <div className="card card-pad fade-up-delay-3">
          <div className="label mb-3">Analysis notes</div>
          <ul className="space-y-2 text-sm text-inkDim">
            {result.analysisNotes.map((note, i) => (
              <li key={i} className="flex gap-2 leading-relaxed">
                <span className="text-brandLight mt-0.5" aria-hidden>
                  {'•'}
                </span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function VerdictHero({
  result,
  labelA,
  labelB,
}: {
  result: CompareResult;
  labelA: string;
  labelB: string;
}) {
  const { verdict, savings } = result;

  let headline: string;
  let gradientClass: string;
  let chipClass: string;
  let chipLabel: string;
  let subtitle: string;

  if (verdict === 'b-better') {
    const tokensAbs = Math.abs(savings.tokens);
    const tokensPctAbs = Math.abs(savings.tokensPercent);
    headline =
      tokensAbs > 0
        ? `${labelB} saves ${formatNum(tokensAbs)} tokens (${tokensPctAbs.toFixed(1)}%)`
        : `${labelB} is cheaper`;
    gradientClass = 'gradient-text-good';
    chipClass = 'chip-good';
    chipLabel = `${labelB} wins`;
    subtitle =
      savings.cost > 0
        ? `Saves ${formatUSD(savings.cost)} per call (${savings.costPercent.toFixed(1)}%).`
        : 'Lower token count, similar cost per call.';
  } else if (verdict === 'a-better') {
    const tokensAbs = Math.abs(savings.tokens);
    const tokensPctAbs = Math.abs(savings.tokensPercent);
    headline =
      tokensAbs > 0
        ? `${labelA} is leaner by ${formatNum(tokensAbs)} tokens (${tokensPctAbs.toFixed(1)}%)`
        : `${labelA} is cheaper`;
    gradientClass = 'gradient-text-warn';
    chipClass = 'chip-warn';
    chipLabel = `${labelA} wins`;
    subtitle =
      savings.cost < 0
        ? `${labelB} costs ${formatUSD(-savings.cost)} more per call.`
        : 'B added tokens without lowering cost.';
  } else {
    headline = 'Tie';
    gradientClass = 'gradient-text';
    chipClass = 'chip-blue';
    chipLabel = 'No clear winner';
    subtitle =
      result.a.prompt === result.b.prompt
        ? 'Prompts are identical.'
        : 'Token count and cost are effectively the same.';
  }

  return (
    <div className="card card-pad relative overflow-hidden fade-up">
      <div
        className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{
          background:
            verdict === 'b-better'
              ? 'radial-gradient(circle, #22c55e 0%, transparent 70%)'
              : verdict === 'a-better'
                ? 'radial-gradient(circle, #f59e0b 0%, transparent 70%)'
                : 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)',
        }}
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <span className={`chip ${chipClass}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current pulse-glow" />
            {chipLabel}
          </span>
        </div>
        <div className={`stat-num-xl ${gradientClass}`}>{headline}</div>
        <div className="text-sm text-inkDim mt-2">{subtitle}</div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  a: number;
  b: number;
  delta: number;
  deltaPct: number;
  formatter: (n: number) => string;
}

function StatCard({ title, a, b, delta, deltaPct, formatter }: StatCardProps) {
  const isSaving = delta > 0;
  const isCost = delta < 0;
  const chip = isSaving ? 'chip-good' : isCost ? 'chip-warn' : 'chip';
  const sign = delta > 0 ? '-' : delta < 0 ? '+' : '';
  const deltaStr = delta === 0 ? 'No change' : `${sign}${formatter(Math.abs(delta))}`;
  return (
    <div className="card card-pad">
      <div className="label mb-2">{title}</div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xl font-bold tabular-nums">{formatter(a)}</span>
        <span className="text-muted" aria-hidden>{'→'}</span>
        <span className="text-2xl font-bold tabular-nums">{formatter(b)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`chip ${chip} tabular-nums`}>{deltaStr}</span>
        {Number.isFinite(deltaPct) && deltaPct !== 0 && (
          <span className="text-xs text-muted tabular-nums">{signedPct(-deltaPct)}</span>
        )}
      </div>
    </div>
  );
}

function ClassificationCard({
  result,
  labelA,
  labelB,
}: {
  result: CompareResult;
  labelA: string;
  labelB: string;
}) {
  return (
    <div className="card card-pad fade-up-delay-2">
      <div className="label mb-3">Classification</div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-start">
        <SideClassification side={result.a} title={labelA} />
        <div className="text-muted flex md:flex-col md:items-center md:justify-center text-2xl md:pt-6" aria-hidden>
          {'→'}
        </div>
        <SideClassification side={result.b} title={labelB} />
      </div>
    </div>
  );
}

function SideClassification({
  side,
  title,
}: {
  side: CompareResult['a'];
  title: string;
}) {
  const catChip = isCategory(side.category) ? CATEGORY_CHIP[side.category] : '';
  const cxChip = isComplexity(side.complexity) ? COMPLEXITY_CHIP[side.complexity] : '';
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-inkDim">{title}</div>
      <div className="flex flex-wrap gap-2">
        <span className={`chip capitalize ${catChip}`}>{side.category}</span>
        <span className={`chip capitalize ${cxChip}`}>{side.complexity}</span>
        <span className="chip tabular-nums">score {side.complexityScore}</span>
      </div>
      {side.dimensions.length > 0 && (
        <div>
          <div className="label mb-1.5">Dimensions ({side.dimensions.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {side.dimensions.map((d, i) => (
              <span key={i} className="chip text-xs">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface DiffPanelProps {
  heading: string;
  subheading: string;
  segments: CompareResult['diff'];
  mode: 'before' | 'after';
  onCopy: () => void;
  copied: boolean;
}

function DiffPanel({ heading, subheading, segments, mode, onCopy, copied }: DiffPanelProps) {
  return (
    <div className="card card-pad space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="label">{heading}</div>
          <div className="text-xs text-muted mt-1">{subheading}</div>
        </div>
        <button onClick={onCopy} className="btn text-xs">
          {copied ? 'Copied' : `Copy ${mode === 'before' ? 'A' : 'B'}`}
        </button>
      </div>
      <DiffView segments={segments} mode={mode} />
    </div>
  );
}
