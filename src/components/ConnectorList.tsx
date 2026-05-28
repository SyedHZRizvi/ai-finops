'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ProviderId = 'anthropic' | 'openai' | 'google' | 'azure' | 'gateway';

export interface CredentialDTO {
  id: string;
  provider: ProviderId;
  label: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImportJobDTO {
  id: string;
  provider: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  recordsImported: number;
  errorMessage: string | null;
  rangeFrom: string | null;
  rangeTo: string | null;
}

export interface ImporterInfo {
  provider: string;
  label: string;
  implemented: boolean;
}

interface OutcomeState {
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  recordsImported?: number;
  error?: string;
  warnings?: string[];
}

const PROVIDER_ACCENT: Record<string, { dot: string; bg: string; border: string; text: string }> = {
  anthropic: { dot: '#f59e0b', bg: 'bg-amber/10', border: 'border-amber/30', text: 'text-amber' },
  openai: { dot: '#22c55e', bg: 'bg-good/10', border: 'border-good/30', text: 'text-good' },
  google: { dot: '#3b82f6', bg: 'bg-blue/10', border: 'border-blue/30', text: 'text-blue' },
  azure: { dot: '#22d3ee', bg: 'bg-brand2/10', border: 'border-brand2/30', text: 'text-brand2' },
  gateway: { dot: '#8b5cf6', bg: 'bg-brand/10', border: 'border-brand/30', text: 'text-brandLight' },
};

function getProviderAccent(provider: string) {
  return PROVIDER_ACCENT[provider] ?? { dot: '#7b829a', bg: 'bg-panel2', border: 'border-border', text: 'text-muted' };
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} month${month === 1 ? '' : 's'} ago`;
  const year = Math.floor(day / 365);
  return `${year} year${year === 1 ? '' : 's'} ago`;
}

function formatDuration(startedIso: string, finishedIso: string | null): string {
  if (!finishedIso) return '—';
  const ms = new Date(finishedIso).getTime() - new Date(startedIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const min = Math.floor(s / 60);
  const remS = Math.round(s - min * 60);
  return `${min}m ${remS}s`;
}

function truncate(s: string | null, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function statusChipClass(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'chip-good';
    case 'failed':
      return 'chip-bad';
    case 'running':
    case 'pending':
      return 'chip-warn';
    default:
      return '';
  }
}

export function ConnectorList({
  credentials,
  jobs,
  importers,
}: {
  credentials: CredentialDTO[];
  jobs: ImportJobDTO[];
  importers: ImporterInfo[];
}) {
  const router = useRouter();
  const [outcomes, setOutcomes] = useState<Record<string, OutcomeState>>({});
  const [editing, setEditing] = useState<string | null>(null);

  function lastSuccessFor(cred: CredentialDTO): ImportJobDTO | undefined {
    return jobs.find((j) => j.provider === cred.provider && j.status === 'succeeded');
  }

  async function runImport(cred: CredentialDTO) {
    setOutcomes((p) => ({ ...p, [cred.id]: { status: 'running' } }));
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: cred.provider, credentialId: cred.id }),
      });
      const json = (await res.json()) as {
        recordsImported?: number;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok) {
        setOutcomes((p) => ({
          ...p,
          [cred.id]: { status: 'failed', error: json.error ?? `Import failed (${res.status})` },
        }));
        return;
      }
      setOutcomes((p) => ({
        ...p,
        [cred.id]: {
          status: 'succeeded',
          recordsImported: json.recordsImported ?? 0,
          warnings: json.warnings ?? [],
        },
      }));
      router.refresh();
    } catch (err) {
      setOutcomes((p) => ({
        ...p,
        [cred.id]: { status: 'failed', error: err instanceof Error ? err.message : 'Import failed' },
      }));
    }
  }

  async function remove(cred: CredentialDTO) {
    const ok = confirm(
      `Delete ${cred.provider}${cred.label ? ` (${cred.label})` : ''} credential? This cannot be undone.`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/credentials?id=${encodeURIComponent(cred.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        alert(body.error ?? 'Delete failed');
        return;
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3 fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Connected providers</h2>
            <div className="text-xs text-muted mt-1">
              Re-run imports manually. Keys are encrypted at rest.
            </div>
          </div>
        </div>
        {credentials.length === 0 ? (
          <div className="card card-pad text-sm text-muted">
            No providers connected yet. Add one below.
          </div>
        ) : (
          credentials.map((c) => (
            <CredentialCard
              key={c.id}
              cred={c}
              outcome={outcomes[c.id] ?? { status: 'idle' }}
              isEditing={editing === c.id}
              lastSuccess={lastSuccessFor(c)}
              onEdit={() => setEditing(c.id)}
              onCancelEdit={() => setEditing(null)}
              onReplaced={() => {
                setEditing(null);
                router.refresh();
              }}
              onRunImport={() => runImport(c)}
              onDelete={() => remove(c)}
            />
          ))
        )}
      </section>

      <section className="space-y-3 fade-up-delay-1">
        <h2 className="text-lg font-bold tracking-tight">Add a connector</h2>
        <AddConnectorForm importers={importers} onAdded={() => router.refresh()} />
      </section>

      <section className="space-y-3 fade-up-delay-2">
        <h2 className="text-lg font-bold tracking-tight">Recent imports</h2>
        <div className="card">
          {jobs.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted">No imports yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th className="text-right">Records</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const accent = getProviderAccent(j.provider);
                    return (
                      <tr key={j.id}>
                        <td className="capitalize text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: accent.dot }}
                              aria-hidden
                            />
                            {j.provider}
                          </div>
                        </td>
                        <td className="text-xs text-muted whitespace-nowrap">
                          {formatRelative(j.startedAt)}
                        </td>
                        <td className="text-xs text-muted tabular-nums whitespace-nowrap">
                          {formatDuration(j.startedAt, j.finishedAt)}
                        </td>
                        <td>
                          <span className={`chip capitalize ${statusChipClass(j.status)}`}>
                            {j.status}
                          </span>
                        </td>
                        <td className="text-right tabular-nums font-semibold">{j.recordsImported}</td>
                        <td className="text-xs text-muted max-w-xs">
                          {truncate(j.errorMessage, 60)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3 fade-up-delay-3">
        <h2 className="text-lg font-bold tracking-tight">CSV import</h2>
        <CsvImportCard onComplete={() => router.refresh()} />
      </section>
    </div>
  );
}

function CredentialCard({
  cred,
  outcome,
  isEditing,
  lastSuccess,
  onEdit,
  onCancelEdit,
  onReplaced,
  onRunImport,
  onDelete,
}: {
  cred: CredentialDTO;
  outcome: OutcomeState;
  isEditing: boolean;
  lastSuccess: ImportJobDTO | undefined;
  onEdit: () => void;
  onCancelEdit: () => void;
  onReplaced: () => void;
  onRunImport: () => void;
  onDelete: () => void;
}) {
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const accent = getProviderAccent(cred.provider);

  async function replaceKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim()) {
      setErr('API key is required');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: cred.provider,
          label: cred.label ?? undefined,
          apiKey: newKey.trim(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      setNewKey('');
      onReplaced();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${accent.bg} ${accent.border}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${cred.isActive ? 'pulse-glow' : ''}`}
              style={{ backgroundColor: accent.dot }}
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-semibold capitalize">{cred.provider}</div>
              {cred.label && <span className="chip">{cred.label}</span>}
              {!cred.isActive && <span className="chip text-muted">inactive</span>}
            </div>
            <div className="text-xs text-muted mt-1">
              {lastSuccess
                ? `Last imported: ${formatRelative(lastSuccess.startedAt)} (${lastSuccess.recordsImported} records)`
                : 'No successful imports yet'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            onClick={onRunImport}
            disabled={outcome.status === 'running'}
          >
            {outcome.status === 'running' ? 'Importing...' : 'Run Import'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={isEditing ? onCancelEdit : onEdit}
          >
            {isEditing ? 'Cancel' : 'Edit Key'}
          </button>
          <button type="button" className="btn" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {isEditing && (
        <form onSubmit={replaceKey} className="mt-4 space-y-3">
          <label className="label block">New API key</label>
          <input
            type="password"
            autoComplete="off"
            className="input font-mono text-xs"
            placeholder="Paste replacement key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          {err && <div className="text-xs text-bad">{err}</div>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || !newKey.trim()}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" className="btn" onClick={onCancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <OutcomeView outcome={outcome} />
    </div>
  );
}

function AddConnectorForm({
  importers,
  onAdded,
}: {
  importers: ImporterInfo[];
  onAdded: () => void;
}) {
  const implemented = importers.filter((i) => i.implemented && i.provider !== 'csv');
  const [provider, setProvider] = useState<string>(implemented[0]?.provider ?? '');
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!provider) {
      setErr('Pick a provider');
      return;
    }
    if (!apiKey.trim()) {
      setErr('API key is required');
      return;
    }
    setSaving(true);
    setErr(null);
    setOk(false);
    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim(),
          label: label.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      setApiKey('');
      setLabel('');
      setOk(true);
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (implemented.length === 0) {
    return (
      <div className="card card-pad text-sm text-muted">
        No importers are available in this build.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card card-pad grid grid-cols-1 md:grid-cols-4 gap-3">
      <div>
        <label className="label block mb-2">Provider</label>
        <select
          className="input"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          {implemented.map((i) => (
            <option key={i.provider} value={i.provider}>
              {i.label}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="label block mb-2">API key</label>
        <input
          type="password"
          autoComplete="off"
          className="input font-mono text-xs"
          placeholder="Paste admin API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
      <div>
        <label className="label block mb-2">Label</label>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="prod, staging"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            type="submit"
            disabled={saving || !apiKey.trim()}
            className="btn-primary disabled:opacity-50 shrink-0"
          >
            {saving ? '...' : 'Add'}
          </button>
        </div>
      </div>
      {err && <div className="md:col-span-4 text-xs text-bad">{err}</div>}
      {ok && <div className="md:col-span-4 text-xs text-good">Connector added.</div>}
    </form>
  );
}

function CsvImportCard({ onComplete }: { onComplete: () => void }) {
  const [csvText, setCsvText] = useState('');
  const [outcome, setOutcome] = useState<OutcomeState>({ status: 'idle' });

  async function submit() {
    if (!csvText.trim()) {
      setOutcome({ status: 'failed', error: 'Paste CSV content first' });
      return;
    }
    setOutcome({ status: 'running' });
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'csv', csvText }),
      });
      const json = (await res.json()) as {
        recordsImported?: number;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok) {
        setOutcome({ status: 'failed', error: json.error ?? `Import failed (${res.status})` });
        return;
      }
      setOutcome({
        status: 'succeeded',
        recordsImported: json.recordsImported ?? 0,
        warnings: json.warnings ?? [],
      });
      onComplete();
    } catch (err) {
      setOutcome({
        status: 'failed',
        error: err instanceof Error ? err.message : 'Import failed',
      });
    }
  }

  return (
    <div className="card card-pad space-y-3">
      <div className="text-xs text-muted">
        Paste a CSV export with columns like timestamp, model, input_tokens, output_tokens,
        total_cost. Header row required.
      </div>
      <textarea
        className="input font-mono text-xs min-h-[160px]"
        placeholder="timestamp,model,input_tokens,output_tokens,total_cost"
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={outcome.status === 'running' || !csvText.trim()}
          className="btn-primary disabled:opacity-50"
        >
          {outcome.status === 'running' ? 'Importing...' : 'Import CSV'}
        </button>
        {csvText && (
          <button type="button" className="btn" onClick={() => setCsvText('')}>
            Clear
          </button>
        )}
      </div>
      <OutcomeView outcome={outcome} />
    </div>
  );
}

function OutcomeView({ outcome }: { outcome: OutcomeState }) {
  if (outcome.status === 'idle') return null;
  if (outcome.status === 'running') {
    return (
      <div className="text-xs text-muted mt-3 flex items-center gap-2">
        <span className="inline-block w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        Pulling data from the provider...
      </div>
    );
  }
  if (outcome.status === 'failed') {
    return <div className="text-xs text-bad mt-3">Error: {outcome.error}</div>;
  }
  return (
    <div className="mt-3 space-y-1.5">
      <div className="text-xs text-good font-semibold">
        Imported {outcome.recordsImported ?? 0} record{outcome.recordsImported === 1 ? '' : 's'}.
      </div>
      {outcome.warnings && outcome.warnings.length > 0 && (
        <ul className="text-xs text-warn list-disc list-inside space-y-0.5">
          {outcome.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
