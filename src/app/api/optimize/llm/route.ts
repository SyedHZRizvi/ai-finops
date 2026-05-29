// LLM-backed prompt rewriting endpoint.
//
// This complements `/api/optimize`. The base endpoint runs a deterministic
// regex compressor; this one calls Claude / GPT-4o-mini to actually
// rewrite the prompt for structure and clarity. We keep the two paths
// separate so a heuristic-only deploy stays clean (no LLM credentials
// needed) and so the UI can show the LLM output as a clearly-labelled,
// opt-in additional panel rather than blending it into the heuristic
// numbers.
//
// GET  /api/optimize/llm
//   Probe whether LLM rewriting is available right now. Returns
//   { available: boolean, providers: ('anthropic'|'openai')[] }.
//   Used by the UI on mount to decide whether to show the "Use LLM
//   rewrite" button.
//
// POST /api/optimize/llm
//   body: { prompt: string, preferProvider?: 'anthropic' | 'openai' }
//   Calls the LLM. Always 200 — the JSON body's `ok` field tells the
//   caller whether to display the rewrite or surface an error message.
//   Reasons we use 200 over 4xx/5xx: the UI wants to show actionable
//   hints ("add credentials") and 4xx noise in Vercel logs would be
//   misleading since these aren't actually errors — they're expected
//   states.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isLlmRewriteAvailable, rewriteWithLLM } from '@/lib/llmRewrite';

export const dynamic = 'force-dynamic';

const ProviderSchema = z.enum(['anthropic', 'openai']);

const PostBodySchema = z.object({
  prompt: z.string().min(1).max(60_000),
  preferProvider: ProviderSchema.optional(),
});

export async function GET(): Promise<NextResponse> {
  try {
    const status = await isLlmRewriteAvailable();
    return NextResponse.json(status);
  } catch (err) {
    // Probing must never fail loudly — UI just hides the button.
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json(
      { available: false, providers: [], error: message },
      { status: 200 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'malformed', message: 'invalid JSON body' },
      { status: 400 },
    );
  }
  const parsed = PostBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'malformed',
        message: 'prompt is required',
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const result = await rewriteWithLLM(parsed.data.prompt, {
    preferProvider: parsed.data.preferProvider,
  });

  // Always 200 — the response body's `ok` field is the truth signal.
  return NextResponse.json(result);
}
