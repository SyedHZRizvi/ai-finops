// Server-side helpers for the InsightsSnapshot table.
//
// A snapshot is a pinned moment-in-time copy of the full InsightsResponse.
// We snapshot the rendered payload raw — not just the underlying logs —
// because:
//
//   1. The same logs can produce different insights as pricing, thresholds,
//      and categorization heuristics evolve. The CFO who pinned "April
//      baseline" expects April numbers in October, not whatever the current
//      pipeline would compute today.
//   2. Logs themselves may be deleted (retention, GDPR) but a snapshot
//      should survive — it's a reporting artifact, not raw data.
//
// `diffSnapshots` is the workhorse for the compare view. It's a PURE
// function over two SnapshotDetail objects so the API route, page, and
// future tooling (CLI export, Slack digest) can all call it the same way.
//
// "New" vs "Resolved" recommendation detection uses recommendation id.
// `computeInsights` assigns ids in a stable r-N order keyed on the
// recommendation's logical shape (mismatch bucket, redundancy cluster
// fingerprint, etc.), so the same underlying suggestion gets the same id
// across runs over similar data — close enough for diff purposes.

import { prisma } from './db';
import { computeInsights } from './insights';
import type { InsightsResponse, Recommendation } from './types';

type Period = '24h' | '7d' | '30d' | 'all';

const PERIODS: readonly Period[] = ['24h', '7d', '30d', 'all'] as const;

export interface SnapshotMeta {
  id: string;
  label: string;
  note: string | null;
  period: Period;
  capturedAt: string;
  capturedBy: string | null;
}

export interface SnapshotDetail extends SnapshotMeta {
  payload: InsightsResponse;
}

export interface CaptureSnapshotInput {
  label: string;
  note?: string;
  period: Period;
  capturedBy?: string;
}

function isPeriod(value: string): value is Period {
  return (PERIODS as readonly string[]).includes(value);
}

function coercePeriod(value: string): Period {
  return isPeriod(value) ? value : '30d';
}

// Parse the JSON payload column. If somehow corrupted we don't want a
// single bad row to take down the whole page — return null so callers
// can decide how to surface the failure.
function parsePayload(raw: string): InsightsResponse | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as InsightsResponse;
    }
    return null;
  } catch {
    return null;
  }
}

interface SnapshotRow {
  id: string;
  label: string;
  note: string | null;
  period: string;
  capturedAt: Date;
  capturedBy: string | null;
}

function rowToMeta(row: SnapshotRow): SnapshotMeta {
  return {
    id: row.id,
    label: row.label,
    note: row.note,
    period: coercePeriod(row.period),
    capturedAt: row.capturedAt.toISOString(),
    capturedBy: row.capturedBy,
  };
}

/**
 * Capture a new snapshot. Computes the insights for the given period right
 * now and persists the full response as JSON so it's immutable from this
 * point forward.
 */
export async function captureSnapshot(input: CaptureSnapshotInput): Promise<SnapshotDetail> {
  const label = input.label.trim();
  if (!label) {
    throw new Error('label is required');
  }
  if (!isPeriod(input.period)) {
    throw new Error(`invalid period: ${input.period}`);
  }

  const payload = await computeInsights(input.period);

  const note = input.note?.trim() ? input.note.trim() : null;
  const capturedBy = input.capturedBy?.trim() ? input.capturedBy.trim() : null;

  const created = await prisma.insightsSnapshot.create({
    data: {
      label,
      note,
      period: input.period,
      capturedBy,
      payloadJson: JSON.stringify(payload),
    },
  });

  return {
    ...rowToMeta(created),
    payload,
  };
}

/**
 * List snapshots most-recent-first. The list view doesn't need the full
 * payload (it'd be wasteful to ship megabytes for a hundred snapshots),
 * so we only select the metadata columns.
 */
export async function listSnapshots(limit = 100): Promise<SnapshotMeta[]> {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = await prisma.insightsSnapshot.findMany({
    orderBy: { capturedAt: 'desc' },
    take: safeLimit,
    select: {
      id: true,
      label: true,
      note: true,
      period: true,
      capturedAt: true,
      capturedBy: true,
    },
  });
  return rows.map(rowToMeta);
}

/**
 * Fetch one snapshot in full, including the parsed InsightsResponse payload.
 * Returns null if not found or if the persisted JSON is unparseable.
 */
export async function getSnapshot(id: string): Promise<SnapshotDetail | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  const row = await prisma.insightsSnapshot.findUnique({
    where: { id: trimmed },
  });
  if (!row) return null;

  const payload = parsePayload(row.payloadJson);
  if (!payload) return null;

  return {
    ...rowToMeta(row),
    payload,
  };
}

/**
 * Delete a snapshot by id. Idempotent — succeeds whether or not the row
 * existed. We intentionally hard-delete: snapshots are reporting artifacts
 * with no downstream foreign keys, and "I made a typo in the label" is the
 * dominant delete reason.
 */
export async function deleteSnapshot(id: string): Promise<void> {
  const trimmed = id.trim();
  if (!trimmed) return;
  await prisma.insightsSnapshot.deleteMany({
    where: { id: trimmed },
  });
}

// --- diff ---

export interface SnapshotDiff {
  a: SnapshotMeta;
  b: SnapshotMeta;
  totals: {
    a: { calls: number; cost: number; avgCostPerCall: number };
    b: { calls: number; cost: number; avgCostPerCall: number };
    deltaCost: number;
    deltaCostPercent: number;
    deltaCalls: number;
    deltaCallsPercent: number;
  };
  projectedSavings: {
    a: { monthly: number; annual: number; percentReduction: number };
    b: { monthly: number; annual: number; percentReduction: number };
    deltaMonthly: number;
  };
  recommendationsByCategory: {
    category: string;
    aCount: number;
    bCount: number;
    aSavings: number;
    bSavings: number;
  }[];
  newRecommendations: Recommendation[]; // in b but not in a
  resolvedRecommendations: Recommendation[]; // in a but not in b
  stableRecommendations: {
    a: Recommendation;
    b: Recommendation;
    deltaMonthlySavings: number;
  }[];
  overall: 'improved' | 'regressed' | 'similar';
}

function metaOf(detail: SnapshotDetail): SnapshotMeta {
  return {
    id: detail.id,
    label: detail.label,
    note: detail.note,
    period: detail.period,
    capturedAt: detail.capturedAt,
    capturedBy: detail.capturedBy,
  };
}

function percentDelta(before: number, after: number): number {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
  if (before === 0) {
    if (after === 0) return 0;
    // Can't compute a % change from zero; return a magnitude that the UI
    // can render as "—" if it wants. Convention: 100 if after > 0 else -100.
    return after > 0 ? 100 : -100;
  }
  return ((after - before) / Math.abs(before)) * 100;
}

function classifyOverall(args: {
  deltaCost: number;
  deltaProjectedMonthly: number;
  newCount: number;
  resolvedCount: number;
}): SnapshotDiff['overall'] {
  // "Improved" means the bill is going down OR the optimization opportunity
  // is shrinking (recommendations being resolved). Either signal counts.
  // Weight cost change heavily because that's what the CFO cares about; rec
  // count is a tiebreaker for mixed signals.
  const a = args.deltaCost;
  const costImproved = a < 0;
  const costRegressed = a > 0;

  // Truly flat: no rec movement either. Don't crow about a $0.00 delta.
  if (Math.abs(a) < 0.0001 && args.newCount === 0 && args.resolvedCount === 0) {
    return 'similar';
  }

  // Net rec movement: positive means more resolved than appeared.
  const netResolved = args.resolvedCount - args.newCount;

  if (costImproved && netResolved >= 0) return 'improved';
  if (costRegressed && netResolved <= 0) return 'regressed';

  // Mixed signals (cost up but recs resolved, or vice versa). Cost wins.
  if (costImproved) return 'improved';
  if (costRegressed) return 'regressed';
  return netResolved > 0 ? 'improved' : netResolved < 0 ? 'regressed' : 'similar';
}

/**
 * Compute the diff between two snapshot details. Pure — no DB calls. The
 * `a` snapshot is the "before" / baseline and `b` is the "after".
 *
 * Handles empty datasets gracefully: zero-call snapshots produce 0% deltas
 * rather than NaN, and missing recommendation categories simply show 0
 * counts in their rows.
 */
export function diffSnapshots(a: SnapshotDetail, b: SnapshotDetail): SnapshotDiff {
  const aTotals = a.payload.totals;
  const bTotals = b.payload.totals;

  const deltaCost = bTotals.cost - aTotals.cost;
  const deltaCalls = bTotals.calls - aTotals.calls;

  const deltaCostPercent = percentDelta(aTotals.cost, bTotals.cost);
  const deltaCallsPercent = percentDelta(aTotals.calls, bTotals.calls);

  const aSavings = a.payload.projectedSavings;
  const bSavings = b.payload.projectedSavings;
  const deltaMonthly = bSavings.monthly - aSavings.monthly;

  // Build the (id → recommendation) map for each side so we can do
  // set-style new/resolved/stable comparisons. id is the stable key —
  // computeInsights assigns r-1, r-2, ... in a deterministic order keyed
  // on the recommendation's logical shape (model→model pair, cluster
  // fingerprint, category, etc.), so the same underlying suggestion gets
  // the same id across snapshots.
  //
  // To make the cross-snapshot match more robust than raw r-N (which is
  // sensitive to ordering), we also derive a logical "shape key" from
  // title + category, which is what humans read. Match on (id OR
  // shape-key) — a title change without a logical change still counts as
  // the same recommendation.

  const shapeKey = (r: Recommendation): string =>
    `${r.category}::${r.title.toLowerCase().trim()}`;

  const aById = new Map<string, Recommendation>();
  const aByShape = new Map<string, Recommendation>();
  for (const r of a.payload.recommendations) {
    aById.set(r.id, r);
    aByShape.set(shapeKey(r), r);
  }
  const bById = new Map<string, Recommendation>();
  const bByShape = new Map<string, Recommendation>();
  for (const r of b.payload.recommendations) {
    bById.set(r.id, r);
    bByShape.set(shapeKey(r), r);
  }

  function findInA(rec: Recommendation): Recommendation | undefined {
    return aById.get(rec.id) ?? aByShape.get(shapeKey(rec));
  }
  function findInB(rec: Recommendation): Recommendation | undefined {
    return bById.get(rec.id) ?? bByShape.get(shapeKey(rec));
  }

  const newRecommendations: Recommendation[] = [];
  const stableRecommendations: SnapshotDiff['stableRecommendations'] = [];
  for (const rb of b.payload.recommendations) {
    const matchedA = findInA(rb);
    if (matchedA) {
      stableRecommendations.push({
        a: matchedA,
        b: rb,
        deltaMonthlySavings: rb.estimatedMonthlySavings - matchedA.estimatedMonthlySavings,
      });
    } else {
      newRecommendations.push(rb);
    }
  }

  const resolvedRecommendations: Recommendation[] = [];
  for (const ra of a.payload.recommendations) {
    if (!findInB(ra)) {
      resolvedRecommendations.push(ra);
    }
  }

  // Recommendations grouped by category for the bar in the diff view.
  const categories = new Set<string>();
  for (const r of a.payload.recommendations) categories.add(r.category);
  for (const r of b.payload.recommendations) categories.add(r.category);

  const recommendationsByCategory = Array.from(categories)
    .map((category) => {
      const aOnes = a.payload.recommendations.filter((r) => r.category === category);
      const bOnes = b.payload.recommendations.filter((r) => r.category === category);
      return {
        category,
        aCount: aOnes.length,
        bCount: bOnes.length,
        aSavings: aOnes.reduce((s, r) => s + r.estimatedMonthlySavings, 0),
        bSavings: bOnes.reduce((s, r) => s + r.estimatedMonthlySavings, 0),
      };
    })
    .sort((x, y) => y.bSavings + y.aSavings - (x.bSavings + x.aSavings));

  const overall = classifyOverall({
    deltaCost,
    deltaProjectedMonthly: deltaMonthly,
    newCount: newRecommendations.length,
    resolvedCount: resolvedRecommendations.length,
  });

  return {
    a: metaOf(a),
    b: metaOf(b),
    totals: {
      a: {
        calls: aTotals.calls,
        cost: aTotals.cost,
        avgCostPerCall: aTotals.avgCostPerCall,
      },
      b: {
        calls: bTotals.calls,
        cost: bTotals.cost,
        avgCostPerCall: bTotals.avgCostPerCall,
      },
      deltaCost,
      deltaCostPercent,
      deltaCalls,
      deltaCallsPercent,
    },
    projectedSavings: {
      a: {
        monthly: aSavings.monthly,
        annual: aSavings.annual,
        percentReduction: aSavings.percentReduction,
      },
      b: {
        monthly: bSavings.monthly,
        annual: bSavings.annual,
        percentReduction: bSavings.percentReduction,
      },
      deltaMonthly,
    },
    recommendationsByCategory,
    newRecommendations,
    resolvedRecommendations,
    stableRecommendations,
    overall,
  };
}
