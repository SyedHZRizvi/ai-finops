// Cron-driven anomaly check. Intended to be hit on a schedule (Vercel Cron,
// GitHub Actions, a workflow runner) every 5-15 minutes.
//
// Flow:
//   1. Run all detectors via detectAnomalies()
//   2. Dedupe against AnomalyEvent rows from the last 24h whose
//      (kind, scopeKey) matches AND which are still unresolved. This is the
//      idempotency guarantee — calling /api/anomaly/check twice in 5
//      minutes does NOT produce duplicates.
//   3. Persist the survivors with prisma.anomalyEvent.createMany
//   4. Re-fetch the newly persisted rows (createMany doesn't return them
//      on Postgres, and we need their ids for webhookSent updates).
//   5. For each active Budget with a webhookUrl, dispatch the batched
//      webhook. A failed dispatch logs and continues — the events are
//      already saved, so a retry next cycle won't lose data.
//   6. Mark dispatched events webhookSent=true.

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { detectAnomalies, type DetectedAnomaly } from '@/lib/anomaly';
import { dispatchWebhook } from '@/lib/webhook';

export const dynamic = 'force-dynamic';

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
// Hard cap on rows we persist in a single run. Defends against a runaway
// detector returning thousands of rows; in practice a healthy run is < 50.
const MAX_PERSIST = 500;

function getDashboardUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL;
  if (fromEnv && fromEnv.length > 0) return `${trimSlash(fromEnv)}/anomaly`;
  // Fallback: derive from the request. Works for both Vercel previews and
  // local development.
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}/anomaly`;
  } catch {
    return '/anomaly';
  }
}

function trimSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const detected = await detectAnomalies();
    const detectedCount = detected.length;

    if (detectedCount === 0) {
      return NextResponse.json({ detected: 0, persisted: 0, dispatched: 0 });
    }

    // Dedup against unresolved rows from the last 24h. We fetch the
    // (kind, scopeKey) tuples in one query and build a Set for O(1) lookup.
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

    // De-dupe within the same batch too — a detector could in principle
    // emit the same scopeKey twice (e.g. two budgets resolving to the
    // same key). Last-write-wins.
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
      return NextResponse.json({
        detected: detectedCount,
        persisted: 0,
        dispatched: 0,
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

    // createMany doesn't return the created rows on Postgres; we run it
    // first and then fetch what we just inserted by (kind, scopeKey).
    await prisma.anomalyEvent.createMany({ data: rowsToCreate });

    const persistedRows = await prisma.anomalyEvent.findMany({
      where: {
        // Same survivors set. Without scopeKey this isn't perfectly safe,
        // but since the detectors always set scopeKey we're fine.
        OR: survivors.map((s) => ({ kind: s.kind, scopeKey: s.scopeKey })),
        detectedAt: { gte: since },
        resolvedAt: null,
      },
      orderBy: { detectedAt: 'desc' },
    });

    // Cap to the rows we just persisted (in case createMany happened during
    // a concurrent run and we picked up earlier insertions).
    const justPersisted = filterToRecent(persistedRows, survivors.length);
    const persistedCount = justPersisted.length;

    // Dispatch. Webhook URLs live on active Budget rows — one batched alert
    // per unique URL. Empty URLs are skipped.
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
      // Dispatch all webhooks in parallel. A slow one shouldn't block fast
      // ones; the per-call timeout in dispatchWebhook caps total wall time.
      const results = await Promise.all(
        Array.from(uniqueUrls).map((url) =>
          dispatchWebhook(url, {
            anomalies: justPersisted,
            dashboardUrl,
          }),
        ),
      );
      const anySuccess = results.some((r) => r.ok);
      // We don't track per-URL dispatch status on the AnomalyEvent — only
      // the boolean. If at least one webhook landed, flip the flag.
      if (anySuccess) {
        await prisma.anomalyEvent.updateMany({
          where: { id: { in: justPersisted.map((r) => r.id) } },
          data: { webhookSent: true },
        });
      }
      dispatched = results.filter((r) => r.ok).length;
      // Log failures for operator visibility without escalating to a 500.
      const failures = results.filter((r) => !r.ok);
      if (failures.length > 0) {
        // eslint-disable-next-line no-console
        console.error(
          `[anomaly/check] ${failures.length}/${results.length} webhook(s) failed:`,
          failures.map((f) => `status=${f.status} error=${f.error ?? ''}`).join('; '),
        );
      }
    }

    return NextResponse.json({
      detected: detectedCount,
      persisted: persistedCount,
      dispatched,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Keep the N most recently detected rows. Used to cap the re-fetched set
// to the survivors we just persisted, even when a race with another cron
// run picked up rows from a prior tick.
function filterToRecent<T extends { detectedAt: Date }>(rows: T[], n: number): T[] {
  if (rows.length <= n) return rows;
  return [...rows]
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
    .slice(0, n);
}
