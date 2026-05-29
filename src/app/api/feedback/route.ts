// Feedback ingest.
//
//   POST /api/feedback
//     Body: { kind, message, path?, createdBy? }
//     Validates with zod, extracts client ip + userAgent from request
//     headers, persists to the Feedback table, returns only { id } —
//     we don't echo the row back so the surface area is minimal.
//
// This endpoint is intentionally open: the whole point of the floating
// widget is to collect signal from anonymous users, and pre-auth gating
// would defeat that. Spam / abuse mitigation is deferred to rate
// limiting at the edge.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_MESSAGE_CHARS = 4000;
const MAX_PATH_CHARS = 500;
const MAX_CREATED_BY_CHARS = 320;

const KINDS = ['bug', 'feature-request', 'praise', 'question', 'other'] as const;

const PostBodySchema = z.object({
  kind: z.enum(KINDS),
  message: z
    .string()
    .min(1, 'message is required')
    .max(MAX_MESSAGE_CHARS, `message exceeds ${MAX_MESSAGE_CHARS} characters`),
  path: z.string().max(MAX_PATH_CHARS).optional(),
  createdBy: z.string().max(MAX_CREATED_BY_CHARS).optional(),
});

/**
 * Extract the originating client IP from the standard forwarding headers.
 * Mirrors the logic in src/lib/audit.ts so both audit + feedback record
 * IPs the same way (x-forwarded-for first, then x-real-ip).
 */
function extractIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();
  return null;
}

function extractUserAgent(req: NextRequest): string | null {
  const ua = req.headers.get('user-agent');
  if (!ua) return null;
  const trimmed = ua.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  try {
    const created = await prisma.feedback.create({
      data: {
        kind: body.kind,
        message: body.message,
        path: body.path ?? null,
        createdBy: body.createdBy ?? null,
        ip: extractIp(req),
        userAgent: extractUserAgent(req),
        // `status` and `createdAt` default in the schema.
      },
      select: { id: true },
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
