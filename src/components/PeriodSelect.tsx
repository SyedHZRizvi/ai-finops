'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

const PERIODS: { value: string; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
];

export function PeriodSelect({ defaultValue = '7d' }: { defaultValue?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.get('period') ?? defaultValue;

  function set(value: string) {
    const params = new URLSearchParams(sp.toString());
    params.set('period', value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="inline-flex items-center gap-1 rounded-xl bg-panel border border-border p-1 shadow-card">
        {PERIODS.map((p) => {
          const active = p.value === current;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => set(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                active
                  ? 'bg-brand-gradient text-white shadow-glow'
                  : 'text-muted hover:text-ink hover:bg-panel2'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {/* Audit M5: explicit timezone label so users know day boundaries are UTC. */}
      <span className="text-[10px] uppercase tracking-wider text-muted/70" title="Day boundaries are UTC">
        Day boundaries · UTC
      </span>
    </div>
  );
}
