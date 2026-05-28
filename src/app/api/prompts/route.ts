import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
  category: z.string().optional(),
  complexity: z.string().optional(),
  model: z.string().optional(),
  search: z.string().optional(),
});

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
    const { limit, offset, category, complexity, model, search } = parsed.data;

    const where: Prisma.PromptLogWhereInput = {};
    if (category) where.category = category;
    if (complexity) where.complexity = complexity;
    if (model) where.model = model;
    // Audit M3: case-insensitive search so "Summarize" and "summarize" both match.
    if (search) where.promptText = { contains: search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.promptLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.promptLog.count({ where }),
    ]);

    const parsedItems = items.map((it) => ({
      ...it,
      dimensions: safeParse(it.dimensions, []),
      characteristics: safeParse(it.characteristics, {}),
      metadata: it.metadata ? safeParse(it.metadata, null) : null,
    }));

    return NextResponse.json({ items: parsedItems, total, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
