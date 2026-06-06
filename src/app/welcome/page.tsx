import Link from 'next/link';
import type { Metadata } from 'next';
import { Hero } from '@/components/welcome/Hero';
import { FeatureBlock } from '@/components/welcome/FeatureBlock';
import { SvgMockDashboard } from '@/components/welcome/SvgMockDashboard';
import { SvgMockInsights } from '@/components/welcome/SvgMockInsights';
import { SvgMockOptimizer } from '@/components/welcome/SvgMockOptimizer';
import { SvgMockSlackAlert } from '@/components/welcome/SvgMockSlackAlert';
import { IntegrationGrid } from '@/components/welcome/IntegrationGrid';
import { pageMetadata } from '@/lib/metadata';

export const dynamic = 'force-static';

export const metadata: Metadata = pageMetadata({
  // `pageMetadata` automatically suffixes "· AI FinOps", so this stays short.
  title: 'Track LLM costs and reduce AI overspend',
  description:
    'Track every LLM call. Classify every prompt. Get ranked, dollar-impact actions that lower your bill — across OpenAI, Anthropic, Gemini, Bedrock, Vertex and more.',
  path: '/welcome',
});

/** Section B — three problem-statement cards. */
const PROBLEMS = [
  {
    title: 'Your AI bill keeps climbing.',
    body: 'You shipped one feature and traffic doubled. You shipped two more and the invoice doubled again. Nobody on the team can tell you why — only that the line goes up.',
    accent: 'bad',
    glow: 'rgba(239,68,68,0.12)',
  },
  {
    title: 'Nobody knows which prompts cost the most.',
    body: 'Provider dashboards show dollars per model, not dollars per prompt-type. "Reasoning" prompts on Opus are 40x the cost of "factual" lookups — but no tool tells you that, let alone which prompts could move down a tier.',
    accent: 'warn',
    glow: 'rgba(245,158,11,0.12)',
  },
  {
    title: 'Generic dashboards measure dollars, not WHY.',
    body: 'You can already chart your bill. What you can’t do is action it. AI FinOps gives you ranked, dollar-impact recommendations — caching, model routing, output caps — each with a projected $/mo savings.',
    accent: 'brand',
    glow: 'rgba(139,92,246,0.14)',
  },
] as const;

/** Section D — how-it-works three-step path. */
const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Connect your provider',
    body: 'Drop in an Anthropic or OpenAI admin key, or wrap your existing SDK calls with our 1-line `withLogging()` helper. Direct HTTP works too — anything that posts a JSON body to `/api/log`.',
    accent: '#8b5cf6',
  },
  {
    step: '2',
    title: 'Watch costs categorize themselves',
    body: 'Every call is auto-classified by category (factual, reasoning, code, creative, etc.) and complexity (simple → multidimensional) the moment it lands. Live and historical, with zero manual tagging.',
    accent: '#22d3ee',
  },
  {
    step: '3',
    title: 'Action the ranked recommendations',
    body: 'AI FinOps surfaces a sorted list of optimizations — each with confidence, estimated $/mo impact, and a direct path to apply in the optimizer.',
    accent: '#22c55e',
  },
] as const;

/** Section E — feature matrix two-column comparison. */
const FEATURE_MATRIX = [
  { feature: 'Cross-provider tracking (OpenAI, Anthropic, Gemini, Bedrock, Vertex, Azure)', us: true, them: false },
  { feature: 'Per-prompt category and complexity classification', us: true, them: false },
  { feature: 'Ranked $/mo savings recommendations', us: true, them: false },
  { feature: 'One-click prompt optimizer with before/after diff', us: true, them: false },
  { feature: 'Real-time anomaly alerts to Slack', us: true, them: false },
  { feature: 'Weekly cost digests via email and Slack', us: true, them: false },
  { feature: 'End-of-month spend forecast with confidence bands', us: true, them: false },
  { feature: 'Self-hosted; zero vendor lock-in', us: true, them: false },
] as const;

/** Section F is rendered by <IntegrationGrid />. */

interface ProblemCardProps {
  title: string;
  body: string;
  accent: 'bad' | 'warn' | 'brand';
  glow: string;
  delay: string;
}

const PROBLEM_ICONS: Record<ProblemCardProps['accent'], string> = {
  bad: 'bg-bad/15 border-bad/40 text-bad',
  warn: 'bg-warn/15 border-warn/40 text-warn',
  brand: 'bg-brand/15 border-brand/40 text-brandLight',
};

const PROBLEM_ACCENT_BAR: Record<ProblemCardProps['accent'], string> = {
  bad: 'linear-gradient(90deg, transparent, #ef4444, transparent)',
  warn: 'linear-gradient(90deg, transparent, #f59e0b, transparent)',
  brand: 'linear-gradient(90deg, transparent, #8b5cf6, transparent)',
};

function ProblemCard({ title, body, accent, glow, delay }: ProblemCardProps) {
  return (
    <div
      className={`card card-pad card-grad relative overflow-hidden ${delay}`}
      style={{ backgroundImage: `radial-gradient(circle at 90% 10%, ${glow} 0%, transparent 60%)` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
        style={{ background: PROBLEM_ACCENT_BAR[accent] }}
        aria-hidden
      />
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${PROBLEM_ICONS[accent]}`}>
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path
            d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="font-semibold text-lg text-ink leading-snug">{title}</h3>
      <p className="text-sm text-muted mt-3 leading-relaxed">{body}</p>
    </div>
  );
}

interface HowStepProps {
  step: string;
  title: string;
  body: string;
  accent: string;
  delay: string;
}

function HowStep({ step, title, body, accent, delay }: HowStepProps) {
  return (
    <div
      className={`card card-pad relative overflow-hidden ${delay}`}
      style={{
        backgroundImage: `radial-gradient(circle at 0% 0%, ${accent}26 0%, transparent 50%)`,
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${accent}cc 50%, transparent 100%)`,
        }}
        aria-hidden
      />
      <div className="flex items-center gap-4 mb-4">
        <div
          className="w-12 h-12 rounded-2xl border flex items-center justify-center font-bold text-lg shrink-0"
          style={{
            backgroundColor: `${accent}1f`,
            borderColor: `${accent}66`,
            color: accent,
            boxShadow: `0 0 30px -10px ${accent}88`,
          }}
        >
          {step}
        </div>
        <h3 className="font-semibold text-lg text-ink leading-snug">{title}</h3>
      </div>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function SectionDivider() {
  return (
    <div className="divider-grad my-16 md:my-24" aria-hidden />
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'center',
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={`max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''} fade-up`}>
      <span className="chip chip-brand uppercase tracking-wider mb-4 inline-flex">
        {eyebrow}
      </span>
      <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight gradient-text">
        {title}
      </h2>
      {description && (
        <p className="mt-5 text-base md:text-lg text-inkDim leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

export default function WelcomePage() {
  // Rendered inside the global layout's <main class="max-w-7xl ... px-6 py-8">,
  // so we don't repeat the width / horizontal padding here — sections own
  // their own internal padding via the `.hero` class and standard cards.
  return (
    <div className="space-y-0">
      <div className="space-y-0">
        {/* A. Hero */}
        <Hero />

        <SectionDivider />

        {/* B. The problem */}
        <section className="space-y-10">
          <SectionHeader
            eyebrow="The problem"
            title="AI cost is a black box. We open it."
            description="Most engineering teams building with AI face the same three problems. Generic observability gives you charts; it doesn't give you actions."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PROBLEMS.map((p, i) => (
              <ProblemCard
                key={p.title}
                title={p.title}
                body={p.body}
                accent={p.accent}
                glow={p.glow}
                delay={i === 0 ? 'fade-up' : i === 1 ? 'fade-up-delay-1' : 'fade-up-delay-2'}
              />
            ))}
          </div>
        </section>

        <SectionDivider />

        {/* C. The solution — four alternating feature blocks */}
        <section className="space-y-20 md:space-y-28">
          <div className="text-center">
            <SectionHeader
              eyebrow="What you get"
              title="Visibility, classification, optimization, and alerts."
              description="Four surfaces, one source of truth. Each one ships with seed data so you can evaluate without wiring up production."
            />
          </div>

          <FeatureBlock
            eyebrow="Track"
            eyebrowColor="brand"
            title="Track every token, automatically."
            description="One SDK wraps your existing OpenAI, Anthropic, Gemini, Bedrock, or Vertex calls and logs cost, tokens, latency, and category — without you changing your prompt code. Or post directly to the ingest endpoint from anywhere."
            bullets={[
              '4 live stat cards on the dashboard: calls, tokens, cost, p95 latency',
              'Stacked cost-over-time chart with input/output breakdown',
              'End-of-month forecast with confidence bands',
            ]}
            cta={{ label: 'See the dashboard', href: '/' }}
            visual={<SvgMockDashboard />}
          />

          <FeatureBlock
            eyebrow="Diagnose"
            eyebrowColor="good"
            title="Why your bill is what it is."
            description="The Insights page reads your traffic and emits a ranked list of cost-saving actions — each with confidence, projected $/mo impact, and a one-click path to fix. No more guessing whether to cache, downgrade, or restructure."
            bullets={[
              'Caching, model-routing, output-cap, and compression recommendations',
              'Ranked by estimated dollar impact, not just frequency',
              'Per-app and per-model hotspots so you know where to look first',
            ]}
            cta={{ label: 'See insights', href: '/insights' }}
            visual={<SvgMockInsights />}
            reverse
          />

          <FeatureBlock
            eyebrow="Optimize"
            eyebrowColor="teal"
            title="Optimize prompts in seconds."
            description="Paste any prompt into the Optimizer; AI FinOps emits a rewritten version with the same intent in fewer tokens, plus a confidence-ranked list of suggestions and projected savings per call. Works on prompts you ship and prompts you haven't shipped yet."
            bullets={[
              'Before/after diff with token deltas highlighted',
              'Category, complexity score, and detected dimensions surfaced',
              'Side-by-side compare lets you A/B prompts against any model',
            ]}
            cta={{ label: 'Open optimizer', href: '/optimizer' }}
            visual={<SvgMockOptimizer />}
          />

          <FeatureBlock
            eyebrow="Alert"
            eyebrowColor="warn"
            title="Real-time alerts to Slack."
            description="The anomaly engine watches your traffic and pings ops-alerts the moment cost or latency walks off baseline. Each alert includes likely cause, affected app/model, and a one-click jump back to the dashboard so on-call can act in seconds."
            bullets={[
              'Configurable cost spike detection with rolling 7-day windows',
              'Inline Slack action buttons: snooze, mark resolved, open dashboard',
              'Weekly digest email summarizes what changed since last Monday',
            ]}
            cta={{ label: 'View alerts', href: '/anomaly' }}
            visual={<SvgMockSlackAlert />}
            reverse
          />
        </section>

        <SectionDivider />

        {/* D. How it works */}
        <section className="space-y-10">
          <SectionHeader
            eyebrow="How it works"
            title="Three steps to a smaller bill."
            description="No re-platforming, no proxy in front of your traffic, no agent on your boxes. The SDK is fire-and-forget; if our endpoint is down your LLM call keeps working."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {HOW_IT_WORKS.map((s, i) => (
              <HowStep
                key={s.step}
                step={s.step}
                title={s.title}
                body={s.body}
                accent={s.accent}
                delay={i === 0 ? 'fade-up' : i === 1 ? 'fade-up-delay-1' : 'fade-up-delay-2'}
              />
            ))}
          </div>
          <div className="text-center pt-6">
            <Link href="/setup" className="btn-primary">
              Run setup wizard <span aria-hidden>→</span>
            </Link>
          </div>
        </section>

        <SectionDivider />

        {/* E. Feature matrix */}
        <section className="space-y-10">
          <SectionHeader
            eyebrow="Compare"
            title="What you replace when you adopt AI FinOps."
            description="Most teams cobble together a Google Sheet, a Looker dashboard, and a Slack search to answer the question 'what is the most expensive prompt we shipped this week'. Here's the swap."
          />
          <div className="card card-pad max-w-4xl mx-auto fade-up-delay-1">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th className="text-center w-32">AI FinOps</th>
                  <th className="text-center w-40">Spreadsheet tracking</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((f) => (
                  <tr key={f.feature}>
                    <td className="text-inkDim">{f.feature}</td>
                    <td className="text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-good/15 border border-good/40 text-good" aria-label="included">
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                          <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-bad/10 border border-bad/30 text-bad opacity-80" aria-label="not included">
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                          <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
                          <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                        </svg>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <SectionDivider />

        {/* F. Integration grid */}
        <section className="space-y-10">
          <SectionHeader
            eyebrow="Integrations"
            title="Every provider, every framework."
            description="If it can be wrapped, posted to, or driven by an admin key, we ingest it. No exporter to maintain, no proxy to deploy."
          />
          <IntegrationGrid />
        </section>

        <SectionDivider />

        {/* G. Final CTA */}
        <section className="fade-up">
          <div className="hero text-center px-6 py-16 md:px-12 md:py-20">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
              <span className="gradient-text">Stop paying for AI you don’t need.</span>
            </h2>
            <p className="mt-6 text-base md:text-lg text-inkDim max-w-2xl mx-auto leading-relaxed">
              The dashboard ships with seed data — open it now and click around.
              Wire the SDK whenever you’re ready; until then, demo mode is fully
              interactive.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/" className="btn-primary text-base px-6 py-3">
                Open Dashboard <span aria-hidden>→</span>
              </Link>
              <Link href="/setup" className="btn text-base px-6 py-3">
                Run setup wizard
              </Link>
            </div>
            <div className="mt-8 text-xs text-muted">
              No credit card required · Self-hosted · MIT-licensed
            </div>
          </div>
        </section>

        {/* H. Footer (page-local mini footer; the global layout also renders one) */}
        <footer className="mt-20 pt-10 border-t border-border/60 fade-up">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative w-8 h-8 rounded-xl bg-brand-gradient shadow-glow flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden
                >
                  <path
                    d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <div className="font-bold tracking-tight">AI FinOps</div>
                <div className="text-xs text-muted">
                  v0.1 beta · Track. Categorize. Optimize.
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <a
                href="https://github.com/SyedHZRizvi/ai-finops"
                target="_blank"
                rel="noreferrer noopener"
                className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
              >
                GitHub <span aria-hidden>↗</span>
              </a>
              <Link
                href="/setup"
                className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
              >
                Integration guide
              </Link>
              <Link
                href="/api-docs"
                className="text-muted hover:text-ink hover:underline underline-offset-4 transition-colors"
              >
                API docs
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
