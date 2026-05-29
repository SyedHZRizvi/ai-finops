import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    promptLog: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    budget: {
      findMany: vi.fn(),
    },
  },
}));

import { detectAnomalies } from '@/lib/anomaly';
import { prisma } from '@/lib/db';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

interface LogRow {
  id: string;
  timestamp: Date;
  appName: string | null;
  model: string;
  totalCost: number;
  promptText: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
}

function logRow(overrides: Partial<LogRow> = {}): LogRow {
  return {
    id: overrides.id ?? `id-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: overrides.timestamp ?? new Date(),
    appName: overrides.appName ?? null,
    model: overrides.model ?? 'gpt-4o',
    totalCost: overrides.totalCost ?? 0.001,
    promptText: overrides.promptText ?? 'sample prompt',
    inputTokens: overrides.inputTokens ?? 100,
    outputTokens: overrides.outputTokens ?? 200,
    latencyMs: overrides.latencyMs ?? null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock returns: empty for findMany, zero aggregate.
  (prisma.promptLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.promptLog.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
    _sum: { totalCost: 0 },
  });
  (prisma.budget.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

// Set up a controlled `findMany` that branches on the `where.timestamp.gte`
// boundary so each detector can be tested in isolation. Detectors call:
//   - cost-spike: window 8d
//   - new-model: 24h then `<since`
//   - expensive-prompt: 24h with `totalCost: { gt: 1 }`
//   - latency-spike: 24h with `latencyMs: { not: null }`
// We dispatch by checking which arguments are passed.
function setupFindManyByCase(handlers: {
  costSpike?: LogRow[];
  newModelRecent?: { model: string }[];
  newModelPrior?: { model: string }[];
  expensivePrompt?: LogRow[];
  latency?: LogRow[];
}): void {
  (prisma.promptLog.findMany as ReturnType<typeof vi.fn>).mockImplementation(
    (args: any) => {
      const w = args?.where ?? {};
      // expensive-prompt: where { totalCost: { gt: 1 } }
      if (w.totalCost?.gt !== undefined) return Promise.resolve(handlers.expensivePrompt ?? []);
      // latency-spike: where { latencyMs: { not: null } }
      if (w.latencyMs !== undefined) return Promise.resolve(handlers.latency ?? []);
      // new-model: distinct: ['model']. Differentiate by timestamp.gte vs timestamp.lt.
      if (args?.distinct?.includes('model')) {
        if (w.timestamp?.gte) return Promise.resolve(handlers.newModelRecent ?? []);
        if (w.timestamp?.lt) return Promise.resolve(handlers.newModelPrior ?? []);
      }
      // Default: cost-spike (gte over 8d window).
      return Promise.resolve(handlers.costSpike ?? []);
    },
  );
}

describe('detectAnomalies() — cost-spike detector', () => {
  it('emits when last 24h > 2x rolling avg AND > $0.50', async () => {
    const now = Date.now();
    const today = new Date(now);
    const rows: LogRow[] = [];
    // Today (1 row): $5
    rows.push(logRow({ id: 'today', timestamp: today, totalCost: 5 }));
    // Prior 7 days, $0.10 each → avg = $0.10. Ratio = 50x.
    for (let i = 1; i <= 7; i++) {
      rows.push(
        logRow({
          id: `d-${i}`,
          timestamp: new Date(now - i * MS_PER_DAY),
          totalCost: 0.1,
        }),
      );
    }
    setupFindManyByCase({ costSpike: rows });
    const out = await detectAnomalies();
    const spike = out.find((a) => a.kind === 'cost-spike');
    expect(spike).toBeDefined();
    // 50x is critical and $5 ≥ $5 critical-abs threshold → severity = critical.
    expect(spike?.severity).toBe('critical');
  });
});

describe('detectAnomalies() — new-model detector', () => {
  it('emits for a model that has never been seen before', async () => {
    setupFindManyByCase({
      newModelRecent: [{ model: 'gpt-5-preview' }, { model: 'gpt-4o' }],
      newModelPrior: [{ model: 'gpt-4o' }],
    });
    const out = await detectAnomalies();
    const newModel = out.find((a) => a.kind === 'new-model');
    expect(newModel).toBeDefined();
    expect(newModel?.title).toContain('gpt-5-preview');
    expect(newModel?.severity).toBe('info');
  });
});

describe('detectAnomalies() — expensive-prompt detector', () => {
  it('emits one event per row with totalCost > $1', async () => {
    setupFindManyByCase({
      expensivePrompt: [
        logRow({
          id: 'big-1',
          totalCost: 2.5,
          model: 'gpt-4o',
          promptText: 'Generate a 50-page report on the entire codebase.',
          inputTokens: 5_000,
          outputTokens: 8_000,
        }),
      ],
    });
    const out = await detectAnomalies();
    const expensive = out.find((a) => a.kind === 'expensive-prompt');
    expect(expensive).toBeDefined();
    expect(expensive?.severity).toBe('warn');
    expect(expensive?.scopeKey).toBe('expensive-prompt:big-1');
  });
});

describe('detectAnomalies() — budget-breach detector', () => {
  it('emits a critical event when MTD spending exceeds the cap', async () => {
    (prisma.budget.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'b-1',
        name: 'Global cap',
        scope: 'global',
        scopeValue: null,
        monthlyLimit: 100,
        currency: 'USD',
        isActive: true,
      },
    ]);
    (prisma.promptLog.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: { totalCost: 120 },
    });
    const out = await detectAnomalies();
    const breach = out.find((a) => a.kind === 'budget-breach');
    expect(breach).toBeDefined();
    expect(breach?.severity).toBe('critical');
    expect(breach?.metadata.monthToDate).toBe(120);
  });
});

describe('detectAnomalies() — latency-spike detector', () => {
  it('emits when last-hour avg latency > 3x baseline AND both windows have ≥ 10 samples', async () => {
    const now = Date.now();
    const rows: LogRow[] = [];
    // 12 last-hour samples at 9000ms.
    for (let i = 0; i < 12; i++) {
      rows.push(
        logRow({
          id: `hour-${i}`,
          timestamp: new Date(now - 10 * 60 * 1000), // 10 min ago — within last hour
          latencyMs: 9000,
        }),
      );
    }
    // 12 baseline samples at 1000ms (1.5h - 12h ago — outside last hour).
    for (let i = 0; i < 12; i++) {
      rows.push(
        logRow({
          id: `base-${i}`,
          timestamp: new Date(now - (2 + i) * MS_PER_HOUR),
          latencyMs: 1000,
        }),
      );
    }
    setupFindManyByCase({ latency: rows });
    const out = await detectAnomalies();
    const lat = out.find((a) => a.kind === 'latency-spike');
    expect(lat).toBeDefined();
    expect(lat?.severity).toBe('warn');
    // 9000/1000 = 9x.
    expect(lat?.metadata.ratio).toBeGreaterThanOrEqual(3);
  });
});

describe('scopeKey shape', () => {
  it('encodes detector kind + identity in the scopeKey for dedupe', async () => {
    setupFindManyByCase({
      expensivePrompt: [
        logRow({
          id: 'row-abc',
          totalCost: 1.5,
          promptText: 'Run heavy analysis.',
          model: 'gpt-4o',
        }),
      ],
    });
    const out = await detectAnomalies();
    const expensive = out.find((a) => a.kind === 'expensive-prompt');
    expect(expensive?.scopeKey).toMatch(/^expensive-prompt:/);
    expect(expensive?.scopeKey).toBe('expensive-prompt:row-abc');
  });
});
