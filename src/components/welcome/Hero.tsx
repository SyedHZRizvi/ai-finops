import Link from 'next/link';

const TRUST_CHIPS = [
  'OpenAI',
  'Anthropic',
  'Gemini',
  'Perplexity',
  'Bedrock',
  'Vertex',
  'Azure',
  '8 frameworks',
] as const;

/**
 * Top-of-page hero for the /welcome marketing page. Massive gradient
 * headline, sub-copy, side-by-side CTAs, and a row of trust chips. The
 * floating gradient blobs are pure CSS — no animations beyond the
 * existing `drift` / `pulse-glow` keyframes from globals.css.
 */
export function Hero() {
  return (
    <section className="hero relative overflow-hidden px-6 py-16 md:px-12 md:py-24 lg:py-28">
      {/* Decorative drifting blobs — purely visual, hidden from a11y tree. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full opacity-40 blur-3xl drift"
        style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 w-[520px] h-[520px] rounded-full opacity-30 blur-3xl drift"
        style={{
          background: 'radial-gradient(circle, #22d3ee 0%, transparent 70%)',
          animationDelay: '-4s',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full opacity-20 blur-3xl pulse-glow"
        style={{ background: 'radial-gradient(circle, #ec4899 0%, transparent 70%)' }}
      />

      <div className="relative max-w-4xl mx-auto text-center">
        {/* Beta badge */}
        <div className="flex justify-center mb-6 fade-up">
          <Link
            href="/api-docs"
            className="chip chip-brand hover:scale-105 transition-transform inline-flex items-center"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-brand2 pulse-glow" aria-hidden />
            <span>v0.1 beta · OpenAPI explorer available</span>
            <span aria-hidden className="opacity-70">→</span>
          </Link>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] fade-up-delay-1">
          <span className="gradient-text">Cut AI costs by up to 60%.</span>
          <br />
          <span className="text-ink">Without changing your apps.</span>
        </h1>

        {/* Sub */}
        <p className="mt-8 text-lg md:text-xl text-inkDim max-w-2xl mx-auto leading-relaxed fade-up-delay-2">
          Track every LLM call. Classify every prompt. Get ranked, dollar-impact
          actions that lower your bill — across every provider, in one dashboard.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 fade-up-delay-3">
          <Link href="/" className="btn-primary text-base px-6 py-3">
            Open Dashboard <span aria-hidden>→</span>
          </Link>
          <Link href="/?demo=1" className="btn text-base px-6 py-3">
            See live demo
          </Link>
        </div>

        {/* Trust chips */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-2 fade-up-delay-4">
          <span className="text-xs text-muted mr-2 uppercase tracking-wider font-semibold">
            Works with
          </span>
          {TRUST_CHIPS.map((label, i) => (
            <span key={label} className="inline-flex items-center gap-2 text-xs text-inkDim">
              <span className="font-medium">{label}</span>
              {i < TRUST_CHIPS.length - 1 && (
                <span className="text-borderBright" aria-hidden>
                  ·
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
