// Vercel-cron-driven provider imports.
//
// Cadence: every 6h (declared in vercel.json). On each tick we walk every
// active `Credential` row and re-pull the last 24h of usage from its
// provider. The window deliberately overlaps the previous tick: provider
// admin APIs often backfill recent buckets late, so a too-tight window
// would silently drop data. The per-record idempotency mechanism in
// `persistImportedRecords` collapses the overlap into zero duplicate rows.
//
// Failure handling: a single bad credential (revoked key, network blip)
// MUST NOT kill the whole run — the other credentials still need to
// import. We catch per-credential and surface `status: 'failed' +
// errorMessage` for that entry while the loop continues.
//
// CSV is excluded — it's a manual upload by definition (no API to poll).
// Any non-implemented provider (bedrock/vertex/azure today) returns
// `status: 'skipped'` so operators can see the row but the run stays
// green.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decrypt, getImporter, type SupportedProvider } from '@/lib/importers';
import { ensurePricingLoaded } from '@/lib/pricing';
import { verifyCronAuth } from '@/lib/cronAuth';
import { persistImportedRecords } from '@/lib/importPersist';

export const dynamic = 'force-dynamic';
// Provider imports are network-bound and can batch many rows; bump the
// timeout above the default 10s. Vercel Hobby caps at 60s for serverless
// functions, Pro at 300s. We pick 300 so the cron has headroom even when
// multiple credentials run sequentially behind a slow provider API.
export const maxDuration = 300;

const RANGE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

// Providers we KNOW how to import for. Anything outside this set yields
// status='skipped'. CSV is never importable on a schedule.
const SUPPORTED_FOR_CRON: ReadonlySet<SupportedProvider> = new Set<SupportedProvider>([
  'anthropic',
  'openai',
]);

interface PerCredResult {
  credentialId: string;
  provider: string;
  status: 'succeeded' | 'failed' | 'skipped';
  recordsImported: number;
  recordsSkippedDuplicate: number;
  errorMessage?: string;
}

interface CronImportResponse {
  ranAt: string;
  results: PerCredResult[];
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function isSupportedProvider(p: string): p is SupportedProvider {
  return (
    p === 'anthropic' ||
    p === 'openai' ||
    p === 'csv' ||
    p === 'google' ||
    p === 'azure' ||
    p === 'bedrock' ||
    p === 'vertex'
  );
}

export async function POST(req: NextRequest): Promise<NextResponse<CronImportResponse | { error: string }>> {
  const startedAt = Date.now();
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[cron/scheduled-imports] auth denied: ${auth.reason}`);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line no-console
  console.log('[cron/scheduled-imports] start');

  const ranAt = new Date();
  const rangeTo = ranAt;
  const rangeFrom = new Date(ranAt.getTime() - RANGE_LOOKBACK_MS);

  let credentials: Array<{
    id: string;
    provider: string;
    encryptedBlob: string;
    iv: string;
    authTag: string;
  }> = [];

  try {
    credentials = await prisma.credential.findMany({
      where: { isActive: true },
      select: {
        id: true,
        provider: true,
        encryptedBlob: true,
        iv: true,
        authTag: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to load credentials';
    // eslint-disable-next-line no-console
    console.error(`[cron/scheduled-imports] credential load failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (credentials.length === 0) {
    const elapsedMs = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.log(
      `[cron/scheduled-imports] done credentials=0 elapsedMs=${elapsedMs}`,
    );
    return NextResponse.json({ ranAt: ranAt.toISOString(), results: [] });
  }

  // Load pricing once for the whole run — importers depend on it for
  // cost computation, and ensurePricingLoaded is a no-op after the first
  // call this process lifetime.
  try {
    await ensurePricingLoaded();
  } catch (err) {
    // Pricing failure is fatal for cost data — log loudly but still
    // attempt the imports; importers handle missing pricing gracefully.
    // eslint-disable-next-line no-console
    console.warn('[cron/scheduled-imports] ensurePricingLoaded failed:', err);
  }

  const results: PerCredResult[] = [];

  for (const cred of credentials) {
    const baseResult: PerCredResult = {
      credentialId: cred.id,
      provider: cred.provider,
      status: 'skipped',
      recordsImported: 0,
      recordsSkippedDuplicate: 0,
    };

    // Filter out providers we can't cron-import. CSV is manual-only; the
    // unimplemented importers return empty/no-op runs and only clutter
    // the response, so we skip them up-front.
    if (!isSupportedProvider(cred.provider) || !SUPPORTED_FOR_CRON.has(cred.provider as SupportedProvider)) {
      results.push({
        ...baseResult,
        status: 'skipped',
        errorMessage:
          cred.provider === 'csv'
            ? 'CSV provider is manual-only — skip in scheduled imports'
            : `Provider '${cred.provider}' has no scheduled importer (manual /api/import still works)`,
      });
      continue;
    }

    // Create an ImportJob row so this run shows up in the import history
    // UI — operators want to see "the 6am cron ran successfully" without
    // tailing Vercel logs.
    let jobId: string | null = null;
    try {
      const job = await prisma.importJob.create({
        data: {
          provider: cred.provider,
          status: 'running',
          rangeFrom,
          rangeTo,
        },
        select: { id: true },
      });
      jobId = job.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to create ImportJob';
      results.push({
        ...baseResult,
        status: 'failed',
        errorMessage: truncate(message, 500),
      });
      continue;
    }

    try {
      const apiKey = decrypt({
        encryptedBlob: cred.encryptedBlob,
        iv: cred.iv,
        authTag: cred.authTag,
      });
      const importer = getImporter(cred.provider as SupportedProvider);
      const result = await importer.run({
        apiKey,
        rangeFrom,
        rangeTo,
      });

      const { persisted, skipped } = await persistImportedRecords({
        provider: cred.provider,
        records: result.records,
      });

      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          recordsImported: persisted,
          rangeFrom: result.rawRangeFrom ?? rangeFrom,
          rangeTo: result.rawRangeTo ?? rangeTo,
        },
      });

      results.push({
        credentialId: cred.id,
        provider: cred.provider,
        status: 'succeeded',
        recordsImported: persisted,
        recordsSkippedDuplicate: skipped,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Mirror the public import route: never echo crypto internals.
      const externalMessage = /decrypt|cipher|iv|auth.?tag/i.test(message)
        ? 'Could not decrypt provider credentials. Verify FINOPS_ENCRYPTION_KEY has not changed.'
        : message;

      try {
        await prisma.importJob.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            errorMessage: truncate(message, 500),
          },
        });
      } catch {
        // Even the failure-update failed; the row stays in 'running'.
        // Surface in the response anyway.
      }

      // eslint-disable-next-line no-console
      console.error(
        `[cron/scheduled-imports] credentialId=${cred.id} provider=${cred.provider} failed: ${message}`,
      );
      results.push({
        credentialId: cred.id,
        provider: cred.provider,
        status: 'failed',
        recordsImported: 0,
        recordsSkippedDuplicate: 0,
        errorMessage: truncate(externalMessage, 500),
      });
    }
  }

  const elapsedMs = Date.now() - startedAt;
  const succeeded = results.filter((r) => r.status === 'succeeded').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  // eslint-disable-next-line no-console
  console.log(
    `[cron/scheduled-imports] done credentials=${credentials.length} succeeded=${succeeded} failed=${failed} skipped=${skipped} elapsedMs=${elapsedMs}`,
  );

  return NextResponse.json({
    ranAt: ranAt.toISOString(),
    results,
  });
}
