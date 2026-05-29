import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateToken } from '@/lib/apiKeys';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const MAX_LABEL_CHARS = 120;
const MAX_APP_NAME_CHARS = 200;
const MAX_SCOPE_APPS = 50;
const MAX_EXPIRES_DAYS = 3650; // ~10 years; effectively unlimited but bounded.

const PostBodySchema = z.object({
  label: z.string().min(1, 'label is required').max(MAX_LABEL_CHARS),
  scopeApps: z
    .array(z.string().min(1).max(MAX_APP_NAME_CHARS))
    .max(MAX_SCOPE_APPS)
    .optional(),
  expiresInDays: z.number().int().positive().max(MAX_EXPIRES_DAYS).optional(),
  createdBy: z.string().max(MAX_LABEL_CHARS).optional(),
});

/**
 * Parse the JSON-encoded `scopeApps` column safely. Bad data shows up as
 * null in the response rather than throwing the whole endpoint.
 */
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

interface ApiKeyListItem {
  id: string;
  label: string;
  /** Redacted display value, e.g. `ftk_abcd1234...`. The raw token is never returned here. */
  key: string;
  prefix: string;
  scopeApps: string[] | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdBy: string | null;
}

/**
 * GET /api/api-keys — list all keys (active and revoked).
 *
 * The `key` field is always a redacted prefix; the raw token is never
 * persisted server-side and is therefore unrecoverable post-creation.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const rows = await prisma.apiKey.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });

    const items: ApiKeyListItem[] = rows.map((row) => ({
      id: row.id,
      label: row.label,
      key: `${row.prefix}...`,
      prefix: row.prefix,
      scopeApps: parseScopeApps(row.scopeApps),
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      createdBy: row.createdBy,
    }));

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}

/**
 * POST /api/api-keys — create a new key.
 *
 * Returns the RAW token in the response exactly once. The dashboard surfaces
 * it in a modal with an explicit one-time-visibility warning; the value is
 * unrecoverable after that response is consumed.
 */
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
    const token = generateToken();
    const expiresAt =
      body.expiresInDays !== undefined
        ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    // Empty arrays normalize to "null = any app" so list rendering and
    // verification both agree on the same meaning.
    const scopeAppsJson =
      body.scopeApps && body.scopeApps.length > 0
        ? JSON.stringify(body.scopeApps)
        : null;

    const created = await prisma.apiKey.create({
      data: {
        label: body.label,
        hashedKey: token.hashed,
        prefix: token.prefix,
        scopeApps: scopeAppsJson,
        expiresAt,
        createdBy: body.createdBy ?? null,
      },
    });

    // NB: never record the raw token. label + prefix are safe to retain.
    await recordAudit({
      req,
      action: 'apikey.create',
      targetKind: 'apikey',
      targetId: created.id,
      payload: {
        label: created.label,
        prefix: created.prefix,
        scopeApps: parseScopeApps(created.scopeApps),
        expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
      },
    });

    return NextResponse.json(
      {
        // The raw token is surfaced exactly once; never log it server-side
        // and never store it.
        rawToken: token.raw,
        key: {
          id: created.id,
          label: created.label,
          prefix: created.prefix,
          scopeApps: parseScopeApps(created.scopeApps),
          isActive: created.isActive,
          createdAt: created.createdAt.toISOString(),
          lastUsedAt: null,
          expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
          createdBy: created.createdBy,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
