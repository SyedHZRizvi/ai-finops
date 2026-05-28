'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { Category, Complexity, PromptCharacteristics } from '@/lib/types';

interface PromptDetailData {
  id: string;
  timestamp: string;
  model: string;
  provider?: string | null;
  appName?: string | null;
  userId?: string | null;
  promptText: string;
  responseText?: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  category: Category;
  complexity: Complexity;
  complexityScore: number;
  dimensions: string[];
  characteristics: PromptCharacteristics;
  latencyMs?: number | null;
  potentialSavedTokens: number;
  potentialSavedCost: number;
}

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

export function PromptDetail({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [data, setData] = useState<PromptDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/prompts/${id}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setData(d as PromptDetailData);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function close() {
    const params = new URLSearchParams(sp.toString());
    params.delete('selected');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20"
        onClick={close}
        aria-hidden
      />
      <aside className="fixed top-0 right-0 h-screen w-full max-w-2xl bg-panel border-l border-border z-30 overflow-y-auto">
        <div className="sticky top-0 bg-panel border-b border-border px-5 py-3 flex items-center justify-between">
          <div className="text-sm font-medium">Prompt detail</div>
          <button onClick={close} className="btn" aria-label="Close">
            Close <span aria-hidden>×</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading && <div className="text-sm text-muted">Loading...</div>}
          {error && <div className="text-sm text-bad">Error: {error}</div>}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="label">Logged</div>
                  <div className="mt-0.5 tabular-nums">
                    {new Date(data.timestamp).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="label">Model</div>
                  <div className="mt-0.5 font-mono">{data.model}</div>
                </div>
                {data.provider && (
                  <div>
                    <div className="label">Provider</div>
                    <div className="mt-0.5">{data.provider}</div>
                  </div>
                )}
                {data.appName && (
                  <div>
                    <div className="label">App</div>
                    <div className="mt-0.5">{data.appName}</div>
                  </div>
                )}
                {data.userId && (
                  <div>
                    <div className="label">User</div>
                    <div className="mt-0.5 font-mono">{data.userId}</div>
                  </div>
                )}
                {typeof data.latencyMs === 'number' && (
                  <div>
                    <div className="label">Latency</div>
                    <div className="mt-0.5 tabular-nums">{formatNum(data.latencyMs)} ms</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="card card-pad">
                  <div className="label">Input</div>
                  <div className="stat-num mt-1">{formatNum(data.inputTokens)}</div>
                  <div className="text-xs text-muted tabular-nums">
                    {formatUSD(data.inputCost)}
                  </div>
                </div>
                <div className="card card-pad">
                  <div className="label">Output</div>
                  <div className="stat-num mt-1">{formatNum(data.outputTokens)}</div>
                  <div className="text-xs text-muted tabular-nums">
                    {formatUSD(data.outputCost)}
                  </div>
                </div>
                <div className="card card-pad">
                  <div className="label">Total</div>
                  <div className="stat-num mt-1">{formatUSD(data.totalCost)}</div>
                  <div className="text-xs text-muted tabular-nums">
                    {formatNum(data.totalTokens)} tokens
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="chip capitalize">{data.category}</span>
                <span className="chip capitalize">{data.complexity}</span>
                <span className="chip tabular-nums">score {data.complexityScore.toFixed(0)}</span>
                {data.potentialSavedCost > 0 && (
                  <span className="chip border-good/40 text-good">
                    save −{formatUSD(data.potentialSavedCost)}
                  </span>
                )}
              </div>

              {data.dimensions.length > 0 && (
                <div>
                  <div className="label mb-2">Dimensions</div>
                  <div className="flex flex-wrap gap-2">
                    {data.dimensions.map((d, i) => (
                      <span key={i} className="chip">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="label mb-2">Characteristics</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums">
                  <Row label="Words" value={formatNum(data.characteristics.wordCount)} />
                  <Row label="Sentences" value={formatNum(data.characteristics.sentenceCount)} />
                  <Row label="Questions" value={formatNum(data.characteristics.questionCount)} />
                  <Row
                    label="Imperative verbs"
                    value={formatNum(data.characteristics.imperativeVerbs)}
                  />
                  <Flag label="Has code" on={data.characteristics.hasCode} />
                  <Flag
                    label="Multiple questions"
                    on={data.characteristics.hasMultipleQuestions}
                  />
                  <Flag label="Context dump" on={data.characteristics.hasContextDump} />
                  <Flag label="Redundancy" on={data.characteristics.hasRedundancy} />
                  <Flag label="Has examples" on={data.characteristics.hasExamples} />
                </div>
              </div>

              <div>
                <div className="label mb-2">Prompt</div>
                <pre className="card card-pad whitespace-pre-wrap break-words text-xs font-mono leading-relaxed max-h-96 overflow-auto">
                  {data.promptText}
                </pre>
              </div>

              {data.responseText && (
                <div>
                  <div className="label mb-2">Response</div>
                  <pre className="card card-pad whitespace-pre-wrap break-words text-xs font-mono leading-relaxed max-h-96 overflow-auto">
                    {data.responseText}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-1">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex justify-between border-b border-border py-1">
      <span className="text-muted">{label}</span>
      <span className={on ? 'text-good' : 'text-muted'}>{on ? 'yes' : 'no'}</span>
    </div>
  );
}
