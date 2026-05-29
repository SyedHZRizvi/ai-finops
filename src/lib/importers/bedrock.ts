// AWS Bedrock cost importer (stub).
//
// AWS Bedrock does not expose a unified usage admin API. The canonical
// programmatic path is AWS Cost Explorer's GetCostAndUsageWithResources call
// filtered to service "Amazon Bedrock", grouped by USAGE_TYPE (which carries
// the model identifier on input vs output tokens) and by LINKED_ACCOUNT.
//
// Endpoint (future native impl):
//   POST https://ce.<region>.amazonaws.com/
//   X-Amz-Target: AWSInsightsIndexService.GetCostAndUsageWithResources
//   SigV4-signed with an IAM principal carrying `ce:GetCostAndUsage`.
//
// Building a SigV4 signer in pure TypeScript (no AWS SDK) is feasible but
// non-trivial. Until that lands, this importer is a stub: it parses and
// validates the credential JSON so an operator gets clear feedback on
// shape errors, then returns an empty result with a warning pointing at
// the CSV upload path documented in docs/INTEGRATIONS.md.
//
// Credential format (JSON in the apiKey field):
//   {
//     "accessKeyId": "AKIA...",
//     "secretAccessKey": "...",
//     "region": "us-east-1"
//   }
//
// When the native implementation lands, the run() body will:
//   1. Parse the credential as above.
//   2. Build SigV4 headers for GetCostAndUsage.
//   3. POST { TimePeriod, Granularity: 'DAILY', Filter: { Dimensions: {
//      Key: 'SERVICE', Values: ['Amazon Bedrock'] } }, GroupBy: [
//      { Type: 'DIMENSION', Key: 'USAGE_TYPE' },
//      { Type: 'DIMENSION', Key: 'LINKED_ACCOUNT' } ], Metrics: [
//      'UnblendedCost', 'UsageQuantity' ] } per day-bucket.
//   4. For each ResultsByTime[].Groups[]: parse USAGE_TYPE to extract
//      the Bedrock model id and the token side (input/output), divide
//      UsageQuantity into input/output token counts, and emit one
//      ImportedRecord per (day × model × account) row.
//   5. Honour pagination via NextPageToken.

import type { ImportedRecord, Importer, ImporterContext, ImportResult } from './types';

interface BedrockCredential {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

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
  const secretAccessKey = typeof obj.secretAccessKey === 'string' ? obj.secretAccessKey.trim() : '';
  const region = typeof obj.region === 'string' ? obj.region.trim() : '';
  const missing: string[] = [];
  if (!accessKeyId) missing.push('accessKeyId');
  if (!secretAccessKey) missing.push('secretAccessKey');
  if (!region) missing.push('region');
  if (missing.length > 0) {
    throw new Error(
      `AWS Bedrock credential is missing required field(s): ${missing.join(', ')}.`,
    );
  }
  return { accessKeyId, secretAccessKey, region };
}

async function run(ctx: ImporterContext): Promise<ImportResult> {
  if (!ctx.apiKey) {
    throw new Error(
      'AWS Bedrock importer requires a credential. Provide a JSON blob with accessKeyId, secretAccessKey, and region.',
    );
  }

  // Validate the credential shape up front. This gives the operator clear
  // feedback now (so they know they stored the wrong format) and means the
  // future native implementation can drop the parse step in place.
  const credential = parseCredential(ctx.apiKey);
  void credential; // unused until the SigV4 client lands.

  const rangeTo = ctx.rangeTo ?? new Date();
  const rangeFrom = ctx.rangeFrom ?? new Date(rangeTo.getTime() - 30 * 24 * 60 * 60 * 1000);

  const records: ImportedRecord[] = [];
  const warnings: string[] = [
    'Native AWS Bedrock importer not yet implemented. Use CSV import for now — see docs/INTEGRATIONS.md.',
  ];

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
