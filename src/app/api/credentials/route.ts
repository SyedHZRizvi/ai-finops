import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/importers';

export const dynamic = 'force-dynamic';

const ProviderSchema = z.enum([
  'anthropic',
  'openai',
  'google',
  'azure',
  'gateway',
  'bedrock',
  'vertex',
]);

const UpsertSchema = z.object({
  provider: ProviderSchema,
  label: z.string().max(120).optional(),
  apiKey: z.string().min(1, 'apiKey is required'),
});

function encryptionConfigured(): boolean {
  const hex = process.env.FINOPS_ENCRYPTION_KEY;
  return typeof hex === 'string' && hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex);
}

export async function GET() {
  try {
    const rows = await prisma.credential.findMany({
      orderBy: [{ provider: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        provider: true,
        label: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ items: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!encryptionConfigured()) {
      return NextResponse.json(
        {
          error:
            'Encryption not configured. Run from the desktop app or set FINOPS_ENCRYPTION_KEY.',
        },
        { status: 503 },
      );
    }

    const json = await req.json().catch(() => null);
    if (json === null) {
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
    }

    const parsed = UpsertSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { provider, apiKey } = parsed.data;
    // Compound unique key is (provider, label) — Prisma treats null and ''
    // distinctly, so we normalize the absent label to '' for consistent upsert.
    const label = parsed.data.label ?? '';

    const blob = encrypt(apiKey);

    const row = await prisma.credential.upsert({
      where: { provider_label: { provider, label } },
      update: {
        encryptedBlob: blob.encryptedBlob,
        iv: blob.iv,
        authTag: blob.authTag,
        isActive: true,
      },
      create: {
        provider,
        label,
        encryptedBlob: blob.encryptedBlob,
        iv: blob.iv,
        authTag: blob.authTag,
      },
      select: { id: true, provider: true, label: true },
    });

    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id query param required' }, { status: 400 });
    }
    await prisma.credential.delete({ where: { id } }).catch(() => {
      // Idempotent delete — missing rows are treated as success.
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
