import type { TrendDirection } from '@/lib/trends';

interface TrendChipProps {
  direction: TrendDirection;
  size?: 'sm' | 'md';
}

interface ChipDef {
  glyph: string;
  label: string;
  className: string;
}

// Colors follow the brief:
//   up-fast    → red ("burning")
//   up         → amber
//   flat       → neutral
//   down       → green
//   down-fast  → green emphasized with a ring
const CHIPS: Record<TrendDirection, ChipDef> = {
  'up-fast': {
    glyph: '↑↑',
    label: 'up fast',
    className: 'bg-bad/15 text-bad border border-bad/30',
  },
  up: {
    glyph: '↑',
    label: 'up',
    className: 'bg-warn/15 text-warn border border-warn/30',
  },
  flat: {
    glyph: '→',
    label: 'flat',
    className: 'bg-panel2 text-muted border border-border',
  },
  down: {
    glyph: '↓',
    label: 'down',
    className: 'bg-good/15 text-good border border-good/30',
  },
  'down-fast': {
    glyph: '↓↓',
    label: 'down fast',
    className: 'bg-good/15 text-good border border-good/30 ring-1 ring-good/40',
  },
};

export function TrendChip({ direction, size = 'sm' }: TrendChipProps) {
  const chip = CHIPS[direction];
  const sizing =
    size === 'md'
      ? 'text-xs px-2.5 py-1 gap-1.5'
      : 'text-[11px] px-2 py-0.5 gap-1';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium tabular-nums ${sizing} ${chip.className}`}
      title={`Cost trend: ${chip.label}`}
      aria-label={`Cost trend ${chip.label}`}
    >
      <span aria-hidden className="font-bold leading-none">
        {chip.glyph}
      </span>
      <span className="capitalize">{chip.label}</span>
    </span>
  );
}
