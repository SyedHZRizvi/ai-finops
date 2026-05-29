/**
 * Inline SVG mockup of a Slack alert message — a realistic-looking
 * channel post from the AI FinOps bot announcing a cost anomaly with
 * inline action buttons. Used on the landing page to illustrate the
 * real-time alerting capability.
 */
export function SvgMockSlackAlert() {
  return (
    <svg
      viewBox="0 0 600 380"
      role="img"
      aria-label="Mock of a Slack message from the AI FinOps bot warning about a sudden cost spike, with action buttons"
      className="w-full h-auto rounded-2xl border border-borderBright shadow-card"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="slackBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a1d29" />
          <stop offset="100%" stopColor="#121420" />
        </linearGradient>
        <linearGradient id="slackBrand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id="anomalyAccent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#f43f5e" />
        </linearGradient>
      </defs>

      <rect width="600" height="380" fill="url(#slackBg)" />

      {/* Slack-like channel header */}
      <rect x="20" y="18" width="560" height="34" rx={10} fill="#181a26" stroke="#262a3a" />
      <text x="34" y="32" fill="#c9cbd6" fontSize="10" fontFamily="ui-sans-serif" fontWeight="700">
        # ops-alerts
      </text>
      <text x="34" y="44" fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif">
        12 members · Production cost & anomaly alerts
      </text>
      <g transform="translate(522, 26)">
        <circle r="3" cx="0" cy="0" fill="#22c55e" />
        <text x="8" y="3" fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif">live</text>
      </g>

      {/* Message: timestamp divider */}
      <line x1="36" y1="80" x2="564" y2="80" stroke="#262a3a" />
      <rect x="270" y="72" width="60" height="16" rx="8" fill="#181a26" stroke="#262a3a" />
      <text x="300" y="83" fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif" textAnchor="middle">today</text>

      {/* Bot message body */}
      {/* Avatar */}
      <rect x="36" y="100" width="34" height="34" rx={8} fill="url(#slackBrand)" />
      <path
        d="M 46 113 L 41 122 H 48 L 47 130 L 56 119 H 49 L 50 113 Z"
        fill="white"
        opacity="0.95"
      />

      {/* Author + bot tag + timestamp */}
      <text x="80" y="114" fill="#f3f4f8" fontSize="11" fontFamily="ui-sans-serif" fontWeight="700">
        AI FinOps
      </text>
      <rect x="146" y="104" width="28" height="12" rx={3} fill="#262a3a" />
      <text x="160" y="112" fill="#c9cbd6" fontSize="7" fontFamily="ui-sans-serif" fontWeight="600" textAnchor="middle">APP</text>
      <text x="180" y="114" fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif">10:42 AM</text>

      {/* Title line */}
      <text x="80" y="132" fill="#f3f4f8" fontSize="12" fontFamily="ui-sans-serif" fontWeight="600">
        Cost anomaly detected on production
      </text>

      {/* Block kit-style attachment */}
      <rect x="80" y="142" width="488" height="160" rx={6} fill="#181a26" />
      <rect x="80" y="142" width="4" height="160" rx={2} fill="url(#anomalyAccent)" />

      {/* Inside the attachment */}
      <text x="100" y="160" fill="#f59e0b" fontSize="9" fontFamily="ui-sans-serif" fontWeight="700" letterSpacing="0.08em">
        SPIKE · 3.4x ABOVE BASELINE
      </text>
      <text x="100" y="180" fill="#f3f4f8" fontSize="14" fontFamily="ui-sans-serif" fontWeight="700">
        $42.18 spent in the last 30 minutes
      </text>
      <text x="100" y="196" fill="#7b829a" fontSize="9" fontFamily="ui-sans-serif">
        Baseline for this window: $12.40 (7-day rolling avg)
      </text>

      {/* Fields */}
      <g transform="translate(100, 212)">
        <text fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif" fontWeight="700" letterSpacing="0.08em">APP</text>
        <text y="14" fill="#c9cbd6" fontSize="10" fontFamily="ui-sans-serif" fontWeight="600">acme-chatbot</text>
      </g>
      <g transform="translate(220, 212)">
        <text fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif" fontWeight="700" letterSpacing="0.08em">MODEL</text>
        <text y="14" fill="#c9cbd6" fontSize="10" fontFamily="ui-sans-serif" fontWeight="600" fontStyle="italic">claude-opus-4</text>
      </g>
      <g transform="translate(340, 212)">
        <text fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif" fontWeight="700" letterSpacing="0.08em">CATEGORY</text>
        <text y="14" fill="#c9cbd6" fontSize="10" fontFamily="ui-sans-serif" fontWeight="600">reasoning</text>
      </g>
      <g transform="translate(460, 212)">
        <text fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif" fontWeight="700" letterSpacing="0.08em">CALLS</text>
        <text y="14" fill="#c9cbd6" fontSize="10" fontFamily="ui-sans-serif" fontWeight="600">142 in 30m</text>
      </g>

      {/* Likely cause */}
      <text x="100" y="252" fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif" fontWeight="700" letterSpacing="0.08em">
        LIKELY CAUSE
      </text>
      <text x="100" y="266" fill="#c9cbd6" fontSize="9" fontFamily="ui-sans-serif">
        Customer-support deploy at 10:14 increased token volume by 312%.
      </text>

      {/* Action buttons */}
      <g transform="translate(100, 274)">
        <rect width="100" height="22" rx={4} fill="#22c55e" />
        <text x="50" y="15" fill="#fff" fontSize="9" fontFamily="ui-sans-serif" fontWeight="700" textAnchor="middle">
          View dashboard
        </text>

        <rect x="108" width="80" height="22" rx={4} fill="#262a3a" stroke="#363b50" />
        <text x="148" y="15" fill="#c9cbd6" fontSize="9" fontFamily="ui-sans-serif" fontWeight="600" textAnchor="middle">
          Snooze 1h
        </text>

        <rect x="196" width="100" height="22" rx={4} fill="#262a3a" stroke="#363b50" />
        <text x="246" y="15" fill="#c9cbd6" fontSize="9" fontFamily="ui-sans-serif" fontWeight="600" textAnchor="middle">
          Mark resolved
        </text>
      </g>

      {/* Reactions */}
      <g transform="translate(80, 322)">
        <rect width="56" height="22" rx={11} fill="#181a26" stroke="#363b50" />
        <text x="14" y="15" fill="#f59e0b" fontSize="11" fontFamily="ui-sans-serif" textAnchor="middle">!</text>
        <text x="34" y="15" fill="#c9cbd6" fontSize="9" fontFamily="ui-sans-serif" textAnchor="middle">3</text>

        <rect x="64" width="56" height="22" rx={11} fill="#181a26" stroke="#363b50" />
        <text x="78" y="15" fill="#3b82f6" fontSize="11" fontFamily="ui-sans-serif" textAnchor="middle">i</text>
        <text x="98" y="15" fill="#c9cbd6" fontSize="9" fontFamily="ui-sans-serif" textAnchor="middle">1</text>

        <text x="132" y="15" fill="#7b829a" fontSize="9" fontFamily="ui-sans-serif">
          2 thread replies · last 1m ago
        </text>
      </g>

      {/* Input bar mock */}
      <rect x="20" y="354" width="560" height="18" rx={6} fill="#181a26" stroke="#262a3a" />
      <text x="34" y="366" fill="#7b829a" fontSize="8" fontFamily="ui-sans-serif">
        Message #ops-alerts
      </text>
    </svg>
  );
}
