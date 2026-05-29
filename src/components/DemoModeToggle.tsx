'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface DemoStatus {
  active: boolean;
  demoRowCount: number;
  realRowCount: number;
}

interface SeedResult {
  inserted?: number;
  skipped?: number;
  total?: number;
  deleted?: number;
  note?: string;
  error?: string;
}

const DEFAULT_SEED_COUNT = 300;

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

export function DemoModeToggle() {
  const router = useRouter();
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/demo', { cache: 'no-store' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Status check failed (${res.status})`);
      }
      const json = (await res.json()) as DemoStatus;
      setStatus(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load demo status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function seed() {
    setSeeding(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed', count: DEFAULT_SEED_COUNT }),
      });
      const json = (await res.json().catch(() => ({}))) as SeedResult;
      if (!res.ok) {
        throw new Error(json.error ?? `Seed failed (${res.status})`);
      }
      if (json.inserted && json.inserted > 0) {
        setMessage(`Inserted ${formatNum(json.inserted)} demo rows.`);
      } else if (json.skipped && json.skipped > 0) {
        setMessage(json.note ?? `${formatNum(json.skipped)} demo rows already present — nothing to add.`);
      } else {
        setMessage('Demo seed complete.');
      }
      await refresh();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  }

  async function clear() {
    const ok = confirm(
      'Delete all demo data? This removes only synthetic rows — your real data is not touched. Continue?',
    );
    if (!ok) return;
    setClearing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      const json = (await res.json().catch(() => ({}))) as SeedResult;
      if (!res.ok) {
        throw new Error(json.error ?? `Clear failed (${res.status})`);
      }
      setMessage(`Removed ${formatNum(json.deleted ?? 0)} demo rows.`);
      await refresh();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setClearing(false);
    }
  }

  const active = status?.active ?? false;
  const demoRows = status?.demoRowCount ?? 0;
  const realRows = status?.realRowCount ?? 0;

  return (
    <div className="card card-pad space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold tracking-tight">Demo data</h3>
            {active ? (
              <span className="chip chip-brand">Active</span>
            ) : (
              <span className="chip">Inactive</span>
            )}
          </div>
          <p className="text-xs text-inkDim mt-1.5 leading-relaxed max-w-xl">
            Generates a few hundred synthetic-but-realistic prompt logs so the dashboard,
            insights, and charts have something to render before a real provider is connected.
            Real ingested rows are untouched.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-panel2 border border-border rounded-xl p-3">
          <div className="label">Demo rows</div>
          <div className="stat-num-sm tabular-nums mt-1">
            {loading && status === null ? '—' : formatNum(demoRows)}
          </div>
        </div>
        <div className="bg-panel2 border border-border rounded-xl p-3">
          <div className="label">Real rows</div>
          <div className="stat-num-sm tabular-nums mt-1">
            {loading && status === null ? '—' : formatNum(realRows)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary disabled:opacity-50"
          disabled={seeding || clearing}
          onClick={seed}
        >
          {seeding ? 'Generating...' : 'Generate demo data'}
        </button>
        <button
          type="button"
          className="btn disabled:opacity-50"
          disabled={seeding || clearing || demoRows === 0}
          onClick={clear}
        >
          {clearing ? 'Clearing...' : 'Clear demo data'}
        </button>
        {!loading && (
          <button type="button" className="btn-ghost" onClick={() => void refresh()}>
            Refresh
          </button>
        )}
      </div>

      {message && <div className="text-xs text-good">{message}</div>}
      {error && <div className="text-xs text-bad">Error: {error}</div>}
    </div>
  );
}
