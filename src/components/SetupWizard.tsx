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
  accent: 'amber' | 'good' | 'blue' | 'brand2';
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    blurb: 'Pulls per-day, per-model usage from the organization usage report.',
    keyPlaceholder: 'sk-ant-admin-...',
    helpText: 'Requires an admin API key from the Anthropic console.',
    accent: 'amber',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    blurb: 'Pulls organization-wide usage and billing data.',
    keyPlaceholder: 'sk-...',
    helpText: 'Requires an organization-scoped admin API key.',
    accent: 'good',
  },
  {
    id: 'google',
    name: 'Google (Vertex AI)',
    blurb: 'Pulls Gemini usage from Cloud Billing exports.',
    keyPlaceholder: 'AIza...',
    helpText: 'Requires a service account key with billing.viewer.',
    accent: 'blue',
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    blurb: 'Pulls usage from Azure Cost Management for OpenAI deployments.',
    keyPlaceholder: 'Cost Management bearer token',
    helpText: 'Requires a subscription-scoped reader token.',
    accent: 'brand2',
  },
];

const ACCENT_CLASSES: Record<ProviderDef['accent'], { bg: string; border: string; text: string }> = {
  amber: { bg: 'bg-amber/10', border: 'border-amber/30', text: 'text-amber' },
  good: { bg: 'bg-good/10', border: 'border-good/30', text: 'text-good' },
  blue: { bg: 'bg-blue/10', border: 'border-blue/30', text: 'text-blue' },
  brand2: { bg: 'bg-brand2/10', border: 'border-brand2/30', text: 'text-brand2' },
};

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
    <div className="space-y-5">
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
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-medium transition-all duration-150 ${
                active
                  ? 'border-brand/40 text-brandLight bg-brand/10 shadow-glow'
                  : done
                    ? 'border-good/40 text-good bg-good/5'
                    : 'border-border text-muted'
              }`}
            >
              <span
                className={`tabular-nums w-5 h-5 rounded-md flex items-center justify-center ${
                  active
                    ? 'bg-brand-gradient text-white'
                    : done
                      ? 'bg-good text-white'
                      : 'bg-panel2 text-muted'
                }`}
              >
                {done ? '✓' : it.n}
              </span>
              <span>{it.label}</span>
            </div>
            {i < items.length - 1 && (
              <span className={`h-px w-6 ${done ? 'bg-good/40' : 'bg-border'}`} aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step1Welcome({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="card card-pad space-y-5 fade-up">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-brand-gradient flex items-center justify-center shrink-0 shadow-glow">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">Welcome to AI FinOps</h2>
          <p className="text-sm text-inkDim leading-relaxed mt-2">
            AI FinOps tracks LLM token usage and cost across your applications, surfaces why your AI
            bill is what it is, and recommends specific dollar-impact actions. Setup takes about 2
            minutes.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-panel2 border border-border rounded-xl p-4">
          <div className="label mb-2 text-good">What it does</div>
          <ul className="text-xs text-inkDim space-y-2 leading-relaxed">
            <li className="flex gap-2"><span className="text-good shrink-0 mt-0.5" aria-hidden>→</span>Pulls historical usage from provider admin APIs (Anthropic, OpenAI, Google, Azure).</li>
            <li className="flex gap-2"><span className="text-good shrink-0 mt-0.5" aria-hidden>→</span>Captures per-prompt detail from apps that wrap their calls with the AI FinOps SDK.</li>
            <li className="flex gap-2"><span className="text-good shrink-0 mt-0.5" aria-hidden>→</span>Categorizes prompts, finds cost drivers, and ranks the actions that lower the bill.</li>
          </ul>
        </div>
        <div className="bg-panel2 border border-border rounded-xl p-4">
          <div className="label mb-2 text-warn">What it does not do</div>
          <ul className="text-xs text-inkDim space-y-2 leading-relaxed">
            <li className="flex gap-2"><span className="text-warn shrink-0 mt-0.5" aria-hidden>•</span>It cannot magically scan AI usage that does not flow through a provider you connect.</li>
            <li className="flex gap-2"><span className="text-warn shrink-0 mt-0.5" aria-hidden>•</span>Per-prompt analysis needs the SDK or a CSV export — admin APIs return aggregates.</li>
          </ul>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="button" className="btn-primary" onClick={onNext}>
          Get Started <span aria-hidden>→</span>
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted hover:text-ink underline-offset-2 hover:underline transition-colors"
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
    <div className="space-y-3 fade-up">
      <div className="card card-pad">
        <div className="label">Connect providers</div>
        <div className="text-xs text-inkDim mt-1.5 leading-relaxed">
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
        <button type="button" className="btn-primary" onClick={onNext}>
          Next <span aria-hidden>→</span>
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted hover:text-ink underline-offset-2 hover:underline transition-colors"
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
  const accent = ACCENT_CLASSES[def.accent];

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
          className="text-left flex-1 min-w-0 flex items-start gap-3"
        >
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${accent.bg} ${accent.border}`}
          >
            <svg viewBox="0 0 24 24" className={`w-5 h-5 ${accent.text}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="font-semibold">{def.name}</div>
              {connected && (
                <span className="chip chip-good">Connected</span>
              )}
            </div>
            <div className="text-xs text-muted mt-1">{def.blurb}</div>
          </div>
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
        <form onSubmit={connect} className="mt-5 space-y-3">
          <div>
            <label className="label block mb-2">API key</label>
            <input
              type="password"
              autoComplete="off"
              className="input font-mono text-xs"
              placeholder={def.keyPlaceholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="text-xs text-muted mt-2">{def.helpText}</div>
          </div>
          <div>
            <label className="label block mb-2">Label (optional)</label>
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
              className="btn-primary disabled:opacity-50"
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
    <div className="space-y-3 fade-up">
      <div className="card card-pad">
        <div className="label">Run your first import</div>
        <div className="text-xs text-inkDim mt-1.5 leading-relaxed">
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
                <div className="font-semibold capitalize">{c.provider}</div>
                {c.label && <div className="text-xs text-muted mt-0.5">{c.label}</div>}
              </div>
              <button
                type="button"
                onClick={() => runImport(c)}
                disabled={outcome.status === 'running'}
                className="btn-primary disabled:opacity-50"
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
          <div className="font-semibold">CSV import</div>
          <div className="text-xs text-muted mt-1">
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
            className="btn-primary disabled:opacity-50"
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
        <button type="button" className="btn-primary" onClick={onFinish}>
          Finish <span aria-hidden>→</span>
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
