// Feedback list (admin view).
//
//   GET /api/feedback/list?status=&kind=&limit=&offset=
//     Returns { items, total }. Filter set matches what the /feedback
//     triage page renders.
//
// Note on access: this endpoint is open today — the dashboard already
// sits behind middleware-protected auth in production, so the practical
// surface is "anyone with a valid session can read all feedback." Once
// the planned RBAC + workspace work lands (see /roadmap), this should
// flip to admin-only.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const KINDS = ['bug', 'feature-request', 'praise', 'question', 'other'] as const;
const STATUSES = ['open', 'triaged', 'addressed', 'wont-do', 'duplicate'] as const;

const QuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  kind: z.enum(KINDS).optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export interface FeedbackListItem {
  id: string;
  kind: (typeof KINDS)[number];
  message: string;
  path: string | null;
  status: (typeof STATUSES)[number];
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  ip: string | null;
  userAgent: string | null;
  triageNote: string | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    // Drop empty-string params so optional fields stay undefined rather
    // than failing zod validation with "" — searchParams returns empty
    // strings for keys present without a value (e.g. `?status=`).
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

    const { status, kind, limit, offset } = parsed.data;

    const where: { status?: string; kind?: string } = {};
    if (status) where.status = status;
    if (kind) where.kind = kind;

    const [rows, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.feedback.count({ where }),
    ]);

    const items: FeedbackListItem[] = rows.map((r) => ({
      id: r.id,
      // Free-form strings in the DB; coerce through the enum here. If a
      // row ever carries an unknown value (manual DB edit), we fall back
      // to 'other' / 'open' so the UI doesn't crash.
      kind: (KINDS as readonly string[]).includes(r.kind)
        ? (r.kind as (typeof KINDS)[number])
        : 'other',
      message: r.message,
      path: r.path,
      status: (STATUSES as readonly string[]).includes(r.status)
        ? (r.status as (typeof STATUSES)[number])
        : 'open',
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      createdBy: r.createdBy,
      ip: r.ip,
      userAgent: r.userAgent,
      triageNote: r.triageNote,
    }));

    return NextResponse.json({ items, total });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json(
      { error: message, items: [], total: 0 },
      { status: 500 },
    );
  }
}
