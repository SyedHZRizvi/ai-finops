import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_LABEL_CHARS = 120;
const MAX_APP_NAME_CHARS = 200;
const MAX_SCOPE_APPS = 50;

const PatchBodySchema = z
  .object({
    label: z.string().min(1).max(MAX_LABEL_CHARS).optional(),
    scopeApps: z
      .array(z.string().min(1).max(MAX_APP_NAME_CHARS))
      .max(MAX_SCOPE_APPS)
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.label !== undefined || b.scopeApps !== undefined || b.isActive !== undefined,
    { message: 'at least one of label, scopeApps, isActive must be provided' },
  );

function parseScopeApps(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return null;
  }
}

/**
 * DELETE /api/api-keys/[id] — soft-delete: flips `isActive` to false.
 *
 * Soft delete keeps audit history (which key was used when) intact while
 * still ensuring the next /api/log call rejects this token. Hard delete
 * is intentionally not exposed; if cleanup is needed, it must go through
 * a direct DB operation by an operator.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'missing id' }, { status: 400 });
    }

    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const updated = await prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({
      ok: true,
      key: {
        id: updated.id,
        label: updated.label,
        prefix: updated.prefix,
        scopeApps: parseScopeApps(updated.scopeApps),
        isActive: updated.isActive,
        createdAt: updated.createdAt.toISOString(),
        lastUsedAt: updated.lastUsedAt ? updated.lastUsedAt.toISOString() : null,
        expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
        createdBy: updated.createdBy,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/api-keys/[id] — update label, scopeApps, isActive.
 *
 * Passing `scopeApps: null` (or an empty array) clears the scope so the key
 * matches any app. Passing `isActive: true` re-activates a previously
 * revoked key — useful for accidental revokes.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'missing id' }, { status: 400 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
    }

    const parsed = PatchBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Build only the fields we want to update so we don't accidentally
    // overwrite columns that weren't in the request body.
    const data: {
      label?: string;
      scopeApps?: string | null;
      isActive?: boolean;
    } = {};
    if (body.label !== undefined) data.label = body.label;
    if (body.scopeApps !== undefined) {
      data.scopeApps =
        body.scopeApps && body.scopeApps.length > 0
          ? JSON.stringify(body.scopeApps)
          : null;
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const updated = await prisma.apiKey.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ok: true,
      key: {
        id: updated.id,
        label: updated.label,
        prefix: updated.prefix,
        scopeApps: parseScopeApps(updated.scopeApps),
        isActive: updated.isActive,
        createdAt: updated.createdAt.toISOString(),
        lastUsedAt: updated.lastUsedAt ? updated.lastUsedAt.toISOString() : null,
        expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
        createdBy: updated.createdBy,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
