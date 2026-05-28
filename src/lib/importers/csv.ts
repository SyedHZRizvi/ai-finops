// Generic CSV importer.
//
// Accepts a CSV in `ctx.csvText`. Column names are matched case-insensitively
// and accept either snake_case or camelCase variants. Required columns:
//
//   timestamp, model, input_tokens, output_tokens
//
// Optional columns:
//
//   provider, app_name, user_id, prompt_text, response_text, latency_ms
//
// Hand-rolled parser (no new dependencies). Quoted fields with embedded
// commas and doubled-quote escapes (`""`) are supported. Rows containing
// embedded newlines in a quoted field are skipped with a warning rather
// than crashing.

import { calculateCost } from '../pricing';
import { analyzePrompt } from '../categorizer';
import type { ImportedRecord, Importer, ImporterContext, ImportResult } from './types';

const MAX_ROWS = 10_000;

// --- CSV tokenizer ---------------------------------------------------------

/**
 * Split a single CSV line into fields. Returns null if the line has an
 * unterminated quoted field (caller should warn + skip).
 */
function parseCsvLine(line: string): string[] | null {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          // escaped quote
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      fields.push(cur);
      cur = '';
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  if (inQuotes) return null;
  fields.push(cur);
  return fields;
}

function splitLines(text: string): string[] {
  // Normalize line endings, drop a leading BOM, drop trailing blank lines.
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const all = clean.split('\n');
  while (all.length > 0 && all[all.length - 1]!.trim() === '') all.pop();
  return all;
}

// --- column resolution -----------------------------------------------------

const COLUMN_ALIASES: Record<string, string[]> = {
  timestamp: ['timestamp', 'time', 'date', 'datetime', 'ts'],
  model: ['model', 'model_name', 'modelname'],
  provider: ['provider'],
  appName: ['app_name', 'appname', 'app', 'application'],
  userId: ['user_id', 'userid', 'user'],
  inputTokens: ['input_tokens', 'inputtokens', 'prompt_tokens', 'prompttokens', 'in_tokens'],
  outputTokens: ['output_tokens', 'outputtokens', 'completion_tokens', 'completiontokens', 'out_tokens'],
  promptText: ['prompt_text', 'prompttext', 'prompt', 'input'],
  responseText: ['response_text', 'responsetext', 'response', 'completion', 'output'],
  latencyMs: ['latency_ms', 'latencyms', 'latency', 'duration_ms', 'durationms'],
};

type CanonicalColumn = keyof typeof COLUMN_ALIASES;

function buildHeaderIndex(headers: string[]): Partial<Record<CanonicalColumn, number>> {
  const idx: Partial<Record<CanonicalColumn, number>> = {};
  const normHeaders = headers.map((h) => h.trim().toLowerCase());
  for (const [canon, aliases] of Object.entries(COLUMN_ALIASES) as [CanonicalColumn, string[]][]) {
    for (const alias of aliases) {
      const at = normHeaders.indexOf(alias);
      if (at !== -1) {
        idx[canon] = at;
        break;
      }
    }
  }
  return idx;
}

// --- value parsing ---------------------------------------------------------

function parseTimestamp(v: string): Date | undefined {
  const s = v.trim();
  if (!s) return undefined;
  // Pure-numeric → unix epoch (auto-detect seconds vs ms).
  if (/^\d+$/.test(s)) {
    const n = Number.parseInt(s, 10);
    if (Number.isFinite(n)) {
      const ms = n > 1e12 ? n : n * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return undefined;
}

function parseInt0(v: string | undefined): number {
  if (v == null) return 0;
  const s = v.trim();
  if (!s) return 0;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function parseIntOrNull(v: string | undefined): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function getCell(row: string[], at: number | undefined): string | undefined {
  if (at == null) return undefined;
  if (at < 0 || at >= row.length) return undefined;
  return row[at];
}

// ---------------------------------------------------------------------------

async function run(ctx: ImporterContext): Promise<ImportResult> {
  const text = ctx.csvText;
  if (!text || !text.trim()) {
    return { records: [], warnings: ['CSV import received empty input.'] };
  }

  const warnings: string[] = [];
  const records: ImportedRecord[] = [];

  const lines = splitLines(text);
  if (lines.length === 0) {
    return { records, warnings: ['CSV is empty.'] };
  }

  const headerLine = lines[0]!;
  const headers = parseCsvLine(headerLine);
  if (!headers) {
    return { records, warnings: ['CSV header row has an unterminated quoted field.'] };
  }

  const idx = buildHeaderIndex(headers);

  // Required columns
  const missing: string[] = [];
  if (idx.timestamp == null) missing.push('timestamp');
  if (idx.model == null) missing.push('model');
  if (idx.inputTokens == null) missing.push('input_tokens');
  if (idx.outputTokens == null) missing.push('output_tokens');
  if (missing.length > 0) {
    return {
      records,
      warnings: [
        `CSV is missing required column(s): ${missing.join(', ')}. Headers seen: ${headers.join(', ')}`,
      ],
    };
  }

  let minTs: Date | undefined;
  let maxTs: Date | undefined;
  let skippedEmbeddedNewline = 0;

  for (let lineNo = 1; lineNo < lines.length; lineNo++) {
    if (records.length >= MAX_ROWS) {
      warnings.push(`CSV import truncated at ${MAX_ROWS} rows.`);
      break;
    }
    const line = lines[lineNo]!;
    if (line.trim() === '') continue;

    const row = parseCsvLine(line);
    if (!row) {
      // Unterminated quote — most commonly means an embedded newline in a
      // quoted field that we split on. Per spec, skip + warn rather than
      // attempt multi-line reassembly.
      skippedEmbeddedNewline += 1;
      continue;
    }

    const tsRaw = getCell(row, idx.timestamp);
    const ts = parseTimestamp(tsRaw ?? '');
    if (!ts) {
      warnings.push(`Row ${lineNo + 1}: invalid or missing timestamp.`);
      continue;
    }

    const model = (getCell(row, idx.model) ?? '').trim();
    if (!model) {
      warnings.push(`Row ${lineNo + 1}: missing model.`);
      continue;
    }

    const inputTokens = parseInt0(getCell(row, idx.inputTokens));
    const outputTokens = parseInt0(getCell(row, idx.outputTokens));
    const totalTokens = inputTokens + outputTokens;

    const provider = (getCell(row, idx.provider) ?? '').trim() || 'unknown';
    const appName = (getCell(row, idx.appName) ?? '').trim() || undefined;
    const userId = (getCell(row, idx.userId) ?? '').trim() || undefined;
    const promptTextRaw = getCell(row, idx.promptText) ?? '';
    const responseTextRaw = getCell(row, idx.responseText);
    const latencyMs = parseIntOrNull(getCell(row, idx.latencyMs));

    const { inputCost, outputCost, totalCost } = calculateCost(inputTokens, outputTokens, model);

    const hasPrompt = promptTextRaw.trim().length > 0;
    let category = 'other';
    let complexity = 'simple';
    let complexityScore = 0;
    let dimensions = '[]';
    let characteristics: string;

    if (hasPrompt) {
      const analysis = analyzePrompt(promptTextRaw, model);
      category = analysis.category;
      complexity = analysis.complexity;
      complexityScore = analysis.complexityScore;
      dimensions = JSON.stringify(analysis.dimensions);
      characteristics = JSON.stringify({
        source: 'import',
        sourceKind: 'csv',
        ...analysis.characteristics,
      });
    } else {
      characteristics = JSON.stringify({ source: 'import', sourceKind: 'csv' });
    }

    const responseText =
      responseTextRaw == null || responseTextRaw.length === 0 ? null : responseTextRaw;

    const record: ImportedRecord = {
      timestamp: ts,
      appName,
      userId,
      model,
      provider,
      promptText: hasPrompt ? promptTextRaw : '[CSV import row]',
      responseText,
      inputTokens,
      outputTokens,
      totalTokens,
      inputCost,
      outputCost,
      totalCost,
      category,
      complexity,
      complexityScore,
      dimensions,
      characteristics,
      latencyMs,
      metadata: JSON.stringify({ source: 'import', sourceKind: 'csv' }),
      potentialSavedTokens: 0,
      potentialSavedCost: 0,
    };

    records.push(record);

    if (!minTs || ts < minTs) minTs = ts;
    if (!maxTs || ts > maxTs) maxTs = ts;
  }

  if (skippedEmbeddedNewline > 0) {
    warnings.push(
      `Skipped ${skippedEmbeddedNewline} row(s) with embedded newlines inside quoted fields. Re-export with newlines stripped or escaped.`,
    );
  }

  return {
    records,
    warnings,
    rawRangeFrom: minTs,
    rawRangeTo: maxTs,
  };
}

export const csvImporter: Importer = {
  provider: 'csv',
  label: 'Generic CSV upload',
  run,
};
