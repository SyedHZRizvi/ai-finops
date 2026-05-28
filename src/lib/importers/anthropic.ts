// Anthropic admin-API usage importer.
//
// Pulls per-day, per-model, per-workspace usage from the organization usage
// report endpoint and emits one ImportedRecord per bucket × result row.
//
// Endpoint: GET https://api.anthropic.com/v1/organizations/usage_report/messages
// Auth:     x-api-key + anthropic-version: 2023-06-01
//
// The response shape documented by Anthropic is subject to change, so this
// importer is intentionally defensive: every field is read through narrowing
// helpers and missing fields default to 0 / undefined with no exceptions.

import { calculateCost } from '../pricing';
import type { ImportedRecord, Importer, ImporterContext, ImportResult } from './types';

const BASE_URL = 'https://api.anthropic.com/v1/organizations/usage_report/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_RECORDS = 1000;
const MAX_PAGES = 50; // hard cap to avoid runaway pagination

// --- defensive narrowing helpers -------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

function toString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
}

function toDate(v: unknown): Date | undefined {
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // accept seconds or ms
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

// ---------------------------------------------------------------------------

async function fetchPage(
  apiKey: string,
  startingAt: string,
  endingAt: string,
  pageToken: string | undefined,
): Promise<unknown> {
  const url = new URL(BASE_URL);
  url.searchParams.set('starting_at', startingAt);
  url.searchParams.set('ending_at', endingAt);
  url.searchParams.set('bucket_width', '1d');
  url.searchParams.append('group_by[]', 'model');
  url.searchParams.append('group_by[]', 'workspace_id');
  if (pageToken) url.searchParams.set('page', pageToken);

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(
      `Anthropic usage report failed: HTTP ${resp.status} ${resp.statusText} — ${body.slice(0, 200)}`,
    );
  }

  return resp.json() as Promise<unknown>;
}

function extractBuckets(body: unknown): unknown[] {
  if (!isRecord(body)) return [];
  const data = body['data'];
  if (Array.isArray(data)) return data;
  return [];
}

function extractNextPageToken(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  // Look for the most common cursor field names. Anthropic's docs use
  // `next_page`, but other endpoints in their API use `has_more` + `last_id`,
  // so accept either.
  const nextPage = toString(body['next_page']);
  if (nextPage) return nextPage;
  const hasMore = body['has_more'];
  const lastId = toString(body['last_id']);
  if (hasMore === true && lastId) return lastId;
  return undefined;
}

function normalizeRecord(
  bucket: unknown,
  result: unknown,
  jobMeta: { rangeFrom: Date; rangeTo: Date },
): ImportedRecord | null {
  if (!isRecord(bucket) || !isRecord(result)) return null;

  const model = toString(result['model']);
  if (!model) return null;

  const timestamp = toDate(bucket['starting_at']) ?? jobMeta.rangeFrom;

  const uncached = toInt(result['uncached_input_tokens']);
  const cached = toInt(result['cached_input_tokens']);
  const cacheCreation = toInt(result['cache_creation_input_tokens']);
  const inputTokens = uncached + cached + cacheCreation;
  const outputTokens = toInt(result['output_tokens']);
  const totalTokens = inputTokens + outputTokens;

  const requestCount = toInt(result['request_count']);
  const calls = requestCount > 0 ? requestCount : 1;

  const { inputCost, outputCost, totalCost } = calculateCost(inputTokens, outputTokens, model);

  const workspaceId = toString(result['workspace_id']);

  // Snapshot the raw row in metadata so operators can audit unfamiliar fields.
  const nativeRow: Record<string, unknown> = {
    starting_at: bucket['starting_at'] ?? null,
    ending_at: bucket['ending_at'] ?? null,
    model,
    workspace_id: workspaceId ?? null,
    uncached_input_tokens: uncached,
    cached_input_tokens: cached,
    cache_creation_input_tokens: cacheCreation,
    output_tokens: outputTokens,
    request_count: requestCount,
  };

  return {
    timestamp,
    appName: workspaceId,
    model,
    provider: 'anthropic',
    promptText: `[Anthropic usage rollup: ${totalTokens} tokens across ${calls} call${calls === 1 ? '' : 's'}]`,
    responseText: null,
    inputTokens,
    outputTokens,
    totalTokens,
    inputCost,
    outputCost,
    totalCost,
    category: 'other',
    complexity: 'simple',
    complexityScore: 0,
    dimensions: '[]',
    characteristics: JSON.stringify({
      source: 'import',
      sourceKind: 'anthropic-usage-report',
      requestCount: calls,
    }),
    latencyMs: null,
    metadata: JSON.stringify({
      source: 'import',
      provider: 'anthropic',
      native: nativeRow,
    }),
    potentialSavedTokens: 0,
    potentialSavedCost: 0,
  };
}

async function run(ctx: ImporterContext): Promise<ImportResult> {
  if (!ctx.apiKey) {
    throw new Error('Anthropic importer requires an admin API key');
  }

  const rangeTo = ctx.rangeTo ?? new Date();
  const rangeFrom =
    ctx.rangeFrom ?? new Date(rangeTo.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const startingAt = rangeFrom.toISOString();
  const endingAt = rangeTo.toISOString();

  const records: ImportedRecord[] = [];
  const warnings: string[] = [];

  let pageToken: string | undefined;
  let pagesFetched = 0;
  let truncated = false;

  while (pagesFetched < MAX_PAGES) {
    let body: unknown;
    try {
      body = await fetchPage(ctx.apiKey, startingAt, endingAt, pageToken);
    } catch (err) {
      // Re-throw — the API layer captures this into ImportJob.errorMessage.
      throw err instanceof Error ? err : new Error(String(err));
    }
    pagesFetched += 1;

    const buckets = extractBuckets(body);
    if (buckets.length === 0 && pagesFetched === 1) {
      warnings.push('Anthropic usage report returned no data for the requested range.');
    }

    for (const bucket of buckets) {
      if (!isRecord(bucket)) {
        warnings.push('Skipped a malformed bucket (not an object).');
        continue;
      }
      const results = bucket['results'];
      if (!Array.isArray(results)) {
        warnings.push('Skipped a bucket without a `results` array.');
        continue;
      }
      for (const result of results) {
        if (records.length >= MAX_RECORDS) {
          truncated = true;
          break;
        }
        const rec = normalizeRecord(bucket, result, { rangeFrom, rangeTo });
        if (rec) {
          records.push(rec);
        } else {
          warnings.push('Skipped a result row missing a model field.');
        }
      }
      if (truncated) break;
    }

    if (truncated) break;

    const next = extractNextPageToken(body);
    if (!next || next === pageToken) break;
    pageToken = next;
  }

  if (truncated) {
    warnings.push(
      `Anthropic importer truncated at ${MAX_RECORDS} records — narrow the date range to capture more.`,
    );
  }
  if (pagesFetched >= MAX_PAGES) {
    warnings.push(`Anthropic importer stopped after ${MAX_PAGES} pages — narrow the date range.`);
  }

  return {
    records,
    warnings,
    rawRangeFrom: rangeFrom,
    rawRangeTo: rangeTo,
  };
}

export const anthropicImporter: Importer = {
  provider: 'anthropic',
  label: 'Anthropic (admin API)',
  run,
};
