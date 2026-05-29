import Link from 'next/link';
import type { RoadmapCategory, RoadmapItem, RoadmapStatus } from '@/lib/roadmap';

// Status → chip class. Matches the spec:
//   shipped       → chip-good
//   in-progress   → chip-blue
//   planned       → chip-amber
//   considering   → bare .chip (no variant)
const STATUS_CHIP: Record<RoadmapStatus, string> = {
  shipped: 'chip-good',
  'in-progress': 'chip-blue',
  planned: 'chip-amber',
  considering: '',
};

const STATUS_LABEL: Record<RoadmapStatus, string> = {
  shipped: 'Shipped',
  'in-progress': 'In progress',
  planned: 'Planned',
  considering: 'Considering',
};

// Categories are visually de-emphasized relative to status — they help
// readers scan but shouldn't compete with the status color. Each gets a
// distinct accent so the legend still works at a glance.
const CATEGORY_CHIP: Record<RoadmapCategory, string> = {
  platform: 'chip-indigo',
  analytics: 'chip-teal',
  integrations: 'chip-lime',
  governance: 'chip-rose',
  experience: 'chip-pink',
};

const CATEGORY_LABEL: Record<RoadmapCategory, string> = {
  platform: 'Platform',
  analytics: 'Analytics',
  integrations: 'Integrations',
  governance: 'Governance',
  experience: 'Experience',
};

export interface RoadmapItemCardProps {
  item: RoadmapItem;
}

export function RoadmapItemCard({ item }: RoadmapItemCardProps) {
  return (
    <article className="card card-pad space-y-3 h-full">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`chip ${STATUS_CHIP[item.status]}`}>
          {STATUS_LABEL[item.status]}
        </span>
        <span className={`chip ${CATEGORY_CHIP[item.category]}`}>
          {CATEGORY_LABEL[item.category]}
        </span>
        {item.status === 'shipped' && item.shippedIn && (
          <Link
            href={`/changelog#v${item.shippedIn}`}
            className="chip hover:border-brand/40 hover:text-brandLight transition-colors font-mono tabular-nums"
            title={`Shipped in v${item.shippedIn}`}
          >
            v{item.shippedIn}
          </Link>
        )}
        {item.status !== 'shipped' && item.eta && (
          <span className="chip text-muted" title="Target window">
            {item.eta}
          </span>
        )}
      </div>
      <h3 className="font-semibold tracking-tight text-base leading-snug">
        {item.title}
      </h3>
      <p className="text-sm text-inkDim leading-relaxed">{item.description}</p>
    </article>
  );
}
