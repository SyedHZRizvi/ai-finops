import { describe, it, expect } from 'vitest';
import { toCsv, type CsvColumn } from '@/lib/csv';

const COLS: CsvColumn[] = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
];

describe('toCsv()', () => {
  it('emits a UTF-8 BOM as the first character', () => {
    const out = toCsv([], COLS);
    // BOM is U+FEFF.
    expect(out.charCodeAt(0)).toBe(0xfeff);
  });

  it('quotes a field that contains a comma', () => {
    const out = toCsv([{ a: 'hello, world', b: 'x' }], COLS);
    expect(out).toContain('"hello, world"');
  });

  it('escapes embedded double quotes by doubling them', () => {
    const out = toCsv([{ a: 'say "hi"', b: 'x' }], COLS);
    // Embedded " becomes "", and the cell itself is wrapped in quotes.
    expect(out).toContain('"say ""hi"""');
  });

  it('preserves newlines inside a quoted cell', () => {
    const out = toCsv([{ a: 'line1\nline2', b: 'x' }], COLS);
    // The cell wraps the newline-bearing content in quotes; the newline
    // itself stays.
    expect(out).toContain('"line1\nline2"');
  });

  it('returns just the header (and BOM) when the rows array is empty', () => {
    const out = toCsv([], COLS);
    // Header row: "A,B" + CRLF.
    expect(out).toContain('A,B');
    // No additional rows appended.
    const lineCount = out.split('\r\n').filter((l) => l.length > 0).length;
    expect(lineCount).toBe(1);
  });
});
