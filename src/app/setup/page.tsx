import Link from 'next/link';
import { prisma } from '@/lib/db';
import { SetupWizard } from '@/components/SetupWizard';

export const dynamic = 'force-dynamic';

async function loadHasData(): Promise<boolean> {
  try {
    const count = await prisma.promptLog.count();
    return count > 0;
  } catch {
    return false;
  }
}

export default async function SetupPage() {
  const hasData = await loadHasData();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {hasData && (
        <div className="card card-pad text-xs flex items-center justify-between gap-3 fade-up">
          <span className="text-inkDim flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-good pulse-glow" />
            Dashboard is already populated. You can re-run setup or skip ahead.
          </span>
          <Link href="/" className="btn">
            Go to dashboard <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      <div className="fade-up">
        <h1 className="text-3xl font-bold tracking-tight gradient-text">Welcome to AI FinOps</h1>
        <p className="text-sm text-inkDim mt-2 leading-relaxed">
          Connect your providers, pull historical usage, and see where the bill is going.
        </p>
      </div>

      <SetupWizard />
    </div>
  );
}
