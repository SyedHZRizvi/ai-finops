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
    <div className="inline-flex items-center gap-1 rounded-lg bg-panel border border-border p-1">
      {PERIODS.map((p) => {
        const active = p.value === current;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => set(p.value)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
              active ? 'bg-brand text-white' : 'bg-panel2 text-muted hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
