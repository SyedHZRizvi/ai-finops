/**
 * Inline SVG mockup of the prompt optimizer — a side-by-side before /
 * after view with a savings chip, plus categorized analysis tags. The
 * visual approximates the real OptimizerForm component at `/optimizer`.
 */
export function SvgMockOptimizer() {
  return (
    <svg
      viewBox="0 0 600 380"
      role="img"
      aria-label="Mock of the prompt optimizer showing a before-and-after comparison and the projected token savings"
      className="w-full h-auto rounded-2xl border border-borderBright shadow-card"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="optBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#181a26" />
          <stop offset="100%" stopColor="#0f1018" />
        </linearGradient>
        <linearGradient id="optGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.10" />
        </linearGradient>
        <linearGradient id="afterAccent" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>

      <rect width="600" height="380" fill="url(#optBg)" />
      <rect width="600" height="380" fill="url(#optGlow)" />

      {/* Header */}
      <text x="20" y="32" fill="#c9cbd6" fontSize="12" fontFamily="ui-sans-serif" fontWeight="700">
        Prompt optimizer
      </text>
      <text x="20" y="48" fill="#7b829a" fontSize="9" fontFamily="ui-sans-serif">
        Paste any prompt — get a leaner rewrite with projected token savings.
      </text>

      {/* Analysis chips row */}
      <g transform="translate(20, 60)">
        <rect width="74" height="20" rx="10" fill="#3b82f6" opacity="0.15" stroke="#3b82f6" strokeOpacity="0.4" />
        <circle cx="11" cy="10" r="3" fill="#3b82f6" />
        <text x="20" y="13" fill="#3b82f6" fontSize="9" fontFamily="ui-sans-serif" fontWeight="600">reasoning</text>

        <rect x="82" width="64" height="20" rx="10" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeOpacity="0.4" />
        <circle cx="93" cy="10" r="3" fill="#f59e0b" />
        <text x="102" y="13" fill="#f59e0b" fontSize="9" fontFamily="ui-sans-serif" fontWeight="600">complex</text>

        <rect x="154" width="62" height="20" rx="10" fill="#a78bfa" opacity="0.15" stroke="#a78bfa" strokeOpacity="0.4" />
        <text x="185" y="13" fill="#a78bfa" fontSize="9" fontFamily="ui-sans-serif" fontWeight="600" textAnchor="middle">score 72</text>

        <rect x="224" width="78" height="20" rx="10" fill="#14b8a6" opacity="0.15" stroke="#14b8a6" strokeOpacity="0.4" />
        <text x="263" y="13" fill="#14b8a6" fontSize="9" fontFamily="ui-sans-serif" fontWeight="600" textAnchor="middle">4 dimensions</text>
      </g>

      {/* BEFORE card */}
      <g transform="translate(20, 96)">
        <rect width="275" height="194" rx={12} fill="#181a26" stroke="#262a3a" />
        <rect width="275" height="2" fill="#7b829a" opacity="0.4" />
        <text x="14" y="22" fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif" fontWeight="600" letterSpacing="0.1em">
          BEFORE
        </text>
        <text x="244" y="22" fill="#7b829a" fontSize="9" fontFamily="ui-sans-serif" textAnchor="end">412 tok</text>

        {/* Prompt body — fake text lines */}
        {[
          { y: 44, w: 240 },
          { y: 58, w: 220 },
          { y: 72, w: 246 },
          { y: 86, w: 200 },
          { y: 100, w: 210 },
          { y: 114, w: 178 },
          { y: 128, w: 240 },
          { y: 142, w: 192 },
          { y: 156, w: 220 },
          { y: 170, w: 130 },
        ].map((line) => (
          <rect
            key={line.y}
            x="14"
            y={line.y}
            width={line.w}
            height={6}
            rx={2}
            fill="#363b50"
            opacity="0.7"
          />
        ))}
      </g>

      {/* Arrow between cards */}
      <g transform="translate(296, 187)">
        <circle r="14" fill="#181a26" stroke="#8b5cf6" strokeOpacity="0.5" />
        <path d="M -6 0 L 6 0 M 2 -4 L 6 0 L 2 4" stroke="#a78bfa" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* AFTER card */}
      <g transform="translate(312, 96)">
        <rect width="268" height="194" rx={12} fill="#181a26" stroke="#22c55e" strokeOpacity="0.5" />
        <rect width="268" height="2" fill="url(#afterAccent)" />
        <text x="14" y="22" fill="#22c55e" fontSize="8" fontFamily="ui-sans-serif" fontWeight="700" letterSpacing="0.1em">
          AFTER
        </text>
        <text x="238" y="22" fill="#22c55e" fontSize="9" fontFamily="ui-sans-serif" textAnchor="end" fontWeight="600">241 tok</text>

        {/* Lean prompt — fewer, shorter lines */}
        {[
          { y: 44, w: 230 },
          { y: 58, w: 200 },
          { y: 72, w: 220 },
          { y: 86, w: 180 },
          { y: 100, w: 196 },
          { y: 114, w: 158 },
          { y: 128, w: 110 },
        ].map((line) => (
          <rect
            key={line.y}
            x="14"
            y={line.y}
            width={line.w}
            height={6}
            rx={2}
            fill="#22c55e"
            opacity="0.55"
          />
        ))}

        {/* Suggestion list inside the after card */}
        <line x1="14" y1="148" x2="254" y2="148" stroke="#262a3a" />
        <text x="14" y="162" fill="#7b829a" fontSize="7" fontFamily="ui-sans-serif" fontWeight="600" letterSpacing="0.08em">
          APPLIED OPTIMIZATIONS
        </text>
        <g transform="translate(14, 170)">
          <circle cx="3" cy="3" r="2" fill="#22c55e" />
          <text x="10" y="6" fill="#c9cbd6" fontSize="8" fontFamily="ui-sans-serif">trimmed boilerplate (-104 tok)</text>
        </g>
        <g transform="translate(14, 182)">
          <circle cx="3" cy="3" r="2" fill="#22c55e" />
          <text x="10" y="6" fill="#c9cbd6" fontSize="8" fontFamily="ui-sans-serif">compressed examples (-67 tok)</text>
        </g>
      </g>

      {/* Big savings chip at the bottom */}
      <g transform="translate(20, 306)">
        <rect width="560" height="56" rx={14} fill="#22c55e" opacity="0.12" stroke="#22c55e" strokeOpacity="0.5" />
        <text x="20" y="22" fill="#22c55e" fontSize="8" fontFamily="ui-sans-serif" fontWeight="700" letterSpacing="0.1em">
          PROJECTED SAVINGS
        </text>
        <text x="20" y="46" fill="#22c55e" fontSize="22" fontFamily="ui-sans-serif" fontWeight="700">
          $0.0042 / call
        </text>
        <text x="180" y="46" fill="#c9cbd6" fontSize="10" fontFamily="ui-sans-serif">
          ≈ $126 / mo at current volume
        </text>

        {/* Apply button */}
        <rect x="448" y="14" width="100" height="28" rx="10" fill="#8b5cf6" />
        <text x="498" y="32" fill="#fff" fontSize="10" fontFamily="ui-sans-serif" fontWeight="700" textAnchor="middle">
          Apply rewrite
        </text>
      </g>
    </svg>
  );
}
