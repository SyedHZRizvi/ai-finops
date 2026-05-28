import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { optimizePrompt } from '@/lib/optimizer';
import { ensurePricingLoaded } from '@/lib/pricing';

const BodySchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  promptLogId: z.string().optional(),
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
    const { prompt, model, promptLogId } = parsed.data;

    const result = optimizePrompt(prompt, model);

    await prisma.optimizationLog.create({
      data: {
        promptLogId: promptLogId ?? null,
        originalPrompt: result.originalPrompt,
        optimizedPrompt: result.optimizedPrompt,
        originalTokens: result.originalTokens,
        optimizedTokens: result.optimizedTokens,
        savedTokens: result.savedTokens,
        savedCost: result.estimatedCostSavings,
        suggestions: JSON.stringify(result.suggestions),
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
