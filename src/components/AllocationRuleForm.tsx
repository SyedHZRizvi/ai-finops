'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AllocationRuleData } from '@/lib/allocation';

interface AllocationRuleFormProps {
  // When provided, the form starts in edit mode and PATCH'es the existing
  // rule on submit. Used by the list's "Edit" action.
  initial?: AllocationRuleData;
  onSaved?: () => void;
  onCancel?: () => void;
}

interface TargetRow {
  // Stable local id so dynamic add/remove doesn't fight React's key reuse
  // when two recipients happen to share a name during mid-typing.
  key: string;
  appName: string;
  percent: string;
}

let targetRowSeq = 0;
function makeRow(appName = '', percent = ''): TargetRow {
  targetRowSeq += 1;
  return { key: `t${targetRowSeq}`, appName, percent };
}

// Parse a comma-separated input into a string | string[] | undefined.
// "  " -> undefined (treat as wildcard); "foo" -> "foo"; "foo,bar" -> ['foo','bar'].
function parseMatcherField(raw: string): string | string[] | undefined {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return parts;
}

function stringifyMatcherField(v: string | string[] | undefined): string {
  if (v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  return v;
}

export function AllocationRuleForm({ initial, onSaved, onCancel }: AllocationRuleFormProps) {
  const router = useRouter();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? '');
  const [appNameInput, setAppNameInput] = useState(stringifyMatcherField(initial?.sourceMatcher.appName));
  const [modelInput, setModelInput] = useState(stringifyMatcherField(initial?.sourceMatcher.model));
  const [userIdInput, setUserIdInput] = useState(stringifyMatcherField(initial?.sourceMatcher.userId));
  const [priority, setPriority] = useState(String(initial?.priority ?? 100));
  const [targets, setTargets] = useState<TargetRow[]>(() => {
    if (!initial) return [makeRow(), makeRow()];
    const entries = Object.entries(initial.targetSplit);
    if (entries.length === 0) return [makeRow(), makeRow()];
    return entries.map(([k, v]) => makeRow(k, String(v)));
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Live sum indicator. Numeric strings that can't be parsed count as 0
  // so the indicator doesn't jump around while the user types.
  const sum = useMemo(() => {
    let total = 0;
    for (const t of targets) {
      const n = Number(t.percent);
      if (Number.isFinite(n)) total += n;
    }
    return Math.round(total * 100) / 100;
  }, [targets]);

  const sumValid = sum >= 95 && sum <= 105;

  function updateTarget(key: string, field: 'appName' | 'percent', value: string) {
    setTargets((rows) =>
      rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  }

  function addTarget() {
    setTargets((rows) => [...rows, makeRow()]);
  }

  function removeTarget(key: string) {
    setTargets((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.key !== key)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Pre-validate client-side so the user gets immediate feedback rather
    // than waiting for a 400 from the server. The server still re-validates.
    if (!name.trim()) {
      setError('Rule name is required.');
      return;
    }

    // Build target split, weeding out empty rows.
    const targetSplit: Record<string, number> = {};
    for (const t of targets) {
      const appName = t.appName.trim();
      const percent = Number(t.percent);
      if (!appName) continue;
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        setError(`Percent for "${appName}" must be a number between 0 and 100.`);
        return;
      }
      if (targetSplit[appName] !== undefined) {
        setError(`Duplicate target appName "${appName}". Combine them into one row.`);
        return;
      }
      targetSplit[appName] = percent;
    }

    if (Object.keys(targetSplit).length === 0) {
      setError('Add at least one target with an app name and percent.');
      return;
    }
    if (!sumValid) {
      setError(`Percents must sum to 100% (currently ${sum}%; tolerance is 95-105%).`);
      return;
    }

    const sourceMatcher: { appName?: string | string[]; model?: string | string[]; userId?: string | string[] } = {};
    const a = parseMatcherField(appNameInput);
    const m = parseMatcherField(modelInput);
    const u = parseMatcherField(userIdInput);
    if (a !== undefined) sourceMatcher.appName = a;
    if (m !== undefined) sourceMatcher.model = m;
    if (u !== undefined) sourceMatcher.userId = u;

    const prio = Number(priority);
    if (!Number.isFinite(prio) || prio < 0) {
      setError('Priority must be a non-negative number.');
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        sourceMatcher,
        targetSplit,
        priority: Math.round(prio),
      };
      const url = isEdit ? `/api/allocations?id=${encodeURIComponent(initial!.id)}` : '/api/allocations';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Save failed (${res.status})`);
      }
      setSuccess(true);
      if (!isEdit) {
        setName('');
        setAppNameInput('');
        setModelInput('');
        setUserIdInput('');
        setPriority('100');
        setTargets([makeRow(), makeRow()]);
      }
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
        <label className="label block mb-2">Rule name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Split shared-llm-pool by team"
          className="input"
        />
      </div>

      <div>
        <div className="label mb-2">Source — what to match</div>
        <p className="text-xs text-muted mb-3">
          Leave a field blank to match anything. Use commas to match multiple
          values (e.g. <code className="font-mono">shared-llm-pool, batch-jobs</code>).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label block mb-1.5">App name</label>
            <input
              type="text"
              value={appNameInput}
              onChange={(e) => setAppNameInput(e.target.value)}
              placeholder="shared-llm-pool"
              className="input"
            />
          </div>
          <div>
            <label className="label block mb-1.5">Model</label>
            <input
              type="text"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              placeholder="gpt-4o"
              className="input"
            />
          </div>
          <div>
            <label className="label block mb-1.5">User ID</label>
            <input
              type="text"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="user-1234"
              className="input"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="label">Target split</div>
          <span
            className={`chip ${sumValid ? 'chip-good' : 'chip-warn'} tabular-nums`}
            title="Percents must sum to 100% (95-105% accepted)"
          >
            sum: {sum}% {sumValid ? 'OK' : '(must be 100% ± 5%)'}
          </span>
        </div>
        <div className="space-y-2">
          {targets.map((t, idx) => (
            <div key={t.key} className="flex items-center gap-2">
              <input
                type="text"
                value={t.appName}
                onChange={(e) => updateTarget(t.key, 'appName', e.target.value)}
                placeholder={idx === 0 ? 'team-marketing' : idx === 1 ? 'team-engineering' : 'team-support'}
                className="input flex-1"
              />
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                value={t.percent}
                onChange={(e) => updateTarget(t.key, 'percent', e.target.value)}
                placeholder="0"
                className="input w-28 tabular-nums"
              />
              <span className="text-muted text-sm w-3">%</span>
              <button
                type="button"
                onClick={() => removeTarget(t.key)}
                className="btn-ghost text-bad hover:text-bad"
                disabled={targets.length <= 1}
                aria-label="Remove target"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addTarget} className="btn mt-3">
          Add target
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label block mb-2">Priority</label>
          <input
            type="number"
            min="0"
            step="1"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            placeholder="100"
            className="input"
          />
          <p className="text-xs text-muted mt-2">
            Lower runs first. The first matching rule wins; ties broken by
            creation time.
          </p>
        </div>
      </div>

      {error && (
        <div className="card-pad border border-bad/40 bg-bad/5 rounded-xl text-sm text-bad">
          {error}
        </div>
      )}
      {success && (
        <div className="card-pad border border-good/40 bg-good/5 rounded-xl text-sm text-good">
          Rule {isEdit ? 'updated' : 'saved'}.
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="btn-primary"
          disabled={submitting || !sumValid}
        >
          {submitting ? 'Saving...' : isEdit ? 'Update rule' : 'Save rule'}
        </button>
        {isEdit && onCancel && (
          <button type="button" onClick={onCancel} className="btn">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
