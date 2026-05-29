'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiKeyEditModal } from './ApiKeyEditModal';

export interface ApiKeyListItem {
  id: string;
  label: string;
  /** Redacted display value, e.g. `ftk_abcd1234...`. */
  key: string;
  prefix: string;
  scopeApps: string[] | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdBy: string | null;
}

interface ApiKeyListProps {
  items: ApiKeyListItem[];
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 0) {
    // Future date — used for `expiresAt`.
    return `in ${formatRelative(new Date(then - 2 * (then - Date.now())).toISOString())}`;
  }
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.round(diffMonth / 12)}y ago`;
}

function formatExpiry(iso: string | null): { text: string; expired: boolean } {
  if (!iso) return { text: 'Never', expired: false };
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return { text: '—', expired: false };
  const diffMs = then - Date.now();
  if (diffMs <= 0) return { text: 'Expired', expired: true };
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return { text: `in ${diffSec}s`, expired: false };
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return { text: `in ${diffMin}m`, expired: false };
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return { text: `in ${diffHr}h`, expired: false };
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return { text: `in ${diffDay}d`, expired: false };
  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12) return { text: `in ${diffMonth}mo`, expired: false };
  return { text: `in ${Math.round(diffMonth / 12)}y`, expired: false };
}

interface RowProps {
  item: ApiKeyListItem;
  onRevoke: (id: string) => void;
  onReactivate: (id: string) => void;
  onEdit: (item: ApiKeyListItem) => void;
  busy: boolean;
  inactive: boolean;
}

function Row({ item, onRevoke, onReactivate, onEdit, busy, inactive }: RowProps) {
  const expiry = formatExpiry(item.expiresAt);
  return (
    <tr className={inactive ? 'opacity-50' : ''}>
      <td className="font-medium">
        <div className="flex flex-col gap-0.5">
          <span>{item.label}</span>
          {item.createdBy && (
            <span className="text-xs text-muted">by {item.createdBy}</span>
          )}
        </div>
      </td>
      <td className="font-mono text-xs">{item.key}</td>
      <td>
        {item.scopeApps && item.scopeApps.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.scopeApps.map((a) => (
              <span key={a} className="chip chip-blue text-[10px] font-mono">
                {a}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted">Any app</span>
        )}
      </td>
      <td className="text-xs text-inkDim">{formatRelative(item.createdAt)}</td>
      <td className="text-xs text-inkDim">{formatRelative(item.lastUsedAt)}</td>
      <td className="text-xs">
        <span className={expiry.expired ? 'text-bad' : 'text-inkDim'}>
          {expiry.text}
        </span>
      </td>
      <td>
        {item.isActive ? (
          expiry.expired ? (
            <span className="chip chip-warn">Expired</span>
          ) : (
            <span className="chip chip-good">Active</span>
          )
        ) : (
          <span className="chip chip-bad">Revoked</span>
        )}
      </td>
      <td className="text-right">
        <div className="inline-flex gap-2">
          {item.isActive ? (
            <>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => onEdit(item)}
                disabled={busy}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn-ghost text-bad hover:text-bad"
                onClick={() => onRevoke(item.id)}
                disabled={busy}
              >
                {busy ? 'Revoking...' : 'Revoke'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onReactivate(item.id)}
              disabled={busy}
            >
              {busy ? 'Restoring...' : 'Restore'}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function ApiKeyList({ items }: ApiKeyListProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ApiKeyListItem | null>(null);

  // Active keys on top, revoked at the bottom so the operator sees what
  // matters first.
  const { active, inactive } = useMemo(() => {
    const a: ApiKeyListItem[] = [];
    const i: ApiKeyListItem[] = [];
    for (const item of items) {
      if (item.isActive) a.push(item);
      else i.push(item);
    }
    return { active: a, inactive: i };
  }, [items]);

  async function onRevoke(id: string) {
    if (!confirm('Revoke this API key? Any app still using it will fail to log on the next call.')) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/api-keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Revoke failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revoke failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onReactivate(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/api-keys/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Restore failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="card fade-up-delay-1">
        {error && (
          <div className="card-pad border-b border-border bg-bad/5 text-sm text-bad">
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Label</th>
                <th>Prefix</th>
                <th>Scope</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Expires</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  onRevoke={onRevoke}
                  onReactivate={onReactivate}
                  onEdit={setEditing}
                  busy={busyId === item.id}
                  inactive={false}
                />
              ))}
              {inactive.length > 0 && active.length > 0 && (
                <tr>
                  <td colSpan={8} className="text-[11px] uppercase tracking-wider text-muted font-semibold bg-panel2/50 py-2 px-4">
                    Revoked ({inactive.length})
                  </td>
                </tr>
              )}
              {inactive.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  onRevoke={onRevoke}
                  onReactivate={onReactivate}
                  onEdit={setEditing}
                  busy={busyId === item.id}
                  inactive
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ApiKeyEditModal
          initial={{ id: editing.id, label: editing.label, scopeApps: editing.scopeApps }}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}
