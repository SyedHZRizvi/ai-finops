import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import pkg from '../../../../package.json';

export const dynamic = 'force-dynamic';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  database: { reachable: boolean; latencyMs: number };
  lastLog: { timestamp: string | null; ageSeconds: number | null };
  lastImport: {
    provider: string | null;
    timestamp: string | null;
    ageSeconds: number | null;
  };
  version: string;
  env: 'development' | 'production';
}

function ageSeconds(ts: Date | null | undefined): number | null {
  if (!ts) return null;
  return Math.max(0, Math.round((Date.now() - ts.getTime()) / 1000));
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const env: HealthResponse['env'] =
    process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

  // 1) DB reachability — a single trivial round trip.
  let dbReachable = false;
  let dbLatency = 0;
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - start;
    dbReachable = true;
  } catch {
    dbReachable = false;
  }

  // 2) Most recent log + most recent import. Both queries are isolated so a
  // single failure doesn't collapse the entire health payload.
  let lastLogTs: Date | null = null;
  let lastImportTs: Date | null = null;
  let lastImportProvider: string | null = null;
  if (dbReachable) {
    try {
      const log = await prisma.promptLog.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });
      lastLogTs = log?.timestamp ?? null;
    } catch {
      lastLogTs = null;
    }
    try {
      const imp = await prisma.importJob.findFirst({
        where: { status: 'succeeded' },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true, provider: true },
      });
      lastImportTs = imp?.finishedAt ?? null;
      lastImportProvider = imp?.provider ?? null;
    } catch {
      lastImportTs = null;
      lastImportProvider = null;
    }
  }

  // 3) Overall status. Down only if the DB is unreachable; degraded if the
  // last log is older than 24h (data flow likely stopped).
  let status: HealthResponse['status'] = 'ok';
  if (!dbReachable) status = 'down';
  else {
    const age = ageSeconds(lastLogTs);
    if (age !== null && age > 24 * 60 * 60) status = 'degraded';
  }

  const body: HealthResponse = {
    status,
    database: { reachable: dbReachable, latencyMs: dbLatency },
    lastLog: {
      timestamp: lastLogTs ? lastLogTs.toISOString() : null,
      ageSeconds: ageSeconds(lastLogTs),
    },
    lastImport: {
      provider: lastImportProvider,
      timestamp: lastImportTs ? lastImportTs.toISOString() : null,
      ageSeconds: ageSeconds(lastImportTs),
    },
    version,
    env,
  };

  return NextResponse.json(body);
}
