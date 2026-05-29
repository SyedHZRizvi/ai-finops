'use client';

/**
 * Audit log table. Renders one row per entry; clicking a row toggles an
 * expanded view that shows the full payload JSON (via AuditExpandRow).
 * Pagination is URL-driven so it survives reload + back/forward.
 *
 * This component does not fetch — the parent server component
 * (/audit/page.tsx) fetches and passes items + pagination info as props.
 * That split keeps the table cheap to render and keeps the "live" state
 * (which row is expanded) local to the client.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import type { AuditAction, AuditTargetKind } from '@/lib/audit';
import { AuditExpandRow } from './AuditExpandRow';

export interface AuditTableItem {
  id: string;
  actor: string | null;
  action: AuditAction;
  targetId: string | null;
  targetKind: AuditTargetKind | null;
  payload: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string; // ISO from API response
}

interface AuditTableProps {
  items: AuditTableItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Action category → chip class. Categories are decided by the prefix
 * (`budget.*`, `credential.*`, …), so adding a new action automatically
 * picks the right color as long as the prefix matches.
 */
function chipFor(action: AuditAction): string {
  if (action.startsWith('budget.')) return 'chip-brand';
  if (action.startsWith('credential.') || action.startsWith('apikey.')) return 'chip-blue';
  if (action.startsWith('anomaly.')) return 'chip-warn';
  if (action.startsWith('allocation.')) return 'chip-indigo';
  if (action.startsWith('pricing.')) return 'chip-amber';
  if (action.startsWith('import.')) return 'chip-teal';
  if (action.startsWith('demo.')) return 'chip-pink';
  if (action.startsWith('annotation.') || action.startsWith('snapshot.')) {
    return 'chip-lime';
  }
  if (action.startsWith('auth.')) return 'chip-rose';
  return '';
}

/**
 * Per-kind link target. Returns null for kinds that don't map to a
 * dedicated page; for those we just render the id as text. We never link
 * to an item-detail page that doesn't exist — better to show plain text
 * than a 404.
 */
function targetHref(kind: AuditTargetKind | null, _id: string | null): string | null {
  if (!kind) return null;
  switch (kind) {
    case 'budget':
      return '/budget';
    case 'credential':
      return '/settings';
    case 'anomaly':
      return '/anomaly';
    case 'allocation':
      return '/allocations';
    case 'apikey':
      return '/api-keys';
    case 'pricing':
      return '/settings';
    case 'import':
      return '/import';
    case 'snapshot':
      return '/insights';
    case 'annotation':
      return '/prompts';
    case 'demo':
    case 'auth':
    default:
      return null;
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 0) return 'just now';
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

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncateMiddle(value: string, max: number): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return value.slice(0, half) + '…' + value.slice(-half);
}

export function AuditTable({ items, total, limit, offset }: AuditTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const page = Math.floor(offset / Math.max(1, limit)) + 1;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));

  // Pre-compute pagination URLs so the Prev/Next buttons reflect the
  // current filter state — pagination must not drop filters.
  const { prevHref, nextHref } = useMemo(() => {
    function withOffset(newOffset: number): string {
      const next = new URLSearchParams(params?.toString() ?? '');
      if (newOffset <= 0) {
        next.delete('offset');
      } else {
        next.set('offset', String(newOffset));
      }
      const qs = next.toString();
      return qs ? `/audit?${qs}` : '/audit';
    }
    return {
      prevHref: page > 1 ? withOffset(offset - limit) : null,
      nextHref: page < totalPages ? withOffset(offset + limit) : null,
    };
  }, [params, offset, limit, page, totalPages]);

  function go(href: string | null) {
    if (!href) return;
    startTransition(() => {
      router.push(href);
    });
  }

  if (items.length === 0) {
    return (
      <div className="card card-pad text-sm text-muted">
        No audit entries match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-3 fade-up-delay-2">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Target</th>
                <th>Actor</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const isOpen = expanded === it.id;
                const chip = chipFor(it.action);
                const href = targetHref(it.targetKind, it.targetId);
                return (
                  <FragmentRow
                    key={it.id}
                    item={it}
                    chip={chip}
                    href={href}
                    isOpen={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : it.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <div>
          Showing{' '}
          <span className="text-inkDim font-semibold">{offset + 1}</span>–
          <span className="text-inkDim font-semibold">
            {Math.min(offset + items.length, total)}
          </span>{' '}
          of <span className="text-inkDim font-semibold">{total}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => go(prevHref)}
            disabled={!prevHref || isPending}
          >
            Prev
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => go(nextHref)}
            disabled={!nextHref || isPending}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps a parent `<tr>` and (conditionally) a second expanded `<tr>` as a
 * fragment so a single audit entry occupies one logical chunk of the
 * table. Kept inline to avoid prop-drilling 6 fields into a separate file.
 */
interface FragmentRowProps {
  item: AuditTableItem;
  chip: string;
  href: string | null;
  isOpen: boolean;
  onToggle: () => void;
}

function FragmentRow({ item, chip, href, isOpen, onToggle }: FragmentRowProps) {
  return (
    <>
      <tr
        className="cursor-pointer"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <td>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-inkDim" title={formatAbsolute(item.createdAt)}>
              {formatRelative(item.createdAt)}
            </span>
            <span className="text-[10px] text-muted">{formatAbsolute(item.createdAt)}</span>
          </div>
        </td>
        <td>
          <span className={`chip ${chip}`}>{item.action}</span>
        </td>
        <td className="text-xs">
          {item.targetKind ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-inkDim font-medium">{item.targetKind}</span>
              {item.targetId && (
                href ? (
                  <Link
                    href={href}
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-[10px] text-brandLight hover:underline underline-offset-4"
                    title={item.targetId}
                  >
                    {truncateMiddle(item.targetId, 24)}
                  </Link>
                ) : (
                  <span className="font-mono text-[10px] text-muted" title={item.targetId}>
                    {truncateMiddle(item.targetId, 24)}
                  </span>
                )
              )}
            </div>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="text-xs">
          {item.actor ? (
            <span className="text-inkDim">{item.actor}</span>
          ) : (
            <span className="chip">system</span>
          )}
        </td>
        <td className="text-xs font-mono text-muted" title={item.ip ?? undefined}>
          {item.ip ? truncateMiddle(item.ip, 18) : '—'}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={5} className="bg-panel2/40">
            <AuditExpandRow payload={item.payload} userAgent={item.userAgent} />
          </td>
        </tr>
      )}
    </>
  );
}
