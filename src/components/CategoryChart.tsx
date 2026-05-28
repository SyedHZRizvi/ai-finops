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

// Centralized category color map
export const CATEGORY_COLORS: Record<Category, string> = {
  factual: '#14b8a6',        // teal
  reasoning: '#3b82f6',       // blue
  creative: '#ec4899',        // pink
  code: '#84cc16',            // lime
  analytical: '#f59e0b',      // amber
  conversational: '#8b5cf6',  // brand (purple)
  instructional: '#6366f1',   // indigo
  other: '#f43f5e',           // rose
};

interface TooltipPayload {
  active?: boolean;
  payload?: { payload: { category: Category; calls: number; tokens: number; cost: number } }[];
}

function CustomTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="card card-pad text-xs tabular-nums shadow-card">
      <div className="text-inkDim mb-1.5 capitalize font-semibold">{p.category}</div>
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
    <div className="card card-pad fade-up-delay-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label">Cost by category</div>
          <div className="text-xs text-muted mt-1">Sorted by spend</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-pink/15 border border-pink/30 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 text-pink"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <line x1="12" y1="20" x2="12" y2="10" strokeLinecap="round" />
            <line x1="18" y1="20" x2="18" y2="4" strokeLinecap="round" />
            <line x1="6" y1="20" x2="6" y2="16" strokeLinecap="round" />
          </svg>
        </div>
      </div>
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
              <defs>
                {sorted.map((d) => (
                  <linearGradient
                    key={`grad-${d.category}`}
                    id={`catgrad-${d.category}`}
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="0"
                  >
                    <stop offset="0%" stopColor={CATEGORY_COLORS[d.category]} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={CATEGORY_COLORS[d.category]} stopOpacity={1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="#262a3a" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => formatUSD(Number(v))}
                tick={{ fill: '#7b829a', fontSize: 11 }}
                axisLine={{ stroke: '#262a3a' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="category"
                tick={{ fill: '#c9cbd6', fontSize: 11, fontWeight: 500 }}
                axisLine={{ stroke: '#262a3a' }}
                tickLine={false}
                width={90}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#181a26' }} />
              <Bar dataKey="cost" radius={[0, 6, 6, 0]}>
                {sorted.map((d) => (
                  <Cell
                    key={d.category}
                    fill={`url(#catgrad-${d.category})`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
