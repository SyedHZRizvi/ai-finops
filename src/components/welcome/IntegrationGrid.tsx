/**
 * Marketing-page integration grid — chips for every provider/SDK we
 * currently observe traffic from. Intentionally no real logos: a small
 * brand-tinted dot + the provider name keeps this dependency-free and
 * trademark-safe.
 */
interface Integration {
  name: string;
  group: 'Model providers' | 'Cloud LLM platforms' | 'Frameworks & tools';
  /** Brand-ish accent color used for the chip's dot + soft ring. */
  accent: string;
  /** One-line caption shown under the name in the chip. */
  tagline: string;
}

const INTEGRATIONS: Integration[] = [
  // Model providers
  { name: 'Anthropic Claude', group: 'Model providers', accent: '#d97706', tagline: 'Sonnet · Opus · Haiku' },
  { name: 'OpenAI GPT', group: 'Model providers', accent: '#10a37f', tagline: 'gpt-4o · o1 · gpt-4o-mini' },
  { name: 'Google Gemini', group: 'Model providers', accent: '#4285f4', tagline: '1.5 Pro · 2.0 Flash' },
  { name: 'Perplexity', group: 'Model providers', accent: '#20808d', tagline: 'Sonar · Online search' },

  // Cloud LLM platforms
  { name: 'AWS Bedrock', group: 'Cloud LLM platforms', accent: '#ff9900', tagline: 'All foundation models' },
  { name: 'Azure OpenAI', group: 'Cloud LLM platforms', accent: '#0078d4', tagline: 'GPT family on Azure' },
  { name: 'Google Vertex AI', group: 'Cloud LLM platforms', accent: '#34a853', tagline: 'Gemini · PaLM · partners' },

  // Frameworks & tools
  { name: 'LangChain', group: 'Frameworks & tools', accent: '#1c3d2c', tagline: 'Python & JS callbacks' },
  { name: 'Vercel AI SDK', group: 'Frameworks & tools', accent: '#a78bfa', tagline: 'Streaming + tools' },
  { name: 'Cursor', group: 'Frameworks & tools', accent: '#6366f1', tagline: 'IDE prompt capture' },
  { name: 'Claude Desktop', group: 'Frameworks & tools', accent: '#8b5cf6', tagline: 'via local MCP server' },
];

const GROUPS = [
  'Model providers',
  'Cloud LLM platforms',
  'Frameworks & tools',
] as const;

interface IntegrationChipProps {
  item: Integration;
}

function IntegrationChip({ item }: IntegrationChipProps) {
  return (
    <div
      className="card card-pad card-grad relative overflow-hidden flex items-start gap-3 hover:-translate-y-0.5 transition-all duration-200"
      style={{
        backgroundImage: `radial-gradient(circle at 90% 10%, ${item.accent}22 0%, transparent 60%)`,
      }}
    >
      <div
        className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0"
        style={{
          backgroundColor: `${item.accent}1f`,
          borderColor: `${item.accent}66`,
        }}
        aria-hidden
      >
        <span
          className="block w-3 h-3 rounded-full"
          style={{ backgroundColor: item.accent, boxShadow: `0 0 12px ${item.accent}aa` }}
        />
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-sm text-ink truncate">{item.name}</div>
        <div className="text-xs text-muted mt-1 leading-snug">{item.tagline}</div>
      </div>
    </div>
  );
}

export function IntegrationGrid() {
  return (
    <div className="space-y-10">
      {GROUPS.map((group, idx) => {
        const items = INTEGRATIONS.filter((i) => i.group === group);
        const delay = idx === 0 ? 'fade-up' : idx === 1 ? 'fade-up-delay-1' : 'fade-up-delay-2';
        return (
          <div key={group} className={delay}>
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-sm font-semibold text-inkDim">{group}</h3>
              <div className="flex-1 divider-grad" />
              <span className="text-xs text-muted">{items.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {items.map((it) => (
                <IntegrationChip key={it.name} item={it} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
