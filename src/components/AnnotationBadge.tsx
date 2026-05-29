'use client';

import type { AnnotationStatus } from '@/lib/annotations';

// Color mapping for annotation statuses. Reuses the existing chip
// variants in globals.css so the badge feels native alongside the
// category/complexity chips already on the /prompts page.
//
//   open          → muted (no decision yet — blends into the row)
//   investigating → blue (active workflow, attention but not done)
//   optimized     → good (green — work complete, positive outcome)
//   wont-fix      → warn (amber — intentional, decided not to act)
const STATUS_CHIP: Record<AnnotationStatus, string> = {
  open: '',
  investigating: 'chip-blue',
  optimized: 'chip-good',
  'wont-fix': 'chip-warn',
};

const STATUS_LABEL: Record<AnnotationStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  optimized: 'Optimized',
  'wont-fix': "Won't fix",
};

export function AnnotationBadge({
  status,
  note,
  className,
}: {
  status: AnnotationStatus;
  note?: string | null;
  className?: string;
}) {
  const variant = STATUS_CHIP[status];
  const label = STATUS_LABEL[status];
  // The browser's native `title` tooltip is the lightest-weight way to
  // surface the note on hover — no portal, no z-index wars, accessible
  // by default. If we ever need richer styling we can swap in a custom
  // tooltip; this is the right starting point.
  const tooltip = note ? `${label} — ${note}` : label;
  return (
    <span
      className={`chip ${variant} ${className ?? ''}`.trim()}
      title={tooltip}
      data-annotation-status={status}
    >
      {label}
    </span>
  );
}
