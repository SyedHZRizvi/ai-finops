import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildPrompt } from '@/lib/promptBuilder';
import type { StudioRequest } from '@/lib/types';

const TargetProviderSchema = z.enum([
  'claude', 'gpt', 'gemini', 'copilot', 'cursor', 'perplexity', 'generic',
]);

const AudienceSchema = z.enum(['beginner', 'general', 'expert', 'executive']);

const FormatSchema = z.enum([
  'free-text', 'bullet-list', 'numbered-list', 'table',
  'code', 'json', 'markdown', 'essay', 'summary',
  'qa-pairs', 'step-by-step',
]);

const LengthSchema = z.enum(['brief', 'medium', 'long']);
const ToneSchema = z.enum(['neutral', 'formal', 'casual', 'technical', 'persuasive']);

const ExampleSchema = z.object({
  input: z.string(),
  output: z.string(),
});

const BodySchema = z.object({
  problem: z.string().min(1, 'problem is required'),
  desiredOutcome: z.string().default(''),
  targetProvider: TargetProviderSchema,
  audience: AudienceSchema.optional(),
  outputFormat: FormatSchema.optional(),
  outputLength: LengthSchema.optional(),
  mustInclude: z.array(z.string()).optional(),
  mustAvoid: z.array(z.string()).optional(),
  tone: ToneSchema.optional(),
  starterPrompt: z.string().optional(),
  examples: z.array(ExampleSchema).optional(),
});

export async function POST(req: NextRequest) {
  try {
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

    const result = buildPrompt(parsed.data as StudioRequest);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
