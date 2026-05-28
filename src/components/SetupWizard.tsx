'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ProviderId = 'anthropic' | 'openai' | 'google' | 'azure';

interface ProviderDef {
  id: ProviderId;
  name: string;
  blurb: string;
  keyPlaceholder: string;
  helpText: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    blurb: 'Pulls per-day, per-model usage from the organization usage report.',
    keyPlaceholder: 'sk-ant-admin-...',
    helpText: 'Requires an admin API key from the Anthropic console.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    blurb: 'Pulls organization-wide usage and billing data.',
    keyPlaceholder: 'sk-...',
    helpText: 'Requires an organization-scoped admin API key.',
  },
  {
    id: 'google',
    name: 'Google (Vertex AI)',
    blurb: 'Pulls Gemini usage from Cloud Billing exports.',
    keyPlaceholder: 'AIza...',
    helpText: 'Requires a service account key with billing.viewer.',
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    blurb: 'Pulls usage from Azure Cost Management for OpenAI deployments.',
    keyPlaceholder: 'Cost Management bearer token',
    helpText: 'Requires a subscription-scoped reader token.',
  },
];

interface ConnectedCredential {
  id: string;
  provider: ProviderId;
  label: string | null;
}

interface ImportOutcome {
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  recordsImported?: number;
  error?: string;
  warnings?: string[];
}

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [connected, setConnected] = useState<ConnectedCredential[]>([]);

  return (
    <div className="space-y-4">
      <StepIndicator step={step} />
      {step === 1 && <Step1Welcome onNext={() => setStep(2)} onSkip={() => router.push('/')} />}
      {step === 2 && (
        <Step2Connect
          connected={connected}
          onConnected={(c) =>
            setConnected((prev) => {
              const without = prev.filter(
                (p) => !(p.provider === c.provider && (p.label ?? '') === (c.label ?? '')),
              );
              return [...without, c];
            })
          }
          onNext={() => setStep(3)}
          onSkip={() => router.push('/')}
        />
      )}
      {step === 3 && (
        <Step3Import
          connected={connected}
          onFinish={() => router.push('/')}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const items: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: 'Welcome' },
    { n: 2, label: 'Connect' },
    { n: 3, label: 'Import' },
  ];
  return (
    <div className="flex items-center gap-2 text-xs">
      {items.map((it, i) => {
        const active = step === it.n;
        const done = step > it.n;
        return (
          <div key={it.n} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border ${
                active
                  ? 'border-brand text-ink bg-brand/10'
                  : done
                    ? 'border-good/40 text-good bg-good/5'
                    : 'border-border text-muted'
              }`}
            >
              <span className="tabular-nums font-mono">{it.n}</span>
              <span>{it.label}</span>
            </div>
            {i < items.length - 1 && <span className="text-muted">—</span>}
          </div>
        );
      })}
    </div>
  );
}

function Step1Welcome({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="card card-pad space-y-4">
      <p className="text-sm leading-relaxed">
        AI FinOps tracks LLM token usage and cost across your applications, surfaces why your AI
        bill is what it is, and recommends specific dollar-impact actions. Setup takes about 2
        minutes.
      </p>

      <div>
        <div className="label mb-2">What it does</div>
        <ul className="text-xs text-muted space-y-1.5 list-disc list-inside leading-relaxed">
          <li>Pulls historical usage from provider admin APIs (Anthropic, OpenAI, Google, Azure).</li>
          <li>Captures per-prompt detail from apps that wrap their calls with the AI FinOps SDK.</li>
          <li>Categorizes prompts, finds cost drivers, and ranks the actions that lower the bill.</li>
        </ul>
      </div>

      <div>
        <div className="label mb-2">What it does not do</div>
        <ul className="text-xs text-muted space-y-1.5 list-disc list-inside leading-relaxed">
          <li>It cannot magically scan AI usage that does not flow through a provider you connect.</li>
          <li>Per-prompt analysis needs the SDK or a CSV export — admin APIs return aggregates.</li>
        </ul>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Get Started
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted hover:text-ink underline-offset-2 hover:underline"
        >
          Skip setup, just show me the dashboard
        </button>
      </div>
    </div>
  );
}

function Step2Connect({
  connected,
  onConnected,
  onNext,
  onSkip,
}: {
  connected: ConnectedCredential[];
  onConnected: (c: ConnectedCredential) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="card card-pad">
        <div className="label">Connect providers</div>
        <div className="text-xs text-muted mt-0.5">
          Paste an admin API key for each provider you use. Keys are encrypted at rest with
          AES-256-GCM and never leave this machine.
        </div>
      </div>

      {PROVIDERS.map((p) => {
        const conn = connected.find((c) => c.provider === p.id);
        return (
          <ProviderRow
            key={p.id}
            def={p}
            connected={conn}
            onConnected={onConnected}
          />
        );
      })}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Next
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted hover:text-ink underline-offset-2 hover:underline"
        >
          Skip — I&apos;ll add connectors later
        </button>
      </div>
    </div>
  );
}

function ProviderRow({
  def,
  connected,
  onConnected,
}: {
  def: ProviderDef;
  connected: ConnectedCredential | undefined;
  onConnected: (c: ConnectedCredential) => void;
}) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: def.id,
          apiKey: apiKey.trim(),
          label: label.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      const json = (await res.json()) as ConnectedCredential;
      onConnected(json);
      setApiKey('');
      setLabel('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-left flex-1 min-w-0"
        >
          <div className="flex items-center gap-2">
            <div className="font-medium">{def.name}</div>
            {connected && (
              <span className="chip border-good/40 text-good">Connected</span>
            )}
          </div>
          <div className="text-xs text-muted mt-0.5">{def.blurb}</div>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn shrink-0"
          aria-expanded={open}
        >
          {open ? 'Close' : connected ? 'Replace key' : 'Connect'}
        </button>
      </div>

      {open && (
        <form onSubmit={connect} className="mt-4 space-y-3">
          <div>
            <label className="label block mb-1">API key</label>
            <input
              type="password"
              autoComplete="off"
              className="input font-mono text-xs"
              placeholder={def.keyPlaceholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="text-xs text-muted mt-1">{def.helpText}</div>
          </div>
          <div>
            <label className="label block mb-1">Label (optional)</label>
            <input
              className="input"
              placeholder="prod, staging, team-x"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          {error && <div className="text-xs text-bad">{error}</div>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || !apiKey.trim()}
              className="btn btn-primary disabled:opacity-50"
            >
              {saving ? 'Connecting...' : 'Connect'}
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Step3Import({
  connected,
  onFinish,
  onBack,
}: {
  connected: ConnectedCredential[];
  onFinish: () => void;
  onBack: () => void;
}) {
  const [outcomes, setOutcomes] = useState<Record<string, ImportOutcome>>({});
  const [csvText, setCsvText] = useState('');
  const [csvOutcome, setCsvOutcome] = useState<ImportOutcome>({ status: 'idle' });

  async function runImport(cred: ConnectedCredential) {
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
    } catch (err) {
      setOutcomes((p) => ({
        ...p,
        [cred.id]: {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Import failed',
        },
      }));
    }
  }

  async function runCsv() {
    if (!csvText.trim()) {
      setCsvOutcome({ status: 'failed', error: 'Paste CSV content first' });
      return;
    }
    setCsvOutcome({ status: 'running' });
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
        setCsvOutcome({
          status: 'failed',
          error: json.error ?? `Import failed (${res.status})`,
        });
        return;
      }
      setCsvOutcome({
        status: 'succeeded',
        recordsImported: json.recordsImported ?? 0,
        warnings: json.warnings ?? [],
      });
    } catch (err) {
      setCsvOutcome({
        status: 'failed',
        error: err instanceof Error ? err.message : 'Import failed',
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="card card-pad">
        <div className="label">Run your first import</div>
        <div className="text-xs text-muted mt-0.5">
          Pull historical usage from the providers you connected. You can re-run this later from
          the Connectors page.
        </div>
      </div>

      {connected.length === 0 && (
        <div className="card card-pad text-sm text-muted">
          No providers connected. Go back to connect one, or skip and use the CSV importer below.
        </div>
      )}

      {connected.map((c) => {
        const outcome = outcomes[c.id] ?? { status: 'idle' };
        return (
          <div key={c.id} className="card card-pad">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium capitalize">{c.provider}</div>
                {c.label && <div className="text-xs text-muted mt-0.5">{c.label}</div>}
              </div>
              <button
                type="button"
                onClick={() => runImport(c)}
                disabled={outcome.status === 'running'}
                className="btn btn-primary disabled:opacity-50"
              >
                {outcome.status === 'running' ? 'Importing...' : 'Run import now'}
              </button>
            </div>
            <ImportOutcomeView outcome={outcome} />
          </div>
        );
      })}

      <div className="card card-pad space-y-3">
        <div>
          <div className="font-medium">CSV import</div>
          <div className="text-xs text-muted mt-0.5">
            Paste a CSV export with columns like timestamp, model, input_tokens, output_tokens,
            total_cost. Header row required.
          </div>
        </div>
        <textarea
          className="input font-mono text-xs min-h-[160px]"
          placeholder="timestamp,model,input_tokens,output_tokens,total_cost&#10;2025-05-01,gpt-4o-mini,1200,450,0.00045"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={runCsv}
            disabled={csvOutcome.status === 'running' || !csvText.trim()}
            className="btn btn-primary disabled:opacity-50"
          >
            {csvOutcome.status === 'running' ? 'Importing...' : 'Import CSV'}
          </button>
          {csvText && (
            <button type="button" className="btn" onClick={() => setCsvText('')}>
              Clear
            </button>
          )}
        </div>
        <ImportOutcomeView outcome={csvOutcome} />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button type="button" className="btn btn-primary" onClick={onFinish}>
          Finish
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function ImportOutcomeView({ outcome }: { outcome: ImportOutcome }) {
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
      <div className="text-xs text-good">
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
