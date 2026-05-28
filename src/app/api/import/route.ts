import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { decrypt, getImporter } from '@/lib/importers';
import type { ImportedRecord } from '@/lib/importers';
import { ensurePricingLoaded } from '@/lib/pricing';

export const dynamic = 'force-dynamic';
// Provider imports involve external HTTP fetches and bulk DB writes; the
// default 10s vercel-style timeout is too tight.
export const maxDuration = 60;

const ProviderSchema = z.enum(['anthropic', 'openai', 'csv', 'google', 'azure']);

const BodySchema = z
  .object({
    credentialId: z.string().optional(),
    provider: ProviderSchema,
    rangeFrom: z.string().datetime().optional(),
    rangeTo: z.string().datetime().optional(),
    csvText: z.string().optional(),
  })
  .refine(
    (v) => v.provider === 'csv' || typeof v.credentialId === 'string',
    { message: 'credentialId is required for non-csv providers', path: ['credentialId'] },
  )
  .refine(
    (v) => v.provider !== 'csv' || (typeof v.csvText === 'string' && v.csvText.length > 0),
    { message: 'csvText is required when provider is csv', path: ['csvText'] },
  );

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

export async function POST(req: NextRequest) {
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
  const body = parsed.data;
  const rangeFrom = body.rangeFrom ? new Date(body.rangeFrom) : undefined;
  const rangeTo = body.rangeTo ? new Date(body.rangeTo) : undefined;

  const job = await prisma.importJob.create({
    data: {
      provider: body.provider,
      status: 'running',
      rangeFrom: rangeFrom ?? null,
      rangeTo: rangeTo ?? null,
    },
    select: { id: true },
  });

  try {
    let apiKey = '';
    if (body.provider !== 'csv') {
      if (!body.credentialId) {
        throw new Error('credentialId is required for this provider');
      }
      const cred = await prisma.credential.findUnique({
        where: { id: body.credentialId },
        select: { encryptedBlob: true, iv: true, authTag: true, provider: true },
      });
      if (!cred) throw new Error('Credential not found');
      if (cred.provider !== body.provider) {
        throw new Error(
          `Credential provider mismatch — credential is ${cred.provider}, import requested ${body.provider}`,
        );
      }
      apiKey = decrypt({
        encryptedBlob: cred.encryptedBlob,
        iv: cred.iv,
        authTag: cred.authTag,
      });
    }

    await ensurePricingLoaded();
    const importer = getImporter(body.provider);
    const result = await importer.run({
      apiKey,
      rangeFrom,
      rangeTo,
      csvText: body.csvText,
    });

    const records = result.records;
    let recordsImported = 0;

    if (records.length > 0) {
      // Best effort: try a single transaction first; fall back to per-row
      // creates on SQLite "too many parameters" or similar transient failures.
      try {
        await prisma.$transaction(
          records.map((r: ImportedRecord) =>
            prisma.promptLog.create({
              data: {
                timestamp: r.timestamp,
                appName: r.appName ?? null,
                userId: r.userId ?? null,
                model: r.model,
                provider: r.provider,
                promptText: r.promptText,
                responseText: r.responseText,
                inputTokens: r.inputTokens,
                outputTokens: r.outputTokens,
                totalTokens: r.totalTokens,
                inputCost: r.inputCost,
                outputCost: r.outputCost,
                totalCost: r.totalCost,
                category: r.category,
                complexity: r.complexity,
                complexityScore: r.complexityScore,
                dimensions: r.dimensions,
                characteristics: r.characteristics,
                latencyMs: r.latencyMs,
                metadata: r.metadata,
                potentialSavedTokens: r.potentialSavedTokens,
                potentialSavedCost: r.potentialSavedCost,
              },
            }),
          ),
        );
        recordsImported = records.length;
      } catch {
        for (const r of records) {
          await prisma.promptLog.create({
            data: {
              timestamp: r.timestamp,
              appName: r.appName ?? null,
              userId: r.userId ?? null,
              model: r.model,
              provider: r.provider,
              promptText: r.promptText,
              responseText: r.responseText,
              inputTokens: r.inputTokens,
              outputTokens: r.outputTokens,
              totalTokens: r.totalTokens,
              inputCost: r.inputCost,
              outputCost: r.outputCost,
              totalCost: r.totalCost,
              category: r.category,
              complexity: r.complexity,
              complexityScore: r.complexityScore,
              dimensions: r.dimensions,
              characteristics: r.characteristics,
              latencyMs: r.latencyMs,
              metadata: r.metadata,
              potentialSavedTokens: r.potentialSavedTokens,
              potentialSavedCost: r.potentialSavedCost,
            },
          });
          recordsImported += 1;
        }
      }
    }

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: 'succeeded',
        finishedAt: new Date(),
        recordsImported,
        rangeFrom: result.rawRangeFrom ?? rangeFrom ?? null,
        rangeTo: result.rawRangeTo ?? rangeTo ?? null,
      },
    });

    return NextResponse.json({
      jobId: job.id,
      status: 'succeeded',
      recordsImported,
      warnings: result.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: truncate(message, 500),
      },
    });
    // Audit M15: never echo crypto / decrypt internals (e.g. "iv must be 12
    // bytes, got 11") back to the client. Keep the detail server-side via
    // the ImportJob.errorMessage column, return a generic message externally.
    const externalMessage = /decrypt|cipher|iv|auth.?tag/i.test(message)
      ? 'Could not decrypt provider credentials. Verify FINOPS_ENCRYPTION_KEY has not changed.'
      : message;
    return NextResponse.json(
      { jobId: job.id, status: 'failed', error: externalMessage },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 20;
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 20;

    const items = await prisma.importJob.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
