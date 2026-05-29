'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Scope = 'global' | 'app' | 'user';

interface BudgetFormProps {
  onSaved?: () => void;
}

export function BudgetForm({ onSaved }: BudgetFormProps) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('global');
  const [scopeValue, setScopeValue] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [alertAt75, setAlertAt75] = useState(true);
  const [alertAt90, setAlertAt90] = useState(true);
  const [alertAt100, setAlertAt100] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const limit = Number(monthlyLimit);
    if (!Number.isFinite(limit) || limit <= 0) {
      setError('Monthly limit must be a positive number.');
      return;
    }
    if (scope !== 'global' && !scopeValue.trim()) {
      setError('Provide a value for the selected scope.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          scopeValue: scope === 'global' ? undefined : scopeValue.trim(),
          monthlyLimit: limit,
          currency: currency.trim() || 'USD',
          alertAt75,
          alertAt90,
          alertAt100,
          webhookUrl: webhookUrl.trim() ? webhookUrl.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Save failed (${res.status})`);
      }
      setSuccess(true);
      setScopeValue('');
      setMonthlyLimit('');
      setWebhookUrl('');
      onSaved?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="card card-pad space-y-5 fade-up">
      <div>
        <div className="label mb-2">Scope</div>
        <div className="flex flex-wrap gap-2">
          {(['global', 'app', 'user'] as Scope[]).map((s) => (
            <label
              key={s}
              className={`btn cursor-pointer capitalize ${
                scope === s ? 'border-brand bg-brand/10 text-brandLight' : ''
              }`}
            >
              <input
                type="radio"
                name="scope"
                value={s}
                checked={scope === s}
                onChange={() => setScope(s)}
                className="sr-only"
              />
              {s}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted mt-2">
          Global caps total spend; App and User scopes filter to a specific{' '}
          <code className="font-mono">appName</code> or{' '}
          <code className="font-mono">userId</code>.
        </p>
      </div>

      {scope !== 'global' && (
        <div>
          <label className="label block mb-2">
            {scope === 'app' ? 'App name' : 'User ID'}
          </label>
          <input
            type="text"
            value={scopeValue}
            onChange={(e) => setScopeValue(e.target.value)}
            placeholder={scope === 'app' ? 'e.g. checkout-bot' : 'e.g. user-1234'}
            className="input"
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label block mb-2">Monthly limit</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
            placeholder="e.g. 5000"
            className="input"
          />
        </div>
        <div>
          <label className="label block mb-2">Currency</label>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={10}
            placeholder="USD"
            className="input"
          />
        </div>
      </div>

      <div>
        <div className="label mb-2">Alert thresholds</div>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={alertAt75}
              onChange={(e) => setAlertAt75(e.target.checked)}
            />
            75%
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={alertAt90}
              onChange={(e) => setAlertAt90(e.target.checked)}
            />
            90%
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={alertAt100}
              onChange={(e) => setAlertAt100(e.target.checked)}
            />
            100% (breach)
          </label>
        </div>
      </div>

      <div>
        <label className="label block mb-2">Webhook URL (optional)</label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/..."
          className="input"
        />
        <p className="text-xs text-muted mt-2">
          Slack/Teams-compatible webhook to notify when thresholds are crossed.
        </p>
      </div>

      {error && (
        <div className="card-pad border border-bad/40 bg-bad/5 rounded-xl text-sm text-bad">
          {error}
        </div>
      )}
      {success && (
        <div className="card-pad border border-good/40 bg-good/5 rounded-xl text-sm text-good">
          Budget saved.
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save budget'}
        </button>
      </div>
    </form>
  );
}
