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
    <div className="max-w-2xl mx-auto space-y-5">
      {hasData && (
        <div className="card card-pad text-xs flex items-center justify-between gap-3">
          <span className="text-muted">
            Dashboard is already populated. You can re-run setup or skip ahead.
          </span>
          <Link href="/" className="btn">
            Go to dashboard
          </Link>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to AI FinOps</h1>
        <p className="text-sm text-muted mt-1">
          Connect your providers, pull historical usage, and see where the bill is going.
        </p>
      </div>

      <SetupWizard />
    </div>
  );
}
