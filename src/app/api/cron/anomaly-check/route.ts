// Vercel-cron-driven anomaly check.
//
// Cadence: declared in vercel.json (currently hourly). On each invocation
// Vercel POSTs to this path with `Authorization: Bearer <CRON_SECRET>`.
// We verify the bearer and then run the same detect → dedupe → persist →
// dispatch pipeline that the public POST /api/anomaly/check exposes.
//
// We do NOT call the existing /api/anomaly/check handler (no internal HTTP
// hop, no extra latency, no double-billing of serverless invocations).
// The original module stays unmodified per the task contract; the steps
// below mirror its behavior using the same library functions.
//
// Idempotency: the (kind, scopeKey) dedupe window is 24h, so an hourly
// cron will never produce duplicate AnomalyEvent rows for the same
// underlying condition. Manual `POST /api/anomaly/check` hits coexist
// with the cron — same dedupe set, no double-alerting.

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { detectAnomalies, type DetectedAnomaly } from '@/lib/anomaly';
import { dispatchWebhook } from '@/lib/webhook';
import { verifyCronAuth } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PERSIST = 500;

function trimSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function getDashboardUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL;
  if (fromEnv && fromEnv.length > 0) return `${trimSlash(fromEnv)}/anomaly`;
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}/anomaly`;
  } catch {
    return '/anomaly';
  }
}

// Keep the N most-recently-detected rows. Defensive against a concurrent
// run inserting overlapping rows between our createMany and the re-fetch.
function filterToRecent<T extends { detectedAt: Date }>(rows: T[], n: number): T[] {
  if (rows.length <= n) return rows;
  return [...rows]
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
    .slice(0, n);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[cron/anomaly-check] auth denied: ${auth.reason}`);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line no-console
  console.log('[cron/anomaly-check] start');

  try {
    const detected = await detectAnomalies();
    const detectedCount = detected.length;

    if (detectedCount === 0) {
      const elapsedMs = Date.now() - startedAt;
      // eslint-disable-next-line no-console
      console.log(
        `[cron/anomaly-check] done detected=0 persisted=0 dispatched=0 elapsedMs=${elapsedMs}`,
      );
      return NextResponse.json({
        detected: 0,
        persisted: 0,
        dispatched: 0,
        elapsedMs,
      });
    }

    // Dedupe against unresolved events from the last 24h sharing the same
    // (kind, scopeKey). The detectors must populate scopeKey for this to
    // be effective — rows without one drop into a permissive "always new"
    // bucket, which matches the inline behavior in the public route.
    const since = new Date(Date.now() - DEDUP_WINDOW_MS);
    const distinctKinds = Array.from(new Set(detected.map((d) => d.kind)));
    const recent = await prisma.anomalyEvent.findMany({
      where: {
        detectedAt: { gte: since },
        resolvedAt: null,
        kind: { in: distinctKinds },
      },
      select: { kind: true, scopeKey: true },
    });
    const dedupKeys = new Set<string>();
    for (const r of recent) {
      if (r.scopeKey != null) dedupKeys.add(`${r.kind}|${r.scopeKey}`);
    }

    const seen = new Set<string>();
    const survivors: DetectedAnomaly[] = [];
    for (const d of detected) {
      const key = `${d.kind}|${d.scopeKey}`;
      if (dedupKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      survivors.push(d);
      if (survivors.length >= MAX_PERSIST) break;
    }

    if (survivors.length === 0) {
      const elapsedMs = Date.now() - startedAt;
      // eslint-disable-next-line no-console
      console.log(
        `[cron/anomaly-check] done detected=${detectedCount} persisted=0 dispatched=0 elapsedMs=${elapsedMs}`,
      );
      return NextResponse.json({
        detected: detectedCount,
        persisted: 0,
        dispatched: 0,
        elapsedMs,
      });
    }

    const rowsToCreate: Prisma.AnomalyEventCreateManyInput[] = survivors.map((s) => ({
      kind: s.kind,
      severity: s.severity,
      title: s.title,
      description: s.description,
      scopeKey: s.scopeKey,
      metadata: JSON.stringify(s.metadata ?? {}),
      webhookSent: false,
    }));

    await prisma.anomalyEvent.createMany({ data: rowsToCreate });

    const persistedRows = await prisma.anomalyEvent.findMany({
      where: {
        OR: survivors.map((s) => ({ kind: s.kind, scopeKey: s.scopeKey })),
        detectedAt: { gte: since },
        resolvedAt: null,
      },
      orderBy: { detectedAt: 'desc' },
    });
    const justPersisted = filterToRecent(persistedRows, survivors.length);
    const persistedCount = justPersisted.length;

    // SSE: notify any connected dashboard about each new anomaly. Fire-
    // and-forget; SSE failures must not fail the cron.
    for (const row of justPersisted) {
      try {
        const { notifyAnomalyDetected } = await import('@/lib/sseHook');
        notifyAnomalyDetected(row.id, {
          kind: row.kind,
          severity: row.severity,
          title: row.title,
          detectedAt: row.detectedAt.toISOString(),
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[cron/anomaly-check] SSE notify failed:', err);
      }
    }

    // Dispatch to each Budget.webhookUrl exactly once (deduped by URL).
    const budgets = await prisma.budget.findMany({
      where: { isActive: true, NOT: { webhookUrl: null } },
      select: { webhookUrl: true },
    });
    const uniqueUrls = new Set<string>();
    for (const b of budgets) {
      if (b.webhookUrl && b.webhookUrl.length > 0) uniqueUrls.add(b.webhookUrl);
    }

    let dispatched = 0;
    const dashboardUrl = getDashboardUrl(req);
    if (uniqueUrls.size > 0 && justPersisted.length > 0) {
      const results = await Promise.all(
        Array.from(uniqueUrls).map((url) =>
          dispatchWebhook(url, {
            anomalies: justPersisted,
            dashboardUrl,
          }),
        ),
      );
      const anySuccess = results.some((r) => r.ok);
      if (anySuccess) {
        await prisma.anomalyEvent.updateMany({
          where: { id: { in: justPersisted.map((r) => r.id) } },
          data: { webhookSent: true },
        });
      }
      dispatched = results.filter((r) => r.ok).length;
      const failures = results.filter((r) => !r.ok);
      if (failures.length > 0) {
        // eslint-disable-next-line no-console
        console.error(
          `[cron/anomaly-check] ${failures.length}/${results.length} webhook(s) failed:`,
          failures.map((f) => `status=${f.status} error=${f.error ?? ''}`).join('; '),
        );
      }
    }

    const elapsedMs = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.log(
      `[cron/anomaly-check] done detected=${detectedCount} persisted=${persistedCount} dispatched=${dispatched} elapsedMs=${elapsedMs}`,
    );
    return NextResponse.json({
      detected: detectedCount,
      persisted: persistedCount,
      dispatched,
      elapsedMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    const elapsedMs = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.error(
      `[cron/anomaly-check] failed elapsedMs=${elapsedMs}: ${message}`,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
