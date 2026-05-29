// /audit — append-only log of every mutating dashboard action.
//
// Server component: reads filter params from the URL, fetches the page slice
// from our own /api/audit endpoint, and renders the filter bar + table.
//
// Why fetch via the API route instead of calling listAudit() directly?
// Symmetry — the API is the public contract. If we ever swap the backing
// store we only have to keep the API stable. The localhost loopback is
// cheap on Vercel-style edge runtimes.

import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { AuditFilterBar } from '@/components/AuditFilterBar';
import { AuditTable, type AuditTableItem } from '@/components/AuditTable';
import type { AuditAction, AuditTargetKind } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

interface AuditApiResponse {
  items: AuditTableItem[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
}

interface AuditSearchParams {
  limit?: string;
  offset?: string;
  action?: string;
  targetKind?: string;
  actor?: string;
  since?: string;
}

const VALID_ACTIONS = new Set<AuditAction>([
  'budget.create',
  'budget.update',
  'budget.delete',
  'credential.create',
  'credential.delete',
  'anomaly.resolve',
  'anomaly.create',
  'allocation.create',
  'allocation.update',
  'allocation.delete',
  'apikey.create',
  'apikey.revoke',
  'apikey.update',
  'pricing.update',
  'demo.seed',
  'demo.clear',
  'import.run',
  'annotation.upsert',
  'annotation.delete',
  'snapshot.capture',
  'snapshot.delete',
  'auth.login',
  'auth.logout',
  'auth.failed',
]);

const VALID_KINDS = new Set<AuditTargetKind>([
  'budget',
  'credential',
  'anomaly',
  'allocation',
  'apikey',
  'pricing',
  'demo',
  'import',
  'annotation',
  'snapshot',
  'auth',
]);

function pickAction(raw: string | undefined): AuditAction | '' {
  if (!raw) return '';
  return VALID_ACTIONS.has(raw as AuditAction) ? (raw as AuditAction) : '';
}

function pickKind(raw: string | undefined): AuditTargetKind | '' {
  if (!raw) return '';
  return VALID_KINDS.has(raw as AuditTargetKind) ? (raw as AuditTargetKind) : '';
}

/**
 * Build the upstream query string from the page's searchParams. We only
 * forward values we recognize so a malformed URL can't be used to probe
 * the underlying schema.
 */
function buildQuery(params: AuditSearchParams): string {
  const qs = new URLSearchParams();
  qs.set('limit', '50');
  const action = pickAction(params.action);
  if (action) qs.set('action', action);
  const kind = pickKind(params.targetKind);
  if (kind) qs.set('targetKind', kind);
  if (params.actor) qs.set('actor', params.actor);
  if (params.since) qs.set('since', params.since);
  if (params.offset) {
    const n = Number.parseInt(params.offset, 10);
    if (Number.isFinite(n) && n > 0) qs.set('offset', String(n));
  }
  if (params.limit) {
    const n = Number.parseInt(params.limit, 10);
    if (Number.isFinite(n) && n > 0 && n <= 500) qs.set('limit', String(n));
  }
  return qs.toString();
}

async function loadAudit(params: AuditSearchParams): Promise<{
  data: AuditApiResponse | null;
  error: string | null;
}> {
  const qs = buildQuery(params);
  try {
    const r = await fetch(`${BASE_URL}/api/audit?${qs}`, { cache: 'no-store' });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return { data: null, error: j.error ?? `Status ${r.status}` };
    }
    const json = (await r.json()) as AuditApiResponse;
    return { data: json, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: AuditSearchParams;
}) {
  const params = searchParams ?? {};
  const { data, error } = await loadAudit(params);

  const action = pickAction(params.action);
  const targetKind = pickKind(params.targetKind);
  const actor = typeof params.actor === 'string' ? params.actor : '';
  const since = typeof params.since === 'string' ? params.since : '';

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 50;
  const offset = data?.offset ?? 0;
  const hasFilters = action !== '' || targetKind !== '' || actor !== '' || since !== '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        gradient
        subtitle="Every mutating dashboard action — who, when, what, from where. Append-only. Use the filters to answer questions like “who deleted the Anthropic credential last Friday?” or “when did someone change the Opus pricing?”."
      />

      <AuditFilterBar initial={{ action, targetKind, actor, since }} />

      {error && (
        <div className="card card-pad border-warn/40 bg-warn/5 text-sm text-warn">
          Couldn&apos;t load audit log: {error}
        </div>
      )}

      {!error && items.length === 0 && !hasFilters && (
        <EmptyState
          title="No audit entries yet"
          subtitle="The audit log will populate automatically once someone in the dashboard creates a budget, revokes an API key, or runs an import. There's nothing to configure."
          variant="good"
        />
      )}

      {!error && (items.length > 0 || hasFilters) && (
        <AuditTable items={items} total={total} limit={limit} offset={offset} />
      )}
    </div>
  );
}
