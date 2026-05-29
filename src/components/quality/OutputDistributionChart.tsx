'use client';
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
import type { OutputDistribution } from '@/lib/qualityMetrics';

// Bucket order is fixed — must match qualityMetrics.OUTPUT_BUCKETS exactly.
// Reuses the accent palette already defined in tailwind.config.ts
// (teal/blue/amber/pink/rose) so this chart visually slots in next to
// CostChart and CategoryChart.
const BUCKETS: { key: string; label: string; color: string }[] = [
  { key: '0-100', label: '0–100', color: '#14b8a6' },      // teal — short
  { key: '100-500', label: '100–500', color: '#3b82f6' },  // blue
  { key: '500-1000', label: '500–1k', color: '#f59e0b' },  // amber
  { key: '1000-2500', label: '1k–2.5k', color: '#ec4899' }, // pink
  { key: '2500+', label: '2.5k+', color: '#f43f5e' },       // rose — long
];

interface ChartRow {
  model: string;
  '0-100': number;
  '100-500': number;
  '500-1000': number;
  '1000-2500': number;
  '2500+': number;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  payload: ChartRow;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="card card-pad text-xs tabular-nums shadow-card">
      <div className="text-inkDim mb-2 font-mono font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4 items-center">
          <span className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: p.color }}
              aria-hidden
            />
            <span className="text-muted">{p.name}</span>
          </span>
          <span className="text-ink">{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

export function OutputDistributionChart({ data }: { data: OutputDistribution[] }) {
  // Pivot the long-form rows (one per model+bucket) into a wide layout that
  // Recharts can stack — one row per model, one numeric column per bucket.
  const byModel = new Map<string, ChartRow>();
  for (const d of data) {
    let row = byModel.get(d.model);
    if (row == null) {
      row = {
        model: d.model,
        '0-100': 0,
        '100-500': 0,
        '500-1000': 0,
        '1000-2500': 0,
        '2500+': 0,
      };
      byModel.set(d.model, row);
    }
    if (
      d.bucket === '0-100' ||
      d.bucket === '100-500' ||
      d.bucket === '500-1000' ||
      d.bucket === '1000-2500' ||
      d.bucket === '2500+'
    ) {
      row[d.bucket] = d.pctOfModel;
    }
  }

  // Sort models alphabetically — deterministic across reloads, no spend bias.
  const rows: ChartRow[] = Array.from(byModel.values()).sort((a, b) =>
    a.model.localeCompare(b.model),
  );

  // Chart height scales with model count so labels never overlap.
  // ~36px per bar + 64px chrome (axes + legend) feels right at default
  // Recharts margins.
  const chartHeight = Math.max(220, rows.length * 36 + 64);

  return (
    <div className="card card-pad fade-up-delay-2">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label">Output length distribution</div>
          <div className="text-xs text-muted mt-1">
            % of responses per token bucket — wider rose = longer outputs
          </div>
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
            <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round" />
            <line x1="3" y1="12" x2="15" y2="12" strokeLinecap="round" />
            <line x1="3" y1="18" x2="9" y2="18" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-muted">
          No output data for this period.
        </div>
      ) : (
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
              barCategoryGap="20%"
            >
              <CartesianGrid stroke="#262a3a" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fill: '#7b829a', fontSize: 11 }}
                axisLine={{ stroke: '#262a3a' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="model"
                tick={{ fill: '#c9cbd6', fontSize: 11, fontWeight: 500 }}
                axisLine={{ stroke: '#262a3a' }}
                tickLine={false}
                width={150}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#181a26' }} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#c9cbd6', paddingTop: 8 }}
                iconType="square"
              />
              {BUCKETS.map((b) => (
                <Bar
                  key={b.key}
                  dataKey={b.key}
                  name={b.label}
                  stackId="a"
                  fill={b.color}
                  // Only the last bucket in the stack gets rounded right edges;
                  // intermediate segments stay sharp so they line up cleanly.
                  radius={b.key === '2500+' ? [0, 6, 6, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
