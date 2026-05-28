'use client';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { StatsResponse } from '@/lib/types';

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  if (abs < 1000) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatTick(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface TooltipPayload {
  active?: boolean;
  payload?: { value: number; payload: { ts: string; calls: number; tokens: number; cost: number } }[];
}

function CustomTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const d = new Date(p.ts);
  const label = Number.isNaN(d.getTime()) ? p.ts : d.toLocaleString();
  return (
    <div className="card card-pad text-xs tabular-nums shadow-card">
      <div className="text-inkDim mb-1.5 font-semibold">{label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-muted">Cost</span>
        <span className="text-ink">{formatUSD(p.cost)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted">Calls</span>
        <span className="text-ink">{p.calls.toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted">Tokens</span>
        <span className="text-ink">{p.tokens.toLocaleString()}</span>
      </div>
    </div>
  );
}

export function CostChart({ data }: { data: StatsResponse['timeseries'] }) {
  return (
    <div className="card card-pad fade-up-delay-2">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label">Cost over time</div>
          <div className="text-xs text-muted mt-1">USD per bucket</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-brand/15 border border-brand/30 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 text-brandLight"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <polyline
              points="22 12 18 12 15 21 9 3 6 12 2 12"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-muted">
          No data for this period
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                  <stop offset="50%" stopColor="#a78bfa" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="costStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#262a3a" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="ts"
                tickFormatter={formatTick}
                tick={{ fill: '#7b829a', fontSize: 11 }}
                axisLine={{ stroke: '#262a3a' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatUSD(Number(v))}
                tick={{ fill: '#7b829a', fontSize: 11 }}
                axisLine={{ stroke: '#262a3a' }}
                tickLine={false}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#a78bfa', strokeOpacity: 0.4 }} />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="url(#costStroke)"
                strokeWidth={2.5}
                fill="url(#costGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
