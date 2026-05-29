import { PricingTable } from '@/components/PricingTable';
import { DemoModeToggle } from '@/components/DemoModeToggle';
import { TourButton } from '@/components/TourButton';
import type { ModelPricing } from '@/lib/types';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

interface PricingRow extends ModelPricing {
  id?: string;
  isActive?: boolean;
}

async function loadPricing(): Promise<PricingRow[] | null> {
  try {
    const r = await fetch(`${BASE_URL}/api/pricing`, { cache: 'no-store' });
    if (!r.ok) return null;
    const json = (await r.json()) as { items: PricingRow[] };
    return json.items;
  } catch {
    return null;
  }
}

export default async function SettingsPage() {
  const rows = await loadPricing();

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted mt-1">
          Model pricing config used to compute cost across the app.
        </p>
      </div>

      {!rows ? (
        <div className="card card-pad text-sm text-muted">
          Unable to load pricing. Make sure the API is reachable.
        </div>
      ) : (
        <PricingTable rows={rows} />
      )}

      <div className="pt-2">
        <DemoModeToggle />
      </div>

      <div className="card card-pad flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="label">Onboarding tour</div>
          <div className="text-sm text-inkDim mt-1">
            10-step guided walkthrough of every part of the dashboard. Useful for new teammates.
          </div>
        </div>
        <TourButton />
      </div>
    </div>
  );
}
