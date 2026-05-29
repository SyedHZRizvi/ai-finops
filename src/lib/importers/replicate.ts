// Replicate account-usage importer — REAL implementation.
//
// Replicate is one of the few non-OpenAI/Anthropic providers that exposes a
// genuine per-day, per-model usage API. We pull daily buckets from the
// account usage endpoint and emit one ImportedRecord per (day × model) row.
//
// Endpoint: GET https://api.replicate.com/v1/account/usage
//   query params: start_date=YYYY-MM-DD, end_date=YYYY-MM-DD
// Auth:     Authorization: Token <api_key>
//
// Replicate's response shape (documented at
// https://replicate.com/docs/reference/http#account.usage) is a JSON object
// whose top-level shape has evolved over time. We accept both:
//
//   { "data": [ { "date": "2024-04-01", "models": [ { "model": "...", "cost": 0.04, "runs": 12, ... }, ... ] }, ... ] }
//
// and the older flat-array form. Every field is read defensively because the
// account usage endpoint is documented as "beta" and field names have shifted
// in past releases. When unparseable, we skip the row with a warning rather
// than throw.
//
// Cost is returned in USD by the API; we use it directly instead of
// re-pricing through ../pricing because Replicate's hardware-tier × runtime
// pricing model doesn't map cleanly to a flat $/1M-token rate.
//
// Tokens are not always reported (image / video / audio models bill by
// runtime). When the API omits them, ImportedRecord gets `inputTokens =
// outputTokens = 0` and a warning surfaces, so the operator knows token-level
// rollups will under-report for those rows.

import type { ImportedRecord, Importer, ImporterContext, ImportResult } from './types';

const BASE_URL = 'https://api.replicate.com/v1/account/usage';
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_RECORDS = 1000;
const MAX_PAGES = 50;
const REQUEST_TIMEOUT_MS = 30_000;

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

function toFloat(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

function toStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
}

function toDateMidnightUtc(ymdStr: string): Date {
  // Replicate returns dates like `2024-04-01` — parse as UTC midnight.
  const d = new Date(`${ymdStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// --- fetch with timeout ----------------------------------------------------

async function fetchWithTimeout(
  url: string,
  apiKey: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Token ${apiKey}`,
        'content-type': 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPage(
  apiKey: string,
  startDate: string,
  endDate: string,
  pageUrl: string | undefined,
): Promise<unknown> {
  // Replicate's `next` cursor is a fully-qualified URL when present, so we
  // honour it verbatim on subsequent pages.
  let url: string;
  if (pageUrl) {
    url = pageUrl;
  } else {
    const u = new URL(BASE_URL);
    u.searchParams.set('start_date', startDate);
    u.searchParams.set('end_date', endDate);
    url = u.toString();
  }

  const resp = await fetchWithTimeout(url, apiKey, REQUEST_TIMEOUT_MS);

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    if (resp.status === 401) {
      throw new Error(
        'Replicate rejected the API token (HTTP 401). Verify the token at ' +
          'https://replicate.com/account/api-tokens has not been rotated or revoked.',
      );
    }
    if (resp.status === 403) {
      throw new Error(
        'Replicate API token does not have permission to read account usage (HTTP 403). ' +
          'The token must be associated with the account that owns the billing record.',
      );
    }
    if (resp.status === 404) {
      throw new Error(
        'Replicate /v1/account/usage endpoint returned HTTP 404. The account usage API may ' +
          'have moved; check https://replicate.com/docs/reference/http for the current path.',
      );
    }
    throw new Error(
      `Replicate usage report failed: HTTP ${resp.status} ${resp.statusText} — ${body.slice(0, 200)}`,
    );
  }

  return resp.json() as Promise<unknown>;
}

// --- response shape extraction --------------------------------------------

interface DayBucket {
  date: string;
  models: unknown[];
}

function extractDayBuckets(body: unknown): DayBucket[] {
  // Newer documented shape: { data: [ { date, models: [...] } ] }
  if (isRecord(body)) {
    const data = body['data'];
    if (Array.isArray(data)) {
      return data
        .map((entry) => {
          if (!isRecord(entry)) return null;
          const date = toStr(entry['date']) ?? toStr(entry['day']) ?? toStr(entry['timestamp']);
          if (!date) return null;
          const models = entry['models'];
          if (!Array.isArray(models)) {
            // Some shapes inline the model row at the day level — wrap into
            // a one-element array so the downstream loop is uniform.
            return { date, models: [entry] };
          }
          return { date, models };
        })
        .filter((x): x is DayBucket => x !== null);
    }
    // Fallback: { usage: [...] } variant.
    const usage = body['usage'];
    if (Array.isArray(usage)) {
      return usage
        .map((entry) => {
          if (!isRecord(entry)) return null;
          const date = toStr(entry['date']) ?? toStr(entry['day']);
          if (!date) return null;
          const models = Array.isArray(entry['models']) ? entry['models'] : [entry];
          return { date, models };
        })
        .filter((x): x is DayBucket => x !== null);
    }
  }
  // Bare-array variant — assume each row already has a `date`.
  if (Array.isArray(body)) {
    return body
      .map((entry) => {
        if (!isRecord(entry)) return null;
        const date = toStr(entry['date']) ?? toStr(entry['day']);
        if (!date) return null;
        const models = Array.isArray(entry['models']) ? entry['models'] : [entry];
        return { date, models };
      })
      .filter((x): x is DayBucket => x !== null);
  }
  return [];
}

function extractNextPageUrl(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  // Replicate uses `next` (fully-qualified URL) on most paginated endpoints.
  const next = toStr(body['next']);
  if (next) return next;
  const paging = body['paging'];
  if (isRecord(paging)) {
    const pagingNext = toStr(paging['next']);
    if (pagingNext) return pagingNext;
  }
  return undefined;
}

// --- normalization --------------------------------------------------------

function normalizeRow(
  date: string,
  row: unknown,
): ImportedRecord | { skip: true; reason: string } {
  if (!isRecord(row)) return { skip: true, reason: 'row is not an object' };

  // Replicate's per-day record exposes the model under various keys; pick
  // the first non-empty one.
  const model =
    toStr(row['model']) ?? toStr(row['model_name']) ?? toStr(row['name']) ?? undefined;
  if (!model) return { skip: true, reason: 'row missing a model field' };

  // Cost: documented field is `cost`, but legacy responses used
  // `total_cost` / `total_amount_usd`.
  const cost =
    toFloat(row['cost']) ||
    toFloat(row['total_cost']) ||
    toFloat(row['total_amount_usd']) ||
    toFloat(row['amount']);

  // Token counts — usually absent for image/audio/video models.
  const inputTokens =
    toInt(row['input_tokens']) || toInt(row['prompt_tokens']) || toInt(row['in_tokens']);
  const outputTokens =
    toInt(row['output_tokens']) || toInt(row['completion_tokens']) || toInt(row['out_tokens']);
  const totalTokens = inputTokens + outputTokens;

  const requestCount =
    toInt(row['runs']) || toInt(row['request_count']) || toInt(row['predictions']) || 0;
  const calls = requestCount > 0 ? requestCount : 1;

  // Compute input vs output cost splits when possible; otherwise lump
  // everything into outputCost so totals reconcile.
  let inputCost = 0;
  let outputCost = 0;
  if (totalTokens > 0) {
    inputCost = cost * (inputTokens / totalTokens);
    outputCost = cost - inputCost;
  } else {
    outputCost = cost;
  }
  const totalCost = cost;

  const timestamp = toDateMidnightUtc(date);

  const nativeRow: Record<string, unknown> = {
    date,
    model,
    cost,
    runs: requestCount,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };

  return {
    timestamp,
    model,
    provider: 'replicate',
    promptText:
      totalTokens > 0
        ? `[Replicate usage rollup: ${totalTokens} tokens across ${calls} run${calls === 1 ? '' : 's'}]`
        : `[Replicate usage rollup: ${calls} run${calls === 1 ? '' : 's'} ($${cost.toFixed(4)})]`,
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
      sourceKind: 'replicate-account-usage',
      requestCount: calls,
    }),
    latencyMs: null,
    metadata: JSON.stringify({
      source: 'import',
      provider: 'replicate',
      native: nativeRow,
    }),
    potentialSavedTokens: 0,
    potentialSavedCost: 0,
  };
}

// --- entry point ----------------------------------------------------------

async function run(ctx: ImporterContext): Promise<ImportResult> {
  if (!ctx.apiKey) {
    throw new Error('Replicate importer requires an API token (r8_... from replicate.com).');
  }

  const rangeTo = ctx.rangeTo ?? new Date();
  const rangeFrom =
    ctx.rangeFrom ?? new Date(rangeTo.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const startDate = ymd(rangeFrom);
  const endDate = ymd(rangeTo);

  const records: ImportedRecord[] = [];
  const warnings: string[] = [];
  let sawTokensMissing = false;

  let nextUrl: string | undefined;
  let pagesFetched = 0;
  let truncated = false;

  while (pagesFetched < MAX_PAGES) {
    let body: unknown;
    try {
      body = await fetchPage(ctx.apiKey, startDate, endDate, nextUrl);
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
    pagesFetched += 1;

    const buckets = extractDayBuckets(body);
    if (buckets.length === 0 && pagesFetched === 1) {
      warnings.push(
        `Replicate account usage returned no data for ${startDate} → ${endDate}. ` +
          `Confirm the account had usage in that range.`,
      );
    }

    for (const bucket of buckets) {
      for (const row of bucket.models) {
        if (records.length >= MAX_RECORDS) {
          truncated = true;
          break;
        }
        const result = normalizeRow(bucket.date, row);
        if ('skip' in result) {
          warnings.push(`Skipped Replicate row on ${bucket.date}: ${result.reason}.`);
          continue;
        }
        if (result.inputTokens === 0 && result.outputTokens === 0 && result.totalCost > 0) {
          sawTokensMissing = true;
        }
        records.push(result);
      }
      if (truncated) break;
    }
    if (truncated) break;

    const next = extractNextPageUrl(body);
    if (!next || next === nextUrl) break;
    nextUrl = next;
  }

  if (truncated) {
    warnings.push(
      `Replicate importer truncated at ${MAX_RECORDS} records — narrow the date range to capture more.`,
    );
  }
  if (pagesFetched >= MAX_PAGES) {
    warnings.push(`Replicate importer stopped after ${MAX_PAGES} pages — narrow the date range.`);
  }
  if (sawTokensMissing) {
    warnings.push(
      'Some Replicate rows had cost but no token counts. This is normal for image / audio / video ' +
        'models which bill by hardware runtime, not tokens. Token-based rollups will under-report ' +
        'for those rows; cost rollups are still accurate.',
    );
  }

  return {
    records,
    warnings,
    rawRangeFrom: rangeFrom,
    rawRangeTo: rangeTo,
  };
}

export const replicateImporter: Importer = {
  provider: 'replicate',
  label: 'Replicate (account usage)',
  run,
};
