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
    <div className="card card-pad text-xs tabular-nums">
      <div className="text-muted mb-1">{label}</div>
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
    <div className="card card-pad">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="label">Cost over time</div>
          <div className="text-xs text-muted mt-0.5">USD per bucket</div>
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
                <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#262a36" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="ts"
                tickFormatter={formatTick}
                tick={{ fill: '#8b92a5', fontSize: 11 }}
                axisLine={{ stroke: '#262a36' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatUSD(Number(v))}
                tick={{ fill: '#8b92a5', fontSize: 11 }}
                axisLine={{ stroke: '#262a36' }}
                tickLine={false}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#7c5cff', strokeOpacity: 0.3 }} />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#7c5cff"
                strokeWidth={2}
                fill="url(#costFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
