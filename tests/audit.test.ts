import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Prisma client. `recordAudit` calls `prisma.auditLogEntry.create`
// — we capture the args so we can assert on what got written without
// touching a real database.
vi.mock('@/lib/db', () => ({
  prisma: {
    auditLogEntry: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { listAudit, recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';

// Convenience handles to the typed mocks.
const createMock = prisma.auditLogEntry.create as unknown as ReturnType<typeof vi.fn>;
const findManyMock = prisma.auditLogEntry.findMany as unknown as ReturnType<typeof vi.fn>;
const countMock = prisma.auditLogEntry.count as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  createMock.mockReset();
  findManyMock.mockReset();
  countMock.mockReset();
  // Default: success no-op. Individual tests override.
  createMock.mockResolvedValue({});
});

function makeReq(headers: Record<string, string>): Request {
  return new Request('https://example.test/audit', { headers });
}

describe('recordAudit()', () => {
  it('writes the action, target, payload, ip, and userAgent', async () => {
    await recordAudit({
      req: makeReq({
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
        'user-agent': 'JestRunner/1.0',
      }),
      action: 'budget.create',
      targetKind: 'budget',
      targetId: 'budget_1',
      payload: { monthlyLimit: 500 },
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.action).toBe('budget.create');
    expect(arg.data.targetKind).toBe('budget');
    expect(arg.data.targetId).toBe('budget_1');
    expect(arg.data.ip).toBe('203.0.113.5');
    expect(arg.data.userAgent).toBe('JestRunner/1.0');
    const payloadStr = arg.data.payload as string;
    expect(JSON.parse(payloadStr)).toEqual({ monthlyLimit: 500 });
  });

  it('never throws even when the DB call rejects', async () => {
    createMock.mockRejectedValueOnce(new Error('db down'));
    // No try/catch around this — the assertion is that it resolves.
    await expect(
      recordAudit({ action: 'budget.create', payload: { x: 1 } }),
    ).resolves.toBeUndefined();
  });

  it('caps large payloads with a truncation marker', async () => {
    // 20 KB payload — well beyond the 8 KB cap.
    const huge = { blob: 'x'.repeat(20_000) };
    await recordAudit({ action: 'pricing.update', payload: huge });
    const arg = createMock.mock.calls[0]![0] as { data: { payload: string } };
    const parsed = JSON.parse(arg.data.payload) as { _truncated: boolean; _originalSize: number };
    expect(parsed._truncated).toBe(true);
    expect(parsed._originalSize).toBeGreaterThan(8 * 1024);
  });

  it('records actor=null when there is no request and no explicit actor', async () => {
    await recordAudit({ action: 'demo.seed', payload: { count: 100 } });
    const arg = createMock.mock.calls[0]![0] as { data: { actor: string | null } };
    expect(arg.data.actor).toBeNull();
  });

  it('prefers an explicit actor over the session inference', async () => {
    await recordAudit({
      action: 'auth.login',
      actor: 'cron',
      req: makeReq({ 'user-agent': 'cron' }),
    });
    const arg = createMock.mock.calls[0]![0] as { data: { actor: string | null } };
    expect(arg.data.actor).toBe('cron');
  });

  it('omits payload when undefined', async () => {
    await recordAudit({ action: 'auth.logout' });
    const arg = createMock.mock.calls[0]![0] as { data: { payload: string | null } };
    expect(arg.data.payload).toBeNull();
  });
});

describe('listAudit()', () => {
  it('returns items and total, with payload parsed from JSON', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: 'a1',
        actor: 'session',
        action: 'budget.create',
        targetId: 'b1',
        targetKind: 'budget',
        payload: JSON.stringify({ monthlyLimit: 500 }),
        ip: '203.0.113.5',
        userAgent: 'JestRunner/1.0',
        createdAt: new Date('2026-05-01T00:00:00Z'),
      },
    ]);
    countMock.mockResolvedValueOnce(1);
    const { items, total } = await listAudit();
    expect(total).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]!.payload).toEqual({ monthlyLimit: 500 });
    expect(items[0]!.action).toBe('budget.create');
  });

  it('clamps limit between 1 and 500', async () => {
    findManyMock.mockResolvedValueOnce([]);
    countMock.mockResolvedValueOnce(0);
    await listAudit({ limit: 9999 });
    const arg = findManyMock.mock.calls[0]![0] as { take: number };
    expect(arg.take).toBe(500);

    findManyMock.mockResolvedValueOnce([]);
    countMock.mockResolvedValueOnce(0);
    await listAudit({ limit: -5 });
    const arg2 = findManyMock.mock.calls[1]![0] as { take: number };
    expect(arg2.take).toBe(1);
  });

  it('returns an empty page when Prisma throws', async () => {
    findManyMock.mockRejectedValueOnce(new Error('db down'));
    countMock.mockResolvedValueOnce(0);
    const { items, total } = await listAudit();
    expect(items).toEqual([]);
    expect(total).toBe(0);
  });
});
