import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { countTokens, estimateOutputTokens } from '@/lib/tokenizer';
import { analyzePrompt } from '@/lib/categorizer';
import { optimizePrompt } from '@/lib/optimizer';
import { calculateCost, ensurePricingLoaded } from '@/lib/pricing';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

// Audit M4: cap text-field sizes so a runaway client cannot DoS the server
// with a 100 MB POST that we then tokenize + analyze + optimize. Limits are
// generous but real (1 MB of prompt text is ~250k tokens — well past any
// real-world model's context window). Audit M7: latencyMs cannot be negative
// (rejected upstream by Zod via .nonnegative()).
const MAX_PROMPT_CHARS = 1_000_000;
const MAX_METADATA_KEYS = 64;
const LogBodySchema = z.object({
  model: z.string().min(1).max(200),
  provider: z.string().max(50).optional(),
  appName: z.string().max(200).optional(),
  userId: z.string().max(200).optional(),
  promptText: z.string().min(1).max(MAX_PROMPT_CHARS),
  responseText: z.string().max(MAX_PROMPT_CHARS).optional(),
  inputTokens: z.number().int().nonnegative().max(10_000_000).optional(),
  outputTokens: z.number().int().nonnegative().max(10_000_000).optional(),
  latencyMs: z.number().int().nonnegative().max(60 * 60 * 1000).optional(),
  metadata: z.record(z.unknown()).refine(
    (m) => Object.keys(m).length <= MAX_METADATA_KEYS,
    { message: `metadata may have at most ${MAX_METADATA_KEYS} keys` },
  ).optional(),
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
      // Pass actual outputTokens so cap-output fires on real bloat, not estimates.
      const opt = optimizePrompt(body.promptText, body.model, outputTokens);
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
