'use client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import type { Category, StatsResponse } from '@/lib/types';

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  if (abs < 1000) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

const CATEGORY_COLORS: Record<Category, string> = {
  factual: '#22d3ee',
  reasoning: '#7c5cff',
  creative: '#f472b6',
  code: '#22c55e',
  analytical: '#f59e0b',
  conversational: '#60a5fa',
  instructional: '#a78bfa',
  other: '#64748b',
};

interface TooltipPayload {
  active?: boolean;
  payload?: { payload: { category: Category; calls: number; tokens: number; cost: number } }[];
}

function CustomTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="card card-pad text-xs tabular-nums">
      <div className="text-muted mb-1 capitalize">{p.category}</div>
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

export function CategoryChart({ data }: { data: StatsResponse['byCategory'] }) {
  const sorted = [...data].sort((a, b) => b.cost - a.cost);

  return (
    <div className="card card-pad">
      <div className="label">Cost by category</div>
      <div className="text-xs text-muted mt-0.5 mb-3">Sorted by spend</div>
      {sorted.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-muted">No data</div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={sorted}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#262a36" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => formatUSD(Number(v))}
                tick={{ fill: '#8b92a5', fontSize: 11 }}
                axisLine={{ stroke: '#262a36' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="category"
                tick={{ fill: '#8b92a5', fontSize: 11 }}
                axisLine={{ stroke: '#262a36' }}
                tickLine={false}
                width={90}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#181b23' }} />
              <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                {sorted.map((d) => (
                  <Cell key={d.category} fill={CATEGORY_COLORS[d.category] ?? '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
