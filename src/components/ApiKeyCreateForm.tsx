'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RawTokenModal } from './RawTokenModal';

interface CreateResponse {
  rawToken: string;
  key: {
    id: string;
    label: string;
    prefix: string;
  };
  error?: string;
}

/**
 * Form for issuing a new ingest token.
 *
 * On success, the parent component receives nothing — instead we open the
 * RawTokenModal, which shows the raw token exactly once. Closing the modal
 * triggers `router.refresh()` so the new key appears in the list below.
 */
export function ApiKeyCreateForm() {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [scopeAppsText, setScopeAppsText] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ rawToken: string; label: string } | null>(null);

  function parseScopeApps(): string[] | undefined {
    const apps = scopeAppsText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return apps.length > 0 ? apps : undefined;
  }

  function parseExpiresInDays(): number | undefined {
    const trimmed = expiresInDays.trim();
    if (trimmed.length === 0) return undefined;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return undefined;
    return n;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError('Label is required.');
      return;
    }

    if (expiresInDays.trim().length > 0 && parseExpiresInDays() === undefined) {
      setError('Expires-in-days must be a positive whole number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: trimmedLabel,
          scopeApps: parseScopeApps(),
          expiresInDays: parseExpiresInDays(),
          createdBy: createdBy.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as CreateResponse & {
        error?: string;
      };
      if (!res.ok || !json.rawToken) {
        throw new Error(json.error ?? `Create failed (${res.status})`);
      }
      // Surface the raw token in the modal. Clear the form behind it so the
      // user can immediately issue another key after closing.
      setIssued({ rawToken: json.rawToken, label: json.key.label });
      setLabel('');
      setScopeAppsText('');
      setExpiresInDays('');
      setCreatedBy('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="card card-pad space-y-5 fade-up">
        <div>
          <label htmlFor="api-key-label" className="label block mb-2">
            Label
          </label>
          <input
            id="api-key-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. production-checkout-bot"
            className="input"
            maxLength={120}
            required
          />
          <p className="text-xs text-muted mt-2">
            Human-readable name shown in the list. Choose something that identifies the app
            or environment.
          </p>
        </div>

        <div>
          <label htmlFor="api-key-scope" className="label block mb-2">
            Scope to app names (optional)
          </label>
          <input
            id="api-key-scope"
            type="text"
            value={scopeAppsText}
            onChange={(e) => setScopeAppsText(e.target.value)}
            placeholder="checkout-bot, marketing-agent"
            className="input"
          />
          <p className="text-xs text-muted mt-2">
            Comma-separated list of <code className="font-mono">appName</code> values this
            token is allowed to log for. Leave empty to allow any app.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="api-key-expires" className="label block mb-2">
              Expires in (days, optional)
            </label>
            <input
              id="api-key-expires"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="Never"
              className="input"
            />
            <p className="text-xs text-muted mt-2">
              Leave blank for a token that never expires.
            </p>
          </div>
          <div>
            <label htmlFor="api-key-created-by" className="label block mb-2">
              Created by (optional)
            </label>
            <input
              id="api-key-created-by"
              type="text"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              placeholder="e.g. alice@example.com"
              className="input"
              maxLength={120}
            />
            <p className="text-xs text-muted mt-2">
              Free-form note for auditing. Email or username works.
            </p>
          </div>
        </div>

        {error && (
          <div className="card-pad border border-bad/40 bg-bad/5 rounded-xl text-sm text-bad">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create token'}
          </button>
          <p className="text-xs text-muted">
            The raw token will be shown <strong>once</strong> after creation.
          </p>
        </div>
      </form>

      {issued && (
        <RawTokenModal
          rawToken={issued.rawToken}
          label={issued.label}
          onClose={() => {
            setIssued(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
