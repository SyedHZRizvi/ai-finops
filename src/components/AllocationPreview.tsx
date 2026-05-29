'use client';
import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { AllocationRuleData } from '@/lib/allocation';

interface AllocationPreviewProps {
  rules: AllocationRuleData[];
}

interface PreviewItem {
  appName: string;
  before: number;
  after: number;
  delta: number;
}

interface PreviewResponse {
  period: '7d' | '30d';
  totalCost: number;
  items: PreviewItem[];
  rowsMatched: number;
  rowsTotal: number;
  error?: string;
}

type Period = '7d' | '30d';

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface TooltipPayload {
  active?: boolean;
  payload?: {
    payload: PreviewItem;
    name: string;
    value: number;
  }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipPayload) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload;
  return (
    <div className="card card-pad text-xs tabular-nums shadow-card">
      <div className="text-inkDim mb-1.5 font-semibold font-mono">{label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-muted">Before</span>
        <span className="text-ink">{formatUSD(item.before)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted">After</span>
        <span className="text-ink">{formatUSD(item.after)}</span>
      </div>
      <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-border">
        <span className="text-muted">Delta</span>
        <span className={item.delta >= 0 ? 'text-good' : 'text-bad'}>
          {item.delta >= 0 ? '+' : ''}
          {formatUSD(item.delta)}
        </span>
      </div>
    </div>
  );
}

export function AllocationPreview({ rules }: AllocationPreviewProps) {
  const [period, setPeriod] = useState<Period>('7d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewResponse | null>(null);

  async function runPreview() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch('/api/allocations/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules, period }),
      });
      const json = (await res.json().catch(() => ({}))) as PreviewResponse;
      if (!res.ok) {
        throw new Error(json.error ?? `Preview failed (${res.status})`);
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  }

  // Truncate the chart to the top 12 changes so we don't render a 200-bar
  // wall on busy projects. Items are already sorted by abs(delta) desc.
  const chartData = data ? data.items.slice(0, 12) : [];

  return (
    <div className="card card-pad space-y-4 fade-up-delay-2">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="label">Preview impact</div>
          <p className="text-xs text-muted mt-1">
            See what these rules would do to per-app spend, using real data
            from the selected window. Doesn&apos;t modify anything.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['7d', '30d'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`btn ${period === p ? 'border-brand bg-brand/10 text-brandLight' : ''}`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={runPreview}
            disabled={loading || rules.length === 0}
            className="btn-primary"
          >
            {loading ? 'Running...' : 'Preview'}
          </button>
        </div>
      </div>

      {rules.length === 0 && (
        <div className="card-pad border border-border bg-panel2 rounded-xl text-sm text-muted text-center">
          Add and save at least one rule to preview its impact.
        </div>
      )}

      {error && (
        <div className="card-pad border border-bad/40 bg-bad/5 rounded-xl text-sm text-bad">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="card card-pad">
              <div className="label">Total spend</div>
              <div className="stat-num-sm mt-1">{formatUSD(data.totalCost)}</div>
            </div>
            <div className="card card-pad">
              <div className="label">Rows in window</div>
              <div className="stat-num-sm mt-1 tabular-nums">
                {data.rowsTotal.toLocaleString()}
              </div>
            </div>
            <div className="card card-pad">
              <div className="label">Rows matched</div>
              <div className="stat-num-sm mt-1 tabular-nums">
                {data.rowsMatched.toLocaleString()}
              </div>
            </div>
            <div className="card card-pad">
              <div className="label">Apps affected</div>
              <div className="stat-num-sm mt-1 tabular-nums">
                {data.items.filter((i) => i.delta !== 0).length}
              </div>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted">
              No spend in this window.
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="beforeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7b829a" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#7b829a" stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="afterGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={1} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#262a3a" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="appName"
                    tick={{ fill: '#7b829a', fontSize: 11 }}
                    axisLine={{ stroke: '#262a3a' }}
                    tickLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tickFormatter={(v) => formatUSD(Number(v))}
                    tick={{ fill: '#7b829a', fontSize: 11 }}
                    axisLine={{ stroke: '#262a3a' }}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#181a26' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#c9cbd6' }} />
                  <Bar dataKey="before" name="Before" fill="url(#beforeGrad)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="after" name="After" fill="url(#afterGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>App</th>
                  <th className="text-right">Before</th>
                  <th className="text-right">After</th>
                  <th className="text-right">Delta</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.appName}>
                    <td className="font-mono text-xs">{item.appName}</td>
                    <td className="text-right tabular-nums">{formatUSD(item.before)}</td>
                    <td className="text-right tabular-nums">{formatUSD(item.after)}</td>
                    <td className="text-right tabular-nums">
                      <span className={item.delta > 0 ? 'text-good' : item.delta < 0 ? 'text-bad' : 'text-muted'}>
                        {item.delta > 0 ? '+' : ''}
                        {formatUSD(item.delta)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
