'use client';

// Connected Slack workspaces table with revoke action. The list is
// rendered by the /slack server component from listInstallations(),
// passed in as a serialized array of plain objects so this client
// component stays free of any Prisma types.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SlackInstallationRow {
  id: string;
  teamId: string;
  teamName: string | null;
  /** ISO date string. */
  installedAt: string;
  isActive: boolean;
}

interface Props {
  items: SlackInstallationRow[];
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return `${Math.max(0, diffSec)}s ago`;
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

export function SlackInstallationsList({ items }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRevoke(id: string, teamName: string | null) {
    const label = teamName || id;
    if (
      !confirm(
        `Revoke AI FinOps access for "${label}"? The workspace will need to re-install to use slash commands again.`,
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/slack/installations/${encodeURIComponent(id)}`, {
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

  if (items.length === 0) {
    return (
      <div className="card card-pad text-sm text-muted">
        No workspaces installed yet. Click <strong>Add to Slack</strong> above to get started.
      </div>
    );
  }

  return (
    <div className="card fade-up-delay-1">
      {error && (
        <div className="card-pad border-b border-border bg-bad/5 text-sm text-bad">{error}</div>
      )}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Workspace</th>
              <th>Team ID</th>
              <th>Installed</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className={it.isActive ? '' : 'opacity-50'}>
                <td className="font-medium">{it.teamName || <span className="text-muted">(unnamed)</span>}</td>
                <td className="font-mono text-xs">{it.teamId}</td>
                <td className="text-xs text-inkDim">{formatRelative(it.installedAt)}</td>
                <td>
                  {it.isActive ? (
                    <span className="chip chip-good">Active</span>
                  ) : (
                    <span className="chip chip-bad">Revoked</span>
                  )}
                </td>
                <td className="text-right">
                  {it.isActive ? (
                    <button
                      type="button"
                      className="btn-ghost text-bad hover:text-bad"
                      onClick={() => onRevoke(it.id, it.teamName)}
                      disabled={busyId === it.id}
                    >
                      {busyId === it.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
