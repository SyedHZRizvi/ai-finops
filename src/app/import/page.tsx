import Link from 'next/link';
import { prisma } from '@/lib/db';
import { listImporters } from '@/lib/importers';
import {
  ConnectorList,
  type CredentialDTO,
  type ImportJobDTO,
  type ImporterInfo,
} from '@/components/ConnectorList';

export const dynamic = 'force-dynamic';

async function loadCredentials(): Promise<CredentialDTO[]> {
  const rows = await prisma.credential.findMany({
    orderBy: [{ provider: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      provider: true,
      label: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider as CredentialDTO['provider'],
    label: r.label,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

async function loadJobs(): Promise<ImportJobDTO[]> {
  const rows = await prisma.importJob.findMany({
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    status: r.status,
    recordsImported: r.recordsImported,
    errorMessage: r.errorMessage,
    rangeFrom: r.rangeFrom ? r.rangeFrom.toISOString() : null,
    rangeTo: r.rangeTo ? r.rangeTo.toISOString() : null,
  }));
}

function EmptyState() {
  return (
    <div className="card card-pad text-center py-12">
      <div className="text-lg font-medium">No connectors yet</div>
      <div className="text-sm text-muted mt-2 max-w-md mx-auto">
        Connect a provider to pull historical usage. The setup wizard walks you through it in about
        two minutes.
      </div>
      <Link href="/setup" className="btn btn-primary mt-4 inline-flex">
        Add your first connector
      </Link>
    </div>
  );
}

export default async function ImportPage() {
  const [credentials, jobs] = await Promise.all([loadCredentials(), loadJobs()]);
  const importers: ImporterInfo[] = listImporters();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Connectors</h1>
          <p className="text-sm text-muted mt-0.5">
            Manage provider keys and pull historical usage.
          </p>
        </div>
        <Link href="/setup" className="btn">
          Open setup wizard
        </Link>
      </div>

      {credentials.length === 0 && jobs.length === 0 ? (
        <EmptyState />
      ) : (
        <ConnectorList credentials={credentials} jobs={jobs} importers={importers} />
      )}
    </div>
  );
}
