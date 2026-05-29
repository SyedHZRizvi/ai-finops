/**
 * Inline SVG mockup of the insights / recommendations page. Renders a
 * ranked list of cost-saving recommendations each with an estimated
 * dollar savings, a confidence chip, and an action button — matching
 * the live RecommendationsList component at `/insights`.
 */
export function SvgMockInsights() {
  return (
    <svg
      viewBox="0 0 600 380"
      role="img"
      aria-label="Mock of the AI FinOps insights page showing a ranked list of cost-saving recommendations"
      className="w-full h-auto rounded-2xl border border-borderBright shadow-card"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="insBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#181a26" />
          <stop offset="100%" stopColor="#0f1018" />
        </linearGradient>
        <linearGradient id="insGlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="insHeaderAccent" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>

      <rect width="600" height="380" fill="url(#insBg)" />
      <rect width="600" height="120" fill="url(#insGlow)" />

      {/* Header card — potential savings highlight */}
      <rect x="20" y="20" width="560" height="68" rx={12} fill="#181a26" stroke="#22c55e" strokeOpacity="0.35" />
      <rect x="20" y="20" width="560" height="2" fill="url(#insHeaderAccent)" />

      <text x="34" y="42" fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif" fontWeight="600" letterSpacing="0.08em">
        POTENTIAL SAVINGS · 7D
      </text>
      <text x="34" y="74" fill="#22c55e" fontSize="28" fontFamily="ui-sans-serif" fontWeight="700">
        $487.20
      </text>
      <text x="180" y="74" fill="#7b829a" fontSize="11" fontFamily="ui-sans-serif">
        / mo if all actions applied
      </text>

      {/* Savings chip pill */}
      <g transform="translate(440, 38)">
        <rect width="120" height="36" rx={18} fill="#22c55e" opacity="0.12" stroke="#22c55e" strokeOpacity="0.5" />
        <polygon points="12,14 18,8 18,12 26,12 26,16 18,16 18,20" fill="#22c55e" />
        <text x="36" y="22" fill="#22c55e" fontSize="11" fontFamily="ui-sans-serif" fontWeight="700">
          38% reduction
        </text>
      </g>

      {/* Section title */}
      <text x="20" y="112" fill="#c9cbd6" fontSize="11" fontFamily="ui-sans-serif" fontWeight="700">
        Ranked recommendations
      </text>
      <text x="180" y="112" fill="#7b829a" fontSize="9" fontFamily="ui-sans-serif">
        by estimated $/mo impact
      </text>

      {/* Recommendation rows */}
      {[
        {
          y: 124,
          rank: '1',
          title: 'Cache repeated system prompts on /chat',
          tag: 'caching',
          tagColor: '#8b5cf6',
          confidence: 'high',
          confColor: '#22c55e',
          savings: '$214.80',
        },
        {
          y: 184,
          rank: '2',
          title: 'Route simple factual queries to gpt-4o-mini',
          tag: 'model swap',
          tagColor: '#3b82f6',
          confidence: 'high',
          confColor: '#22c55e',
          savings: '$142.40',
        },
        {
          y: 244,
          rank: '3',
          title: 'Cap output to 800 tokens for summarization',
          tag: 'output cap',
          tagColor: '#f59e0b',
          confidence: 'med',
          confColor: '#f59e0b',
          savings: '$78.30',
        },
        {
          y: 304,
          rank: '4',
          title: 'Compress prompt scaffolding (12% reduction)',
          tag: 'compression',
          tagColor: '#14b8a6',
          confidence: 'med',
          confColor: '#f59e0b',
          savings: '$51.70',
        },
      ].map((r) => (
        <g key={r.rank}>
          <rect x="20" y={r.y} width="560" height="50" rx={10} fill="#181a26" stroke="#262a3a" />
          {/* Rank badge */}
          <circle cx="42" cy={r.y + 25} r="13" fill="#8b5cf6" opacity="0.18" stroke="#8b5cf6" strokeOpacity="0.5" />
          <text
            x="42"
            y={r.y + 29}
            fill="#a78bfa"
            fontSize="11"
            fontFamily="ui-sans-serif"
            fontWeight="700"
            textAnchor="middle"
          >
            {r.rank}
          </text>
          {/* Title */}
          <text x="68" y={r.y + 22} fill="#f3f4f8" fontSize="11" fontFamily="ui-sans-serif" fontWeight="600">
            {r.title}
          </text>
          {/* Tag chips */}
          <g transform={`translate(68, ${r.y + 30})`}>
            <rect width="60" height="14" rx={7} fill={r.tagColor} opacity="0.15" stroke={r.tagColor} strokeOpacity="0.4" />
            <text x="30" y="10" fill={r.tagColor} fontSize="7" fontFamily="ui-sans-serif" fontWeight="600" textAnchor="middle">
              {r.tag}
            </text>
            <rect x="66" y="0" width="50" height="14" rx={7} fill={r.confColor} opacity="0.15" stroke={r.confColor} strokeOpacity="0.4" />
            <text x="91" y="10" fill={r.confColor} fontSize="7" fontFamily="ui-sans-serif" fontWeight="600" textAnchor="middle">
              {r.confidence}
            </text>
          </g>
          {/* Savings */}
          <text
            x="490"
            y={r.y + 22}
            fill="#22c55e"
            fontSize="14"
            fontFamily="ui-sans-serif"
            fontWeight="700"
            textAnchor="start"
          >
            {r.savings}
          </text>
          <text
            x="490"
            y={r.y + 38}
            fill="#7b829a"
            fontSize="8"
            fontFamily="ui-sans-serif"
          >
            est. / month
          </text>
          {/* Action arrow */}
          <g transform={`translate(556, ${r.y + 21})`}>
            <circle cx="0" cy="4" r="8" fill="#262a3a" stroke="#363b50" />
            <path d="M -3 4 L 3 4 M 0 1 L 3 4 L 0 7" stroke="#c9cbd6" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
      ))}
    </svg>
  );
}
