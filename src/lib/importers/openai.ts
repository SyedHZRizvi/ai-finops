// OpenAI org-level usage importer.
//
// Pulls per-day, per-model completion usage from the organization usage API
// and emits one ImportedRecord per bucket × model row.
//
// Endpoint: GET https://api.openai.com/v1/organization/usage/completions
// Auth:     Authorization: Bearer <admin api key>
//
// The OpenAI usage API has gone through several iterations. We accept either
// unix-seconds or unix-ms timestamps on input and either shape on output by
// treating every field defensively.

import { calculateCost, getPricing } from '../pricing';
import type { ImportedRecord, Importer, ImporterContext, ImportResult } from './types';

const BASE_URL = 'https://api.openai.com/v1/organization/usage/completions';
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_RECORDS = 1000;
const MAX_PAGES = 50;

// --- defensive narrowing helpers (mirrored from anthropic.ts) --------------

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

function toDateFromUnix(v: unknown): Date | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) {
    // OpenAI's docs show unix seconds. If the value looks like ms (> 1e12), accept it.
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof v === 'string') {
    // Some responses include ISO strings; accept those too.
    const asNum = Number.parseInt(v, 10);
    if (Number.isFinite(asNum) && /^\d+$/.test(v)) {
      const ms = asNum > 1e12 ? asNum : asNum * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

// ---------------------------------------------------------------------------

async function fetchPage(
  apiKey: string,
  startTimeSec: number,
  endTimeSec: number,
  pageToken: string | undefined,
): Promise<unknown> {
  const url = new URL(BASE_URL);
  url.searchParams.set('start_time', String(startTimeSec));
  url.searchParams.set('end_time', String(endTimeSec));
  url.searchParams.set('bucket_width', '1d');
  url.searchParams.append('group_by[]', 'model');
  if (pageToken) url.searchParams.set('page', pageToken);

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(
      `OpenAI usage report failed: HTTP ${resp.status} ${resp.statusText} — ${body.slice(0, 200)}`,
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
  jobMeta: { rangeFrom: Date },
): ImportedRecord | null {
  if (!isRecord(bucket) || !isRecord(result)) return null;

  const model = toString(result['model']);
  if (!model) return null;

  const timestamp =
    toDateFromUnix(bucket['start_time']) ?? toDateFromUnix(bucket['starting_at']) ?? jobMeta.rangeFrom;

  // Audit C4: OpenAI's `input_tokens` is the TOTAL of input tokens (cached
  // and uncached); `input_cached_tokens` is a SUBSET reported separately.
  // The previous code added them which double-counted cached tokens (~60%
  // overstatement on cache-heavy workloads). The fix: input_tokens already
  // includes cached, so don't add input_cached_tokens; only use it to
  // compute the cache discount.
  const totalInput = toInt(result['input_tokens']);
  const cachedInput = toInt(result['input_cached_tokens']);
  const audioInput = toInt(result['input_audio_tokens']);
  const inputTokens = totalInput + audioInput;
  const uncachedInput = Math.max(0, totalInput - cachedInput);

  const outputTokens =
    toInt(result['output_tokens']) + toInt(result['output_audio_tokens']);
  const totalTokens = inputTokens + outputTokens;

  const requestCount = toInt(result['num_model_requests']);
  const calls = requestCount > 0 ? requestCount : 1;

  // Audit C3 (complete): prefer DB-configured cache pricing, fall back to
  // documented OpenAI ratio (~50% of input).
  const pricing = getPricing(model);
  const OPENAI_CACHED_INPUT_RATIO = 0.5;
  const cachedRate = pricing.cacheReadCostPer1M ?? pricing.inputCostPer1M * OPENAI_CACHED_INPUT_RATIO;
  const inputCost =
    ((uncachedInput + audioInput) / 1_000_000) * pricing.inputCostPer1M +
    (cachedInput / 1_000_000) * cachedRate;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1M;
  const totalCost = inputCost + outputCost;
  void calculateCost;

  const projectId = toString(result['project_id']);
  const userId = toString(result['user_id']);

  const nativeRow: Record<string, unknown> = {
    start_time: bucket['start_time'] ?? null,
    end_time: bucket['end_time'] ?? null,
    model,
    project_id: projectId ?? null,
    user_id: userId ?? null,
    input_tokens: toInt(result['input_tokens']),
    input_cached_tokens: toInt(result['input_cached_tokens']),
    output_tokens: toInt(result['output_tokens']),
    num_model_requests: requestCount,
  };

  return {
    timestamp,
    appName: projectId,
    userId,
    model,
    provider: 'openai',
    promptText: `[OpenAI usage rollup: ${totalTokens} tokens across ${calls} call${calls === 1 ? '' : 's'}]`,
    responseText: null,
    inputTokens,
    outputTokens,
    totalTokens,
    inputCost,
    outputCost,
    totalCost,
    callCount: calls,
    category: 'other',
    complexity: 'simple',
    complexityScore: 0,
    dimensions: '[]',
    characteristics: JSON.stringify({
      source: 'import',
      sourceKind: 'openai-usage-report',
      requestCount: calls,
    }),
    latencyMs: null,
    metadata: JSON.stringify({
      source: 'import',
      provider: 'openai',
      native: nativeRow,
    }),
    potentialSavedTokens: 0,
    potentialSavedCost: 0,
  };
}

async function run(ctx: ImporterContext): Promise<ImportResult> {
  if (!ctx.apiKey) {
    throw new Error('OpenAI importer requires an admin API key');
  }

  const rangeTo = ctx.rangeTo ?? new Date();
  const rangeFrom =
    ctx.rangeFrom ?? new Date(rangeTo.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // OpenAI usage API uses unix seconds for start_time / end_time.
  const startTimeSec = Math.floor(rangeFrom.getTime() / 1000);
  const endTimeSec = Math.floor(rangeTo.getTime() / 1000);

  const records: ImportedRecord[] = [];
  const warnings: string[] = [];

  let pageToken: string | undefined;
  let pagesFetched = 0;
  let truncated = false;
  let sawUnexpectedShape = false;

  while (pagesFetched < MAX_PAGES) {
    let body: unknown;
    try {
      body = await fetchPage(ctx.apiKey, startTimeSec, endTimeSec, pageToken);
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
    pagesFetched += 1;

    const buckets = extractBuckets(body);
    if (buckets.length === 0 && pagesFetched === 1) {
      // Distinguish "empty range" from "shape we don't understand".
      if (isRecord(body) && !('data' in body)) {
        sawUnexpectedShape = true;
        warnings.push(
          'OpenAI usage response did not contain a `data` array. The API shape may have changed.',
        );
      } else {
        warnings.push('OpenAI usage report returned no data for the requested range.');
      }
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
        const rec = normalizeRecord(bucket, result, { rangeFrom });
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
      `OpenAI importer truncated at ${MAX_RECORDS} records — narrow the date range to capture more.`,
    );
  }
  if (pagesFetched >= MAX_PAGES) {
    warnings.push(`OpenAI importer stopped after ${MAX_PAGES} pages — narrow the date range.`);
  }
  if (sawUnexpectedShape && records.length === 0) {
    warnings.push(
      'No records normalized. Verify the OpenAI admin key has org-level usage access and that the endpoint shape matches `data[].results[]`.',
    );
  }

  return {
    records,
    warnings,
    rawRangeFrom: rangeFrom,
    rawRangeTo: rangeTo,
  };
}

export const openaiImporter: Importer = {
  provider: 'openai',
  label: 'OpenAI (org usage API)',
  run,
};
