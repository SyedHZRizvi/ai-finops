import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { comparePrompts } from '@/lib/compare';
import { ensurePricingLoaded } from '@/lib/pricing';

const SideSchema = z.object({
  prompt: z.string(),
  label: z.string().optional(),
});

const BodySchema = z.object({
  a: SideSchema,
  b: SideSchema,
  model: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await ensurePricingLoaded();
    const json = await req.json().catch(() => null);
    if (json === null) {
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = comparePrompts(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
