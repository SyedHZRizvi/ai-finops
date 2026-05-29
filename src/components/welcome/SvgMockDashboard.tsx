/**
 * Inline SVG mockup of the dashboard surface — four stat cards on top,
 * a stacked area cost chart below. Visually mirrors the real dashboard
 * at `/` so the landing page reads as a screenshot without needing an
 * actual binary image asset.
 *
 * Sized via a fluid viewBox so it scales cleanly inside its container.
 */
export function SvgMockDashboard() {
  return (
    <svg
      viewBox="0 0 600 380"
      role="img"
      aria-label="Mock of the AI FinOps dashboard showing stat cards and a cost-over-time chart"
      className="w-full h-auto rounded-2xl border border-borderBright shadow-card"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="dashBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#181a26" />
          <stop offset="100%" stopColor="#0f1018" />
        </linearGradient>
        <linearGradient id="dashGlow1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="dashGlow2" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="dashAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="dashAreaFill2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="dashAccent" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>

      {/* Background panel */}
      <rect width="600" height="380" fill="url(#dashBg)" />
      <rect width="600" height="380" fill="url(#dashGlow1)" />
      <rect width="600" height="380" fill="url(#dashGlow2)" />

      {/* Top toolbar */}
      <rect x="20" y="18" width="190" height="14" rx="3" fill="#a78bfa" opacity="0.9" />
      <rect x="20" y="38" width="260" height="8" rx="2" fill="#7b829a" opacity="0.7" />
      <rect x="500" y="22" width="80" height="22" rx="6" fill="#181a26" stroke="#262a3a" />
      <rect x="510" y="30" width="60" height="6" rx="2" fill="#7b829a" opacity="0.7" />

      {/* Four stat cards */}
      {[
        { x: 20, label: 'Total Calls', value: '12,847', accent: '#3b82f6', glow: 'rgba(59,130,246,0.10)' },
        { x: 160, label: 'Total Tokens', value: '8.2M', accent: '#8b5cf6', glow: 'rgba(139,92,246,0.12)' },
        { x: 300, label: 'Total Cost', value: '$1,284', accent: '#f59e0b', glow: 'rgba(245,158,11,0.10)' },
        { x: 440, label: 'Avg Latency', value: '842 ms', accent: '#14b8a6', glow: 'rgba(20,184,166,0.10)' },
      ].map((c) => (
        <g key={c.label}>
          <rect
            x={c.x}
            y={64}
            width={130}
            height={86}
            rx={12}
            fill="#181a26"
            stroke="#262a3a"
          />
          {/* Top accent bar */}
          <rect
            x={c.x + 6}
            y={64}
            width={118}
            height={2}
            fill="url(#dashAccent)"
            opacity={0.75}
          />
          {/* Soft radial-like overlay (approximate with a small rect) */}
          <rect
            x={c.x + 70}
            y={68}
            width={56}
            height={56}
            rx={28}
            fill={c.glow}
            opacity={0.6}
          />
          {/* Label */}
          <text
            x={c.x + 12}
            y={84}
            fill="#7b829a"
            fontSize="8"
            fontFamily="ui-sans-serif, system-ui"
            fontWeight="600"
            letterSpacing="0.08em"
          >
            {c.label.toUpperCase()}
          </text>
          {/* Icon chip */}
          <rect
            x={c.x + 100}
            y={74}
            width={20}
            height={20}
            rx={6}
            fill={c.accent}
            opacity={0.18}
            stroke={c.accent}
            strokeOpacity={0.4}
          />
          <circle cx={c.x + 110} cy={84} r={3} fill={c.accent} />
          {/* Value */}
          <text
            x={c.x + 12}
            y={118}
            fill="#f3f4f8"
            fontSize="22"
            fontFamily="ui-sans-serif, system-ui"
            fontWeight="700"
          >
            {c.value}
          </text>
          {/* Sub */}
          <rect x={c.x + 12} y={128} width={68} height={6} rx={2} fill="#7b829a" opacity={0.5} />
        </g>
      ))}

      {/* Chart card */}
      <rect x="20" y="170" width="560" height="190" rx={12} fill="#181a26" stroke="#262a3a" />
      <text
        x="34"
        y="194"
        fill="#7b829a"
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui"
        fontWeight="600"
        letterSpacing="0.08em"
      >
        COST OVER TIME · LAST 7 DAYS
      </text>
      <rect x="34" y="200" width="120" height="6" rx="2" fill="#c9cbd6" opacity="0.4" />

      {/* Legend chips */}
      <g transform="translate(420, 188)">
        <rect x="0" y="0" width="60" height="16" rx="8" fill="#8b5cf6" opacity="0.15" stroke="#8b5cf6" strokeOpacity="0.4" />
        <circle cx="8" cy="8" r="3" fill="#a78bfa" />
        <text x="16" y="11" fill="#a78bfa" fontSize="8" fontFamily="ui-sans-serif">input</text>
        <rect x="68" y="0" width="68" height="16" rx="8" fill="#22d3ee" opacity="0.15" stroke="#22d3ee" strokeOpacity="0.4" />
        <circle cx="76" cy="8" r="3" fill="#67e8f9" />
        <text x="84" y="11" fill="#67e8f9" fontSize="8" fontFamily="ui-sans-serif">output</text>
      </g>

      {/* Y-axis grid lines */}
      {[230, 260, 290, 320, 340].map((y) => (
        <line
          key={y}
          x1="56"
          x2="566"
          y1={y}
          y2={y}
          stroke="#262a3a"
          strokeOpacity="0.5"
          strokeDasharray="2 4"
        />
      ))}

      {/* Y-axis labels */}
      {[
        { y: 234, label: '$300' },
        { y: 264, label: '$200' },
        { y: 294, label: '$100' },
        { y: 324, label: '$50' },
      ].map((t) => (
        <text
          key={t.y}
          x="32"
          y={t.y}
          fill="#7b829a"
          fontSize="7"
          fontFamily="ui-sans-serif"
          textAnchor="end"
        >
          {t.label}
        </text>
      ))}

      {/* Stacked area chart paths — output layer first (back) */}
      <path
        d="M 56 320 L 130 305 L 204 295 L 278 270 L 352 280 L 426 245 L 500 235 L 566 220 L 566 340 L 56 340 Z"
        fill="url(#dashAreaFill2)"
        stroke="#22d3ee"
        strokeWidth="1.2"
        strokeOpacity="0.7"
      />
      {/* Input layer (front) */}
      <path
        d="M 56 330 L 130 322 L 204 310 L 278 298 L 352 305 L 426 280 L 500 268 L 566 260 L 566 340 L 56 340 Z"
        fill="url(#dashAreaFill)"
        stroke="#8b5cf6"
        strokeWidth="1.4"
      />

      {/* X-axis labels (day ticks) */}
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
        <text
          key={d}
          x={56 + i * 85}
          y="352"
          fill="#7b829a"
          fontSize="7"
          fontFamily="ui-sans-serif"
          textAnchor="middle"
        >
          {d}
        </text>
      ))}
    </svg>
  );
}
