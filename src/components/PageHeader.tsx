import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  /** Optional sub-explainer rendered under the title in muted text. */
  subtitle?: string;
  /** Optional right-aligned action slot (buttons, selects, etc.). */
  actions?: ReactNode;
  /** When true, uses the brand gradient text effect on the title. */
  gradient?: boolean;
  /** Extra classes appended to the outer wrapper. */
  className?: string;
}

/**
 * Standard page header used at the top of every primary route. This
 * formalizes the pattern already in use across the existing pages —
 * `text-2xl font-bold tracking-tight` heading with a muted subtitle
 * and an optional right-hand actions cluster.
 *
 * New pages should adopt this. Existing pages can migrate incrementally;
 * the markup is intentionally identical to what they already render.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  gradient = false,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`flex flex-col md:flex-row md:items-start md:justify-between gap-4 fade-up ${className}`}>
      <div className="min-w-0">
        <h1
          className={`text-2xl font-bold tracking-tight ${gradient ? 'gradient-text' : ''}`}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted mt-1 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 md:justify-end shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
