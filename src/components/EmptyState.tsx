import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  variant?: 'brand' | 'good' | 'warn';
  children?: ReactNode;
}

const VARIANT_GRADIENT: Record<NonNullable<EmptyStateProps['variant']>, string> = {
  brand: 'bg-brand-gradient shadow-glow',
  good: 'bg-good-gradient shadow-glow-green',
  warn: 'bg-warn-gradient shadow-glow-amber',
};

function DefaultSparkle() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-8 h-8 text-white"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        d="M12 3l2.39 6.13L20 11l-5.61 1.87L12 19l-2.39-6.13L4 11l5.61-1.87L12 3z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
  actions,
  variant = 'brand',
  children,
}: EmptyStateProps) {
  return (
    <div className="card card-pad text-center py-16 px-6 fade-up">
      <div className="flex flex-col items-center max-w-xl mx-auto">
        <div
          className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-5 ${VARIANT_GRADIENT[variant]} pulse-glow`}
        >
          {icon ?? <DefaultSparkle />}
        </div>
        <h2 className="text-2xl font-bold tracking-tight gradient-text">{title}</h2>
        {subtitle && (
          <p className="text-sm text-inkDim mt-3 leading-relaxed max-w-md">{subtitle}</p>
        )}
        {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
        {children && <div className="mt-8 w-full">{children}</div>}
      </div>
    </div>
  );
}
