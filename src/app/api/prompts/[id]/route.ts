import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

    const row = await prisma.promptLog.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

    return NextResponse.json({
      ...row,
      dimensions: safeParse(row.dimensions, []),
      characteristics: safeParse(row.characteristics, {}),
      metadata: row.metadata ? safeParse(row.metadata, null) : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
