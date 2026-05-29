// Cost allocation engine.
//
// Re-attributes spend from a "source" app (e.g., a shared LLM pool that one
// platform team owns) to the actual teams consuming it. A FinOps lead can
// declare "30% of shared-llm-pool's spend goes to marketing, 50% to
// engineering, 20% to support" and downstream rollups follow.
//
// This module is intentionally pure (no Prisma side effects) except for
// `listActiveRules`. `applyAllocation` and `reallocateRows` take raw rows
// and return reattributed rows — the caller decides what to do with them.
//
// Wildcard semantics: an empty / undefined matcher field means "match
// anything". Arrays mean "any of". Rules are evaluated in priority asc
// order; the first match wins (no rule chaining). A row that matches no
// rule passes through unchanged with `ruleId: null`.
//
// Sum tolerance: target-split percents must add up to roughly 100%. The
// API accepts 95-105% so users aren't forced to make perfect-fraction
// percents like 33.33/33.33/33.34 sum exactly. Within the engine we still
// distribute by exact percent — we do NOT auto-normalize, because over- or
// under-allocating shows up as a small drift in the reports and that's a
// useful signal that a rule was misconfigured.

import { prisma } from './db';

export interface SourceMatcher {
  appName?: string | string[];
  model?: string | string[];
  userId?: string | string[];
}

// Map of recipient appName -> percent share (0-100). Keys become the
// `allocatedAppName` on output rows; the SDK / importer never sees these
// names directly, so they're free-form strings (e.g., "team-marketing").
export interface TargetSplit {
  [appName: string]: number;
}

export interface AllocationRuleData {
  id: string;
  name: string;
  sourceMatcher: SourceMatcher;
  targetSplit: TargetSplit;
  isActive: boolean;
  priority: number;
}

export interface AllocatedRow {
  // Original appName from the underlying PromptLog (may be null when the
  // SDK didn't set one). Kept so callers can show "originally attributed
  // to X, reallocated to Y".
  originalAppName: string | null;
  allocatedAppName: string;
  originalCost: number;
  allocatedCost: number;
  // null = passthrough (no rule applied). Useful for the preview view so
  // we can show which rows were touched.
  ruleId: string | null;
}

interface RowInput {
  appName: string | null;
  model: string;
  userId: string | null;
  totalCost: number;
}

interface MatcherRowInput {
  appName: string | null;
  model: string;
  userId: string | null;
}

// -- DB read ---------------------------------------------------------------

// Load every active rule, sorted by priority ascending so the caller can
// iterate in evaluation order. Bad JSON in sourceMatcher / targetSplit is
// quietly skipped — we'd rather drop a corrupt rule than crash the whole
// reallocation pipeline.
export async function listActiveRules(): Promise<AllocationRuleData[]> {
  const rows = await prisma.allocationRule.findMany({
    where: { isActive: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  const out: AllocationRuleData[] = [];
  for (const row of rows) {
    const matcher = parseMatcher(row.sourceMatcher);
    const split = parseSplit(row.targetSplit);
    if (!matcher || !split) continue;
    out.push({
      id: row.id,
      name: row.name,
      sourceMatcher: matcher,
      targetSplit: split,
      isActive: row.isActive,
      priority: row.priority,
    });
  }
  return out;
}

function parseMatcher(s: string): SourceMatcher | null {
  try {
    const v = JSON.parse(s) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const m = v as Record<string, unknown>;
    const out: SourceMatcher = {};
    if (m.appName !== undefined) {
      const x = coerceStringOrArray(m.appName);
      if (x !== null) out.appName = x;
    }
    if (m.model !== undefined) {
      const x = coerceStringOrArray(m.model);
      if (x !== null) out.model = x;
    }
    if (m.userId !== undefined) {
      const x = coerceStringOrArray(m.userId);
      if (x !== null) out.userId = x;
    }
    return out;
  } catch {
    return null;
  }
}

function coerceStringOrArray(v: unknown): string | string[] | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
    return v as string[];
  }
  return null;
}

function parseSplit(s: string): TargetSplit | null {
  try {
    const v = JSON.parse(s) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const m = v as Record<string, unknown>;
    const out: TargetSplit = {};
    for (const [k, val] of Object.entries(m)) {
      if (typeof val !== 'number' || !Number.isFinite(val)) return null;
      out[k] = val;
    }
    if (Object.keys(out).length === 0) return null;
    return out;
  } catch {
    return null;
  }
}

// -- Matching --------------------------------------------------------------

// True if every defined field on the matcher matches the row. An undefined
// matcher field is a wildcard. Arrays mean "any of"; null on the row never
// matches an explicit matcher value (so a matcher with appName='foo' will
// NOT match a row with appName=null).
export function matches(row: MatcherRowInput, matcher: SourceMatcher): boolean {
  if (matcher.appName !== undefined && !matchOne(row.appName, matcher.appName)) {
    return false;
  }
  if (matcher.model !== undefined && !matchOne(row.model, matcher.model)) {
    return false;
  }
  if (matcher.userId !== undefined && !matchOne(row.userId, matcher.userId)) {
    return false;
  }
  return true;
}

function matchOne(value: string | null, expected: string | string[]): boolean {
  if (value === null) return false;
  if (Array.isArray(expected)) return expected.includes(value);
  return value === expected;
}

// -- Allocation ------------------------------------------------------------

// Take a single row and return one allocated row per recipient (or one
// passthrough row if no rule applies). Rules must already be sorted by
// priority asc; we walk and pick the first match.
//
// Cost is split by exact percent — we do NOT renormalize when the split
// adds up to 99% or 101%. Small drift is intentional: it shows up in the
// reports as a tiny over/under allocation and tips operators off that a
// rule's split is slightly off.
export function applyAllocation(
  row: RowInput,
  rules: AllocationRuleData[],
): AllocatedRow[] {
  const rule = rules.find((r) => r.isActive && matches(row, r.sourceMatcher));
  if (!rule) {
    return [
      {
        originalAppName: row.appName,
        allocatedAppName: row.appName ?? 'unknown',
        originalCost: row.totalCost,
        allocatedCost: row.totalCost,
        ruleId: null,
      },
    ];
  }

  const entries = Object.entries(rule.targetSplit);
  // Guard for safety: a corrupt rule with no targets shouldn't crash.
  // listActiveRules already filters these out but keep the engine safe
  // for callers passing rules from other sources (e.g., a preview body).
  if (entries.length === 0) {
    return [
      {
        originalAppName: row.appName,
        allocatedAppName: row.appName ?? 'unknown',
        originalCost: row.totalCost,
        allocatedCost: row.totalCost,
        ruleId: null,
      },
    ];
  }

  return entries.map(([appName, percent]) => ({
    originalAppName: row.appName,
    allocatedAppName: appName,
    originalCost: row.totalCost,
    allocatedCost: row.totalCost * (percent / 100),
    ruleId: rule.id,
  }));
}

// Convenience: pull active rules once and apply to a batch of rows. This
// is what the eventual `/api/stats` integration will call before grouping
// — turn N raw rows into M allocated rows, then aggregate by
// `allocatedAppName` instead of `appName`.
export async function reallocateRows<
  T extends RowInput,
>(rows: T[]): Promise<AllocatedRow[]> {
  const rules = await listActiveRules();
  const out: AllocatedRow[] = [];
  for (const row of rows) {
    const allocated = applyAllocation(row, rules);
    for (const a of allocated) out.push(a);
  }
  return out;
}
