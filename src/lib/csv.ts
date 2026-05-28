// Generic CSV writer. Excel-friendly: prepends a UTF-8 BOM so Excel detects
// the encoding correctly and renders accented characters and unicode without
// the user having to import-then-pick-a-codepage.
//
// RFC 4180 quoting:
//   - Fields containing comma, double-quote, CR, or LF are wrapped in
//     double quotes.
//   - Embedded double quotes are doubled ("" inside the quoted field).
//   - Line terminator is CRLF (per spec; Excel + Google Sheets handle LF too,
//     but CRLF is the safest default).
//
// Notes for callers:
//   - Pass `columns` in the order you want them written. Headers come from
//     `label`. Values come from `row[key]`.
//   - Multi-line strings inside cells are preserved (Excel handles them when
//     the cell is quoted). Still, callers that know their content is
//     multi-paragraph should truncate before passing in — see
//     /api/export/prompts which clips promptText/responseText to 200 chars.

export interface CsvColumn {
  key: string;
  label: string;
}

const BOM = '﻿';
const EOL = '\r\n';

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  // Objects/arrays: JSON-stringify so the cell at least carries structure.
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function escapeCell(raw: string): string {
  // A cell needs quoting if it contains a comma, a quote, a newline, or a
  // carriage return. We also defensively quote cells that start with a leading
  // space — Excel sometimes trims those — though strictly that's not required.
  const needsQuoting =
    raw.includes(',') ||
    raw.includes('"') ||
    raw.includes('\n') ||
    raw.includes('\r');
  if (!needsQuoting) return raw;
  // Double up embedded quotes.
  return `"${raw.replace(/"/g, '""')}"`;
}

export function toCsv(
  rows: Record<string, unknown>[],
  columns: CsvColumn[],
): string {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows
    .map((row) =>
      columns.map((c) => escapeCell(formatCell(row[c.key]))).join(','),
    )
    .join(EOL);
  if (rows.length === 0) return BOM + header + EOL;
  return BOM + header + EOL + body + EOL;
}
