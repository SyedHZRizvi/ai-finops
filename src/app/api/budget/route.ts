import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Budget, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { evaluateBudget, type BudgetStatus } from '@/lib/budget';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const ScopeSchema = z.enum(['global', 'app', 'user']);

const PostBodySchema = z
  .object({
    scope: ScopeSchema,
    scopeValue: z.string().min(1).max(200).optional(),
    monthlyLimit: z.number().positive().finite(),
    currency: z.string().min(1).max(10).default('USD'),
    alertAt75: z.boolean().optional(),
    alertAt90: z.boolean().optional(),
    alertAt100: z.boolean().optional(),
    webhookUrl: z.string().url().max(2000).optional(),
  })
  .refine(
    (v) => v.scope === 'global' || (typeof v.scopeValue === 'string' && v.scopeValue.length > 0),
    { message: 'scopeValue is required for non-global budgets', path: ['scopeValue'] },
  );

const DeleteQuerySchema = z.object({
  id: z.string().min(1),
});

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function whereForBudget(b: Budget): Prisma.PromptLogWhereInput {
  const monthStart = startOfMonth(new Date());
  const base: Prisma.PromptLogWhereInput = { timestamp: { gte: monthStart } };
  if (b.scope === 'app' && b.scopeValue) base.appName = b.scopeValue;
  else if (b.scope === 'user' && b.scopeValue) base.userId = b.scopeValue;
  return base;
}

async function monthToDateFor(b: Budget): Promise<number> {
  const agg = await prisma.promptLog.aggregate({
    where: whereForBudget(b),
    _sum: { totalCost: true },
  });
  return agg._sum.totalCost ?? 0;
}

export async function GET(): Promise<NextResponse> {
  try {
    const budgets = await prisma.budget.findMany({
      where: { isActive: true },
      orderBy: [{ scope: 'asc' }, { scopeValue: 'asc' }],
    });

    const items: BudgetStatus[] = await Promise.all(
      budgets.map(async (b) => {
        const mtd = await monthToDateFor(b);
        return evaluateBudget(b, mtd);
      }),
    );

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = PostBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;
  // Global budgets always store scopeValue as null so the @@unique works.
  const scopeValue = body.scope === 'global' ? null : body.scopeValue ?? null;

  try {
    // Compound unique includes a nullable column; Prisma can't query it
    // through findUnique (the generated input requires non-null), so use
    // findFirst with an explicit predicate.
    const existing = await prisma.budget.findFirst({
      where: { scope: body.scope, scopeValue },
    });

    const data = {
      scope: body.scope,
      scopeValue,
      monthlyLimit: body.monthlyLimit,
      currency: body.currency,
      alertAt75: body.alertAt75 ?? true,
      alertAt90: body.alertAt90 ?? true,
      alertAt100: body.alertAt100 ?? true,
      webhookUrl: body.webhookUrl ?? null,
      isActive: true,
    };

    const saved = existing
      ? await prisma.budget.update({ where: { id: existing.id }, data })
      : await prisma.budget.create({ data });

    await recordAudit({
      req,
      action: existing ? 'budget.update' : 'budget.create',
      targetKind: 'budget',
      targetId: saved.id,
      payload: body,
    });

    const mtd = await monthToDateFor(saved);
    return NextResponse.json({ item: evaluateBudget(saved, mtd) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = DeleteQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  try {
    await prisma.budget.delete({ where: { id: parsed.data.id } });
    await recordAudit({
      req,
      action: 'budget.delete',
      targetKind: 'budget',
      targetId: parsed.data.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
