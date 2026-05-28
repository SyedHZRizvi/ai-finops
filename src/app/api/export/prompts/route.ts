import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { toCsv, type CsvColumn } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 50_000;
// Cells with multi-paragraph prompt/response text wreak havoc in Excel and
// Google Sheets — line breaks survive but column widths explode. Clip them.
const TEXT_CLIP = 200;

const QuerySchema = z.object({
  category: z.string().optional(),
  complexity: z.string().optional(),
  model: z.string().optional(),
  search: z.string().optional(),
  tags: z.string().optional(),
  period: z.enum(['24h', '7d', '30d', 'all']).optional(),
  format: z.enum(['csv', 'json']).default('csv'),
});

function periodToSince(period: '24h' | '7d' | '30d' | 'all'): Date | null {
  const now = Date.now();
  switch (period) {
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case 'all':
      return null;
  }
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function clip(text: string | null | undefined, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

const COLUMNS: CsvColumn[] = [
  { key: 'id', label: 'id' },
  { key: 'timestamp', label: 'timestamp' },
  { key: 'appName', label: 'appName' },
  { key: 'userId', label: 'userId' },
  { key: 'model', label: 'model' },
  { key: 'provider', label: 'provider' },
  { key: 'category', label: 'category' },
  { key: 'complexity', label: 'complexity' },
  { key: 'complexityScore', label: 'complexityScore' },
  { key: 'inputTokens', label: 'inputTokens' },
  { key: 'outputTokens', label: 'outputTokens' },
  { key: 'totalTokens', label: 'totalTokens' },
  { key: 'totalCost', label: 'totalCost' },
  { key: 'latencyMs', label: 'latencyMs' },
  { key: 'potentialSavedTokens', label: 'potentialSavedTokens' },
  { key: 'potentialSavedCost', label: 'potentialSavedCost' },
  { key: 'tags', label: 'tags' },
  { key: 'callCount', label: 'callCount' },
];

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid query', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { category, complexity, model, search, tags, period, format } = parsed.data;

    const where: Prisma.PromptLogWhereInput = {};
    if (category) where.category = category;
    if (complexity) where.complexity = complexity;
    if (model) where.model = model;
    if (search) where.promptText = { contains: search, mode: 'insensitive' };
    if (tags) {
      // tags column is a comma-separated free-form string. Match each
      // supplied tag (comma-separated in the query) with substring contains.
      const wanted = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      if (wanted.length > 0) {
        where.AND = wanted.map((t) => ({
          tags: { contains: t, mode: 'insensitive' as const },
        }));
      }
    }
    if (period) {
      const since = periodToSince(period);
      if (since) where.timestamp = { gte: since };
    }

    const items = await prisma.promptLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: MAX_ROWS,
      select: {
        id: true,
        timestamp: true,
        appName: true,
        userId: true,
        model: true,
        provider: true,
        promptText: true,
        responseText: true,
        category: true,
        complexity: true,
        complexityScore: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        totalCost: true,
        latencyMs: true,
        potentialSavedTokens: true,
        potentialSavedCost: true,
        tags: true,
        callCount: true,
      },
    });

    const rows = items.map((it) => ({
      id: it.id,
      timestamp: it.timestamp.toISOString(),
      appName: it.appName ?? '',
      userId: it.userId ?? '',
      model: it.model,
      provider: it.provider ?? '',
      category: it.category,
      complexity: it.complexity,
      complexityScore: it.complexityScore,
      inputTokens: it.inputTokens,
      outputTokens: it.outputTokens,
      totalTokens: it.totalTokens,
      totalCost: it.totalCost,
      latencyMs: it.latencyMs ?? '',
      potentialSavedTokens: it.potentialSavedTokens,
      potentialSavedCost: it.potentialSavedCost,
      tags: it.tags ?? '',
      callCount: it.callCount,
      promptText: clip(it.promptText, TEXT_CLIP),
      responseText: clip(it.responseText, TEXT_CLIP),
    }));

    const filename = `prompts-${todayStamp()}.${format}`;

    if (format === 'json') {
      return new NextResponse(JSON.stringify(rows, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // For CSV, also include promptText/responseText (clipped) at the end so
    // the file is useful for spot-checking without the cells blowing up
    // Excel layouts.
    const csvColumns: CsvColumn[] = [
      ...COLUMNS,
      { key: 'promptText', label: 'promptText' },
      { key: 'responseText', label: 'responseText' },
    ];
    const csv = toCsv(rows, csvColumns);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
