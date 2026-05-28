import Link from 'next/link';
import { prisma } from '@/lib/db';
import { listImporters } from '@/lib/importers';
import {
  ConnectorList,
  type CredentialDTO,
  type ImportJobDTO,
  type ImporterInfo,
} from '@/components/ConnectorList';
import { EmptyState } from '@/components/EmptyState';

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

function ConnectorsEmpty() {
  return (
    <EmptyState
      title="No connectors yet"
      subtitle="Connect a provider to pull historical usage. The setup wizard walks you through it in about two minutes."
      actions={
        <Link href="/setup" className="btn-primary">
          Add your first connector <span aria-hidden>→</span>
        </Link>
      }
    />
  );
}

export default async function ImportPage() {
  const [credentials, jobs] = await Promise.all([loadCredentials(), loadJobs()]);
  const importers: ImporterInfo[] = listImporters();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connectors</h1>
          <p className="text-sm text-muted mt-1">
            Manage provider keys and pull historical usage.
          </p>
        </div>
        <Link href="/setup" className="btn">
          Open setup wizard <span aria-hidden>→</span>
        </Link>
      </div>

      {credentials.length === 0 && jobs.length === 0 ? (
        <ConnectorsEmpty />
      ) : (
        <ConnectorList credentials={credentials} jobs={jobs} importers={importers} />
      )}
    </div>
  );
}
