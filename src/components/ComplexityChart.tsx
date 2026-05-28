'use client';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Complexity, StatsResponse } from '@/lib/types';

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  const abs = Math.abs(n);
  if (abs < 1) return `$${n.toFixed(4)}`;
  if (abs < 1000) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// Centralized complexity color map
export const COMPLEXITY_COLORS: Record<Complexity, string> = {
  simple: '#22c55e',          // good (green)
  moderate: '#3b82f6',         // blue
  complex: '#f59e0b',          // warn (amber)
  multidimensional: '#ec4899', // pink/bad
};

interface TooltipPayload {
  active?: boolean;
  payload?: { payload: { complexity: Complexity; calls: number; tokens: number; cost: number } }[];
}

function CustomTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="card card-pad text-xs tabular-nums shadow-card">
      <div className="text-inkDim mb-1.5 capitalize font-semibold">{p.complexity}</div>
      <div className="flex justify-between gap-4">
        <span className="text-muted">Calls</span>
        <span className="text-ink">{p.calls.toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted">Cost</span>
        <span className="text-ink">{formatUSD(p.cost)}</span>
      </div>
    </div>
  );
}

export function ComplexityChart({ data }: { data: StatsResponse['byComplexity'] }) {
  const nonZero = data.filter((d) => d.calls > 0);

  return (
    <div className="card card-pad fade-up-delay-2">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label">Complexity mix</div>
          <div className="text-xs text-muted mt-1">Share of calls</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-indigo/15 border border-indigo/30 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 text-indigo"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
        </div>
      </div>
      {nonZero.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-muted">No data</div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={nonZero}
                dataKey="calls"
                nameKey="complexity"
                cx="50%"
                cy="45%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
                stroke="#0f1018"
                strokeWidth={3}
              >
                {nonZero.map((d) => (
                  <Cell key={d.complexity} fill={COMPLEXITY_COLORS[d.complexity] ?? '#7b829a'} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                wrapperStyle={{ fontSize: 11, color: '#c9cbd6' }}
                formatter={(value) => <span className="capitalize text-inkDim">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
