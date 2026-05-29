// Audit log read API.
//
//   GET /api/audit?limit=&offset=&action=&targetKind=&actor=&since=
//
// Returns { items, total, limit, offset }. `payload` on each item is the
// parsed JSON value (or null) — `listAudit` does the decoding so every
// consumer doesn't reinvent it. All filters AND together. Newest rows first.
//
// Write side lives in src/lib/audit.ts (`recordAudit`) — mutating routes
// import that directly. There is intentionally no POST here; audit rows
// are only ever produced as a side-effect of other mutations.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listAudit, type AuditAction, type AuditTargetKind } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const ACTION_VALUES = [
  'budget.create',
  'budget.update',
  'budget.delete',
  'credential.create',
  'credential.delete',
  'anomaly.resolve',
  'anomaly.create',
  'allocation.create',
  'allocation.update',
  'allocation.delete',
  'apikey.create',
  'apikey.revoke',
  'apikey.update',
  'pricing.update',
  'demo.seed',
  'demo.clear',
  'import.run',
  'annotation.upsert',
  'annotation.delete',
  'snapshot.capture',
  'snapshot.delete',
  'auth.login',
  'auth.logout',
  'auth.failed',
] as const satisfies readonly AuditAction[];

const TARGET_KIND_VALUES = [
  'budget',
  'credential',
  'anomaly',
  'allocation',
  'apikey',
  'pricing',
  'demo',
  'import',
  'annotation',
  'snapshot',
  'auth',
] as const satisfies readonly AuditTargetKind[];

const QuerySchema = z.object({
  // Defaults match what the page renders out of the box. `limit` is hard
  // capped at 500 inside `listAudit` regardless of what we accept here, but
  // we validate up front so users get a useful 400 instead of a silent
  // clamp.
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.enum(ACTION_VALUES).optional(),
  targetKind: z.enum(TARGET_KIND_VALUES).optional(),
  actor: z.string().min(1).max(200).optional(),
  since: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'invalid date' })
    .optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    // Drop empty-string params so optional fields stay undefined rather
    // than failing zod validation with "" — searchParams returns empty
    // strings for keys present without a value (e.g. `?action=`).
    const entries = Array.from(url.searchParams.entries()).filter(
      ([, v]) => v.length > 0,
    );
    const parsed = QuerySchema.safeParse(Object.fromEntries(entries));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid query', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { limit, offset, action, targetKind, actor, since } = parsed.data;
    const sinceDate = since ? new Date(since) : undefined;

    const { items, total } = await listAudit({
      limit,
      offset,
      action,
      targetKind,
      actor,
      since: sinceDate,
    });

    return NextResponse.json({
      // `createdAt` is a JS Date inside the lib; serialize so the JSON
      // payload is a stable ISO string the UI can parse.
      items: items.map((it) => ({
        ...it,
        createdAt: it.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json(
      { error: message, items: [], total: 0, limit: 0, offset: 0 },
      { status: 500 },
    );
  }
}
