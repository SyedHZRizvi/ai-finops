import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { countTokens, estimateOutputTokens } from '@/lib/tokenizer';
import { analyzePrompt } from '@/lib/categorizer';
import { optimizePrompt } from '@/lib/optimizer';
import { calculateCost, ensurePricingLoaded } from '@/lib/pricing';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

const LogBodySchema = z.object({
  model: z.string().min(1),
  provider: z.string().optional(),
  appName: z.string().optional(),
  userId: z.string().optional(),
  promptText: z.string().min(1),
  responseText: z.string().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

function checkAuth(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.FINOPS_INGEST_TOKEN;
  if (!expected || expected.length === 0) {
    // Audit C8: default-deny is the long-term fix, but for backwards-compat
    // we still accept unauthenticated logs while loudly warning on startup
    // (see warn-on-boot in instrumentation). In production a missing token
    // is itself an event worth logging on every request.
    if (process.env.NODE_ENV === 'production') {
      console.warn('[ai-finops] WARNING: /api/log accepting unauthenticated request — set FINOPS_INGEST_TOKEN to require Bearer auth');
    }
    return { ok: true };
  }

  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  // Constant-time comparison avoids token-length timing leaks.
  const supplied = Buffer.from(match[1], 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  if (supplied.length !== wanted.length) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  if (!timingSafeEqual(supplied, wanted)) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  try {
    const auth = checkAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const json = await req.json().catch(() => null);
    if (json === null) {
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
    }

    const parsed = LogBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const inputTokens = body.inputTokens ?? countTokens(body.promptText, body.model);
    let outputTokens: number;
    if (body.outputTokens !== undefined) {
      outputTokens = body.outputTokens;
    } else if (body.responseText) {
      outputTokens = countTokens(body.responseText, body.model);
    } else {
      outputTokens = estimateOutputTokens(body.promptText, body.model);
    }

    // Refresh editable pricing table before cost calc so Settings edits take
    // effect on the very next ingest (audit C1).
    await ensurePricingLoaded();

    const analysis = analyzePrompt(body.promptText, body.model);
    const { inputCost, outputCost, totalCost } = calculateCost(inputTokens, outputTokens, body.model);

    let potentialSavedTokens = 0;
    let potentialSavedCost = 0;
    try {
      const opt = optimizePrompt(body.promptText, body.model);
      potentialSavedTokens = opt.savedTokens;
      potentialSavedCost = opt.estimatedCostSavings;
    } catch {
      // Optimization failure must not block ingest.
    }

    const created = await prisma.promptLog.create({
      data: {
        appName: body.appName ?? null,
        userId: body.userId ?? null,
        model: body.model,
        provider: body.provider ?? null,
        promptText: body.promptText,
        responseText: body.responseText ?? null,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputCost,
        outputCost,
        totalCost,
        category: analysis.category,
        complexity: analysis.complexity,
        complexityScore: analysis.complexityScore,
        dimensions: JSON.stringify(analysis.dimensions),
        characteristics: JSON.stringify(analysis.characteristics),
        latencyMs: body.latencyMs ?? null,
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
        potentialSavedTokens,
        potentialSavedCost,
      },
      select: {
        id: true,
        totalCost: true,
        potentialSavedCost: true,
        category: true,
        complexity: true,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
