'use client';
import type { DiffSegment } from '@/lib/compare';

interface DiffViewProps {
  segments: DiffSegment[];
  mode: 'before' | 'after';
}

/**
 * Render a diff from one side's perspective.
 *
 * `mode='before'` shows A: unchanged + removed segments (removed in red,
 * struck-through). `mode='after'` shows B: unchanged + added segments
 * (added in green, bold).
 *
 * Whitespace inside segments is preserved via `whitespace-pre-wrap`, so line
 * breaks in the input render verbatim.
 */
export function DiffView({ segments, mode }: DiffViewProps) {
  if (!segments || segments.length === 0) {
    return (
      <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-panel2 border border-border rounded-xl p-4 max-h-96 overflow-auto text-muted">
        (empty)
      </pre>
    );
  }

  return (
    <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed bg-panel2 border border-border rounded-xl p-4 max-h-96 overflow-auto">
      {segments.map((seg, i) => {
        if (seg.kind === 'unchanged') {
          return <span key={i}>{seg.text}</span>;
        }
        if (mode === 'before' && seg.kind === 'removed') {
          return (
            <span
              key={i}
              className="bg-bad/15 text-bad line-through decoration-bad/60 rounded px-0.5"
            >
              {seg.text}
            </span>
          );
        }
        if (mode === 'after' && seg.kind === 'added') {
          return (
            <span key={i} className="bg-good/15 text-good font-semibold rounded px-0.5">
              {seg.text}
            </span>
          );
        }
        // mode='before' skips 'added' (it doesn't exist in A) and
        // mode='after' skips 'removed' (it doesn't exist in B).
        return null;
      })}
    </pre>
  );
}
