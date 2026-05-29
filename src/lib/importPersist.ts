// Shared persistence + dedup helper for provider importers.
//
// The original POST /api/import route bakes its idempotency logic inline.
// The scheduled-imports cron needs the *same* behavior — calling the
// helper twice in the same 6-hour window must not double-count records.
// Factoring the inline block here lets the cron reuse it verbatim while
// the original route handler stays untouched.
//
// Contract:
//
//   persistImportedRecords({ provider, records }) takes a freshly
//   produced ImporterResult.records array and:
//
//     1. Fingerprints existing PromptLog rows in the same time range
//        (by ISO timestamp + model + appName) — the same fingerprint
//        the inline path uses. The `promptText: { startsWith: '[' }`
//        filter narrows the scan to import-rollup rows only, so SDK-
//        logged per-prompt rows never collide with a same-second import.
//     2. Filters incoming records that already exist; counts the skips.
//     3. Persists the survivors via one transactional createMany-style
//        batch, falling back to per-row create on transient batch
//        failures (e.g. SQLite parameter cap).
//
//   Returns { persisted, skipped } — caller logs/aggregates them.

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { ImportedRecord } from '@/lib/importers';

export interface PersistResult {
  persisted: number;
  skipped: number;
}

export interface PersistArgs {
  provider: string;
  records: ImportedRecord[];
}

function fingerprint(ts: Date, model: string, appName: string | null | undefined): string {
  return `${ts.toISOString()}|${model}|${appName ?? ''}`;
}

export async function persistImportedRecords(args: PersistArgs): Promise<PersistResult> {
  const { provider } = args;
  // Defensive copy so we don't mutate caller's array (the inline path
  // shrinks the input array; safer to leave the caller's slice intact).
  const records: ImportedRecord[] = [...args.records];

  if (records.length === 0) {
    return { persisted: 0, skipped: 0 };
  }

  // Compute the [earliest, latest] window across the incoming records.
  // We use this to bound the dedup scan — without it we'd scan every
  // import row this provider ever wrote.
  let earliest = records[0]!.timestamp;
  let latest = records[0]!.timestamp;
  for (const r of records) {
    if (r.timestamp < earliest) earliest = r.timestamp;
    if (r.timestamp > latest) latest = r.timestamp;
  }

  const existing = await prisma.promptLog.findMany({
    where: {
      provider,
      timestamp: { gte: earliest, lte: latest },
      promptText: { startsWith: '[' }, // import-rollup marker
    },
    select: { timestamp: true, model: true, appName: true },
  });
  const seen = new Set<string>(
    existing.map((e) => fingerprint(e.timestamp, e.model, e.appName)),
  );

  let skipped = 0;
  const survivors: ImportedRecord[] = [];
  for (const r of records) {
    const key = fingerprint(r.timestamp, r.model, r.appName ?? null);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    survivors.push(r);
  }

  if (survivors.length === 0) {
    return { persisted: 0, skipped };
  }

  // Build the create input list once; reused by both the batched and
  // per-row fallback paths so they stay in lockstep.
  const dataFor = (r: ImportedRecord): Prisma.PromptLogCreateInput => ({
    timestamp: r.timestamp,
    appName: r.appName ?? null,
    userId: r.userId ?? null,
    model: r.model,
    provider: r.provider,
    promptText: r.promptText,
    responseText: r.responseText,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    totalTokens: r.totalTokens,
    inputCost: r.inputCost,
    outputCost: r.outputCost,
    totalCost: r.totalCost,
    category: r.category,
    complexity: r.complexity,
    complexityScore: r.complexityScore,
    dimensions: r.dimensions,
    characteristics: r.characteristics,
    latencyMs: r.latencyMs,
    metadata: r.metadata,
    potentialSavedTokens: r.potentialSavedTokens,
    potentialSavedCost: r.potentialSavedCost,
    callCount: r.callCount,
  });

  let persisted = 0;
  try {
    await prisma.$transaction(
      survivors.map((r) => prisma.promptLog.create({ data: dataFor(r) })),
    );
    persisted = survivors.length;
  } catch {
    // Fallback: per-row create. Slower but resilient to SQLite "too many
    // parameters" and similar transient batch-only failures.
    for (const r of survivors) {
      await prisma.promptLog.create({ data: dataFor(r) });
      persisted += 1;
    }
  }

  return { persisted, skipped };
}
