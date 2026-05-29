import Link from 'next/link';
import type { ReactNode } from 'react';

export interface FeatureBlockProps {
  /** Tiny uppercase eyebrow above the heading — e.g. "TRACK". */
  eyebrow: string;
  /** Brand color used for the eyebrow chip and accent dot. */
  eyebrowColor?: 'brand' | 'good' | 'warn' | 'blue' | 'teal' | 'pink';
  /** H2-level feature title. */
  title: string;
  /** Long-form paragraph explaining the feature. */
  description: string;
  /** Three short bullet highlights rendered as a checked list. */
  bullets: string[];
  /** SVG mock or other visual rendered in the second column. */
  visual: ReactNode;
  /** Optional CTA link rendered under the bullets. */
  cta?: { label: string; href: string };
  /** When true, the visual is rendered on the LEFT (alternating layout). */
  reverse?: boolean;
}

const EYEBROW_CHIP: Record<NonNullable<FeatureBlockProps['eyebrowColor']>, string> = {
  brand: 'chip-brand',
  good: 'chip-good',
  warn: 'chip-warn',
  blue: 'chip-blue',
  teal: 'chip-teal',
  pink: 'chip-pink',
};

/**
 * Reusable feature block for the marketing page. Two columns on desktop
 * (text + visual), stacked on mobile, with the `reverse` prop letting
 * us alternate which side the visual lands on for visual rhythm.
 */
export function FeatureBlock({
  eyebrow,
  eyebrowColor = 'brand',
  title,
  description,
  bullets,
  visual,
  cta,
  reverse = false,
}: FeatureBlockProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
      {/* Text column */}
      <div
        className={`space-y-5 fade-up ${
          reverse ? 'md:order-2' : 'md:order-1'
        }`}
      >
        <span className={`chip ${EYEBROW_CHIP[eyebrowColor]} uppercase tracking-wider`}>
          {eyebrow}
        </span>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-ink">
          {title}
        </h2>
        <p className="text-base md:text-lg text-inkDim leading-relaxed">
          {description}
        </p>
        <ul className="space-y-2.5 pt-2">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-3 text-sm text-inkDim">
              <span
                className="mt-1 w-4 h-4 rounded-full bg-good/15 border border-good/40 text-good flex items-center justify-center shrink-0"
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-2.5 h-2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {cta && (
          <div className="pt-2">
            <Link href={cta.href} className="btn">
              {cta.label} <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </div>

      {/* Visual column */}
      <div
        className={`fade-up-delay-1 ${reverse ? 'md:order-1' : 'md:order-2'}`}
      >
        <div className="relative">
          {/* Glow halo behind the mock */}
          <div
            aria-hidden
            className="absolute inset-0 -m-6 rounded-3xl opacity-50 blur-3xl pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(139,92,246,0.2) 0%, transparent 70%)',
            }}
          />
          <div className="relative">{visual}</div>
        </div>
      </div>
    </div>
  );
}
