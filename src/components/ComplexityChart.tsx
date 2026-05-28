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

const COMPLEXITY_COLORS: Record<Complexity, string> = {
  simple: '#22c55e',
  moderate: '#22d3ee',
  complex: '#f59e0b',
  multidimensional: '#ef4444',
};

interface TooltipPayload {
  active?: boolean;
  payload?: { payload: { complexity: Complexity; calls: number; tokens: number; cost: number } }[];
}

function CustomTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="card card-pad text-xs tabular-nums">
      <div className="text-muted mb-1 capitalize">{p.complexity}</div>
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
    <div className="card card-pad">
      <div className="label">Complexity mix</div>
      <div className="text-xs text-muted mt-0.5 mb-3">Share of calls</div>
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
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                stroke="#0a0b0e"
                strokeWidth={2}
              >
                {nonZero.map((d) => (
                  <Cell key={d.complexity} fill={COMPLEXITY_COLORS[d.complexity] ?? '#64748b'} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                wrapperStyle={{ fontSize: 11, color: '#8b92a5' }}
                formatter={(value) => <span className="capitalize text-muted">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
