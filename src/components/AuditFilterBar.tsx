'use client';

/**
 * URL-driven filter controls for the /audit page. Each control writes a
 * query-string param; the server component re-runs with the new
 * `searchParams` and refetches. Keeping the source-of-truth in the URL
 * means filter state survives reload, is shareable, and stays in sync
 * with browser back/forward.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition, useCallback } from 'react';
import type { AuditAction, AuditTargetKind } from '@/lib/audit';

interface AuditFilterBarProps {
  /** Current filter values, derived from URL searchParams on the server. */
  initial: {
    action: AuditAction | '';
    targetKind: AuditTargetKind | '';
    actor: string;
    since: string;
  };
}

/**
 * Ordered list of audit actions surfaced in the dropdown. Same order as
 * the union in `lib/audit.ts` — keep them in sync so the UI doesn't quietly
 * drop newly added actions.
 */
const ACTIONS: AuditAction[] = [
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
];

const TARGET_KINDS: AuditTargetKind[] = [
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
];

export function AuditFilterBar({ initial }: AuditFilterBarProps) {
  const router = useRouter();
  const params = useSearchParams();
  // useTransition lets us start a navigation without blocking the input —
  // typing in the actor box stays responsive while the server fetch is
  // in-flight.
  const [isPending, startTransition] = useTransition();

  /**
   * Build a new query string with `key` set to `value` (or removed when
   * empty), reset `offset` to 0 so a filter change always lands on page 1,
   * and push the new URL.
   */
  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params?.toString() ?? '');
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      // Filter changes invalidate pagination.
      next.delete('offset');
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `/audit?${qs}` : '/audit');
      });
    },
    [params, router],
  );

  const reset = useCallback(() => {
    startTransition(() => {
      router.push('/audit');
    });
  }, [router]);

  const hasFilters =
    initial.action !== '' ||
    initial.targetKind !== '' ||
    initial.actor !== '' ||
    initial.since !== '';

  return (
    <div className="card card-pad fade-up-delay-1">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="label block mb-1.5" htmlFor="audit-filter-action">
            Action
          </label>
          <select
            id="audit-filter-action"
            className="input"
            value={initial.action}
            onChange={(e) => update('action', e.target.value)}
            disabled={isPending}
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label block mb-1.5" htmlFor="audit-filter-kind">
            Target kind
          </label>
          <select
            id="audit-filter-kind"
            className="input"
            value={initial.targetKind}
            onChange={(e) => update('targetKind', e.target.value)}
            disabled={isPending}
          >
            <option value="">All kinds</option>
            {TARGET_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label block mb-1.5" htmlFor="audit-filter-actor">
            Actor
          </label>
          <input
            id="audit-filter-actor"
            type="text"
            className="input"
            placeholder="e.g. session, cron"
            defaultValue={initial.actor}
            // Commit on blur / Enter so we don't spam the server on
            // every keystroke. URL doesn't change while typing — only
            // when the field is "done".
            onBlur={(e) => {
              if (e.currentTarget.value !== initial.actor) {
                update('actor', e.currentTarget.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            disabled={isPending}
          />
        </div>

        <div>
          <label className="label block mb-1.5" htmlFor="audit-filter-since">
            Since
          </label>
          <input
            id="audit-filter-since"
            type="datetime-local"
            className="input"
            value={initial.since}
            onChange={(e) => update('since', e.target.value)}
            disabled={isPending}
          />
        </div>
      </div>

      {hasFilters && (
        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={reset}
            disabled={isPending}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
