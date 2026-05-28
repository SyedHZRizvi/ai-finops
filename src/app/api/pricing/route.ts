import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const UpsertSchema = z.object({
  model: z.string().min(1),
  provider: z.string().optional(),
  inputCostPer1M: z.number().nonnegative(),
  outputCostPer1M: z.number().nonnegative(),
  contextWindow: z.number().int().positive(),
});

export async function GET() {
  try {
    const rows = await prisma.modelPricingConfig.findMany({ orderBy: { model: 'asc' } });
    return NextResponse.json({ items: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
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
    const { model, provider, inputCostPer1M, outputCostPer1M, contextWindow } = parsed.data;

    const row = await prisma.modelPricingConfig.upsert({
      where: { model },
      update: { provider: provider ?? null, inputCostPer1M, outputCostPer1M, contextWindow, isActive: true },
      create: { model, provider: provider ?? null, inputCostPer1M, outputCostPer1M, contextWindow },
    });

    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
