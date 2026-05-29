// AWS Bedrock cost importer — backed by AWS Cost Explorer (GetCostAndUsage).
//
// Cost Explorer is the canonical programmatic source for Bedrock spend. It
// does NOT surface token counts, so this importer emits per-day, per-usage-type
// cost rows with `inputTokens = outputTokens = 0` and an explicit warning.
// Customers who need per-call token detail should wrap their Bedrock invokes
// with the FinOps SDK.
//
// Endpoint:
//   POST https://ce.us-east-1.amazonaws.com/
//   X-Amz-Target: AWSInsightsIndexService.GetCostAndUsage
//   SigV4-signed.
//
// Cost Explorer is a global service that is only reachable in us-east-1
// regardless of the operator's chosen Bedrock region. We sign requests with
// region=us-east-1 but the body's `Filter` covers Bedrock spend across every
// region in the account.
//
// Credential format (JSON in the apiKey field):
//   {
//     "accessKeyId":     "AKIA...",
//     "secretAccessKey": "...",
//     "region":          "us-east-1",
//     "sessionToken":    "..."   // optional, for STS-assumed roles
//   }
//
// The IAM principal must have `ce:GetCostAndUsage` (in IAM-land this is part
// of the `AWSBillingReadOnlyAccess` and `Billing` managed policies, or a
// custom policy that grants `ce:GetCostAndUsage` on `*`).

import type { ImportedRecord, Importer, ImporterContext, ImportResult } from './types';
import { signRequest, type AwsCredentials } from './awsSig';

interface BedrockCredential {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
}

const CE_HOST = 'https://ce.us-east-1.amazonaws.com/';
const CE_REGION = 'us-east-1';
const CE_SERVICE = 'ce';
const CE_TARGET = 'AWSInsightsIndexService.GetCostAndUsage';
// Cost Explorer rejects requests with more than ~365 days of granularity; cap
// the lookback aggressively so a too-wide range gives a clean error.
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_LOOKBACK_DAYS = 365;
const MAX_PAGES = 50;

// --- credential parsing ----------------------------------------------------

function parseCredential(raw: string): BedrockCredential {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'AWS Bedrock credential must be a JSON object of the form `{"accessKeyId":"...","secretAccessKey":"...","region":"..."}`.',
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('AWS Bedrock credential must be a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;
  const accessKeyId = typeof obj.accessKeyId === 'string' ? obj.accessKeyId.trim() : '';
  const secretAccessKey =
    typeof obj.secretAccessKey === 'string' ? obj.secretAccessKey.trim() : '';
  const region = typeof obj.region === 'string' ? obj.region.trim() : '';
  const sessionToken =
    typeof obj.sessionToken === 'string' && obj.sessionToken.trim().length > 0
      ? obj.sessionToken.trim()
      : undefined;
  const missing: string[] = [];
  if (!accessKeyId) missing.push('accessKeyId');
  if (!secretAccessKey) missing.push('secretAccessKey');
  if (!region) missing.push('region');
  if (missing.length > 0) {
    throw new Error(
      `AWS Bedrock credential is missing required field(s): ${missing.join(', ')}.`,
    );
  }
  return { accessKeyId, secretAccessKey, region, sessionToken };
}

// --- USAGE_TYPE → model name extraction ------------------------------------

/**
 * Best-effort parse of a Bedrock USAGE_TYPE string into a model identifier.
 *
 * Real-world Cost Explorer USAGE_TYPE values for Bedrock look like:
 *   USE1-Bedrock-Input-Tokens-Anthropic.Claude-3-Sonnet
 *   USW2-Bedrock-Output-Tokens-Meta.Llama-3-8B
 *   Bedrock-Provisioned-Throughput-Anthropic.Claude-3-Haiku
 *   Bedrock-Image-Tokens-Stability.SD3
 *
 * We strip the region prefix and the "Bedrock-*-Tokens-" middle, lowercase
 * what's left, and trim the vendor namespace. If we can't recognize the
 * shape, we return the original string unchanged so the operator can still
 * see what came back.
 */
function extractModelFromUsageType(usageType: string): string {
  if (!usageType) return 'bedrock-unknown';
  // Drop region prefix like `USE1-`, `EUW2-`, etc.
  let s = usageType.replace(/^[A-Z]{3}\d-/i, '');
  // Drop leading `Bedrock-` if present.
  s = s.replace(/^Bedrock-?/i, '');
  // Drop `Input-Tokens-`, `Output-Tokens-`, `Image-Tokens-`,
  // `Provisioned-Throughput-`, etc.
  s = s.replace(/^(Input|Output|Image|Embedding|Cache)-?Tokens-/i, '');
  s = s.replace(/^Provisioned-Throughput-?/i, '');
  // Drop a vendor namespace prefix like `Anthropic.` or `Meta.` if present.
  s = s.replace(/^[A-Za-z0-9]+\./, '');
  s = s.trim();
  return s.length > 0 ? s.toLowerCase() : usageType.toLowerCase();
}

// --- Cost Explorer call ----------------------------------------------------

interface CeGroup {
  Keys?: string[];
  Metrics?: Record<string, { Amount?: string; Unit?: string } | undefined>;
}

interface CeResultByTime {
  TimePeriod?: { Start?: string; End?: string };
  Groups?: CeGroup[];
  Total?: Record<string, { Amount?: string; Unit?: string } | undefined>;
  Estimated?: boolean;
}

interface CeResponse {
  ResultsByTime?: CeResultByTime[];
  NextPageToken?: string;
}

function ymd(d: Date): string {
  // Cost Explorer expects `YYYY-MM-DD` and treats the End date as exclusive.
  return d.toISOString().slice(0, 10);
}

async function callCostExplorer(
  credential: BedrockCredential,
  start: string,
  end: string,
  nextPageToken: string | undefined,
): Promise<CeResponse> {
  const payload: Record<string, unknown> = {
    TimePeriod: { Start: start, End: end },
    Granularity: 'DAILY',
    Filter: {
      Dimensions: { Key: 'SERVICE', Values: ['Amazon Bedrock'] },
    },
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'USAGE_TYPE' }],
  };
  if (nextPageToken) {
    payload.NextPageToken = nextPageToken;
  }

  const awsCreds: AwsCredentials = {
    accessKeyId: credential.accessKeyId,
    secretAccessKey: credential.secretAccessKey,
    sessionToken: credential.sessionToken,
  };

  const signed = await signRequest({
    method: 'POST',
    url: CE_HOST,
    region: CE_REGION,
    service: CE_SERVICE,
    credentials: awsCreds,
    headers: {
      'X-Amz-Target': CE_TARGET,
      'Content-Type': 'application/x-amz-json-1.1',
    },
    body: JSON.stringify(payload),
  });

  const resp = await fetch(signed.url, {
    method: 'POST',
    headers: signed.headers,
    body: signed.body,
  });

  const text = await resp.text().catch(() => '');
  if (!resp.ok) {
    const snippet = text.slice(0, 300);
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(
        `AWS Cost Explorer returned HTTP ${resp.status}. Verify the IAM user has the ` +
          `\`ce:GetCostAndUsage\` permission (the managed policy \`AWSBillingReadOnlyAccess\` ` +
          `grants this). Response body: ${snippet}`,
      );
    }
    if (resp.status === 400 && /InvalidParameterValue/.test(text)) {
      throw new Error(
        `AWS Cost Explorer rejected the request as malformed: ${snippet}. ` +
          `Double-check the date range — End must be after Start and within the last ` +
          `${MAX_LOOKBACK_DAYS} days.`,
      );
    }
    throw new Error(
      `AWS Cost Explorer call failed: HTTP ${resp.status} ${resp.statusText} — ${snippet}`,
    );
  }

  try {
    return JSON.parse(text) as CeResponse;
  } catch {
    throw new Error(
      `AWS Cost Explorer returned a non-JSON body (truncated): ${text.slice(0, 200)}`,
    );
  }
}

// --- normalization ---------------------------------------------------------

function toMidnightUtc(ymdStr: string): Date {
  // Cost Explorer's TimePeriod.Start is already `YYYY-MM-DD`; parse as UTC.
  const d = new Date(`${ymdStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function buildRecord(
  dayStart: string,
  usageType: string,
  amount: number,
  rawGroup: CeGroup,
): ImportedRecord {
  const model = extractModelFromUsageType(usageType);
  const timestamp = toMidnightUtc(dayStart);

  return {
    timestamp,
    model,
    provider: 'bedrock',
    promptText: `[Bedrock usage rollup: $${amount.toFixed(4)} on ${dayStart} (${usageType})]`,
    responseText: null,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCost: 0,
    outputCost: 0,
    totalCost: amount,
    callCount: 1,
    category: 'other',
    complexity: 'simple',
    complexityScore: 0,
    dimensions: '[]',
    characteristics: JSON.stringify({
      source: 'import',
      sourceKind: 'aws-bedrock-cost-explorer',
      usageType,
    }),
    latencyMs: null,
    metadata: JSON.stringify({
      source: 'import',
      provider: 'bedrock',
      sourceKind: 'aws-bedrock-cost-explorer',
      usageType,
      native: rawGroup,
    }),
    potentialSavedTokens: 0,
    potentialSavedCost: 0,
  };
}

// --- entry point -----------------------------------------------------------

async function run(ctx: ImporterContext): Promise<ImportResult> {
  if (!ctx.apiKey) {
    throw new Error(
      'AWS Bedrock importer requires a credential. Provide a JSON blob with accessKeyId, secretAccessKey, and region.',
    );
  }
  const credential = parseCredential(ctx.apiKey);

  const rangeTo = ctx.rangeTo ?? new Date();
  const requestedFrom =
    ctx.rangeFrom ?? new Date(rangeTo.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Cap the lookback so a misconfigured caller doesn't trigger a CE-side
  // rejection mid-pagination.
  const earliest = new Date(rangeTo.getTime() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rangeFrom = requestedFrom < earliest ? earliest : requestedFrom;

  // Cost Explorer needs Start < End and treats End as exclusive. If the
  // caller passed Start === End we extend End by a day to actually capture
  // that bucket.
  const start = ymd(rangeFrom);
  let end = ymd(rangeTo);
  if (start === end) {
    end = ymd(new Date(rangeTo.getTime() + 24 * 60 * 60 * 1000));
  }

  const records: ImportedRecord[] = [];
  const warnings: string[] = [
    'AWS Cost Explorer returns cost only, not token counts. Bedrock totals are accurate; ' +
      'token-level breakdowns will be 0. For per-call detail, use the FinOps SDK wrapper ' +
      'around your Bedrock invoke calls.',
  ];

  let nextPageToken: string | undefined;
  let pagesFetched = 0;

  try {
    while (pagesFetched < MAX_PAGES) {
      const body = await callCostExplorer(credential, start, end, nextPageToken);
      pagesFetched += 1;

      const buckets = Array.isArray(body.ResultsByTime) ? body.ResultsByTime : [];
      if (buckets.length === 0 && pagesFetched === 1) {
        warnings.push(
          `AWS Cost Explorer returned no Bedrock spend for ${start} → ${end}. ` +
            `Confirm the account actually has Bedrock usage in that range.`,
        );
      }

      for (const bucket of buckets) {
        const dayStart = bucket.TimePeriod?.Start ?? start;
        const groups = Array.isArray(bucket.Groups) ? bucket.Groups : [];
        for (const group of groups) {
          const usageType = group.Keys?.[0] ?? '';
          const amountStr = group.Metrics?.UnblendedCost?.Amount;
          const amount = amountStr ? Number.parseFloat(amountStr) : NaN;
          if (!Number.isFinite(amount) || amount === 0) {
            // Skip zero-cost rows; CE returns those for usage types with only
            // free-tier quantity, which would just clutter the dashboard.
            continue;
          }
          records.push(buildRecord(dayStart, usageType, amount, group));
        }
      }

      nextPageToken =
        typeof body.NextPageToken === 'string' && body.NextPageToken.length > 0
          ? body.NextPageToken
          : undefined;
      if (!nextPageToken) break;
    }

    if (pagesFetched >= MAX_PAGES && nextPageToken) {
      warnings.push(
        `AWS Cost Explorer importer stopped after ${MAX_PAGES} pages — narrow the date range to capture more.`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't crash the import job — surface the error as a warning so the UI
    // can show it next to the (likely empty) record list.
    warnings.push(msg);
  }

  return {
    records,
    warnings,
    rawRangeFrom: rangeFrom,
    rawRangeTo: rangeTo,
  };
}

export const bedrockImporter: Importer = {
  provider: 'bedrock',
  label: 'Amazon Bedrock (Cost Explorer)',
  run,
};
