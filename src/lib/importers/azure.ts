// Azure OpenAI Service cost importer (stub).
//
// Azure OpenAI usage is exposed through Azure Cost Management, not a
// per-deployment usage API. The standard programmatic path is the
// Cost Management Query API filtered to the
// "Microsoft.CognitiveServices/accounts" resource type and the
// "OpenAI" kind:
//
//   POST https://management.azure.com/subscriptions/<sub-id>/
//        providers/Microsoft.CostManagement/query?api-version=2023-11-01
//   Auth: Bearer <AAD access token>
//
// The query body groups by ResourceId (one per OpenAI deployment) and
// MeterSubCategory (which distinguishes input vs output tokens and the
// model family). Pagination via $skiptoken.
//
// Until an AAD token flow ships (client-credentials grant against the
// configured tenant + clientId + clientSecret), this importer is a stub:
// it parses and validates the credential JSON so an operator gets clear
// feedback on shape errors, then returns an empty result with a warning
// pointing at the CSV upload path documented in docs/INTEGRATIONS.md.
//
// Credential format (JSON in the apiKey field):
//   {
//     "tenantId": "...",
//     "clientId": "...",
//     "clientSecret": "...",
//     "subscriptionId": "..."
//   }
//
// When the native implementation lands, run() will:
//   1. Parse the credential as above (already done below).
//   2. Exchange (tenantId, clientId, clientSecret) for an AAD bearer
//      token via https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token
//      with scope `https://management.azure.com/.default`.
//   3. POST the Cost Management query body for each day-bucket in the
//      requested range, grouping by ResourceId + MeterSubCategory.
//   4. Translate each row into ImportedRecord, splitting input vs output
//      tokens by meter sub-category and using ResourceId as appName.
//   5. Honour pagination via the response `nextLink`.

import type { ImportedRecord, Importer, ImporterContext, ImportResult } from './types';

interface AzureCredential {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
}

function parseCredential(raw: string): AzureCredential {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'Azure OpenAI credential must be a JSON object of the form `{"tenantId":"...","clientId":"...","clientSecret":"...","subscriptionId":"..."}`.',
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Azure OpenAI credential must be a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;
  const tenantId = typeof obj.tenantId === 'string' ? obj.tenantId.trim() : '';
  const clientId = typeof obj.clientId === 'string' ? obj.clientId.trim() : '';
  const clientSecret = typeof obj.clientSecret === 'string' ? obj.clientSecret.trim() : '';
  const subscriptionId =
    typeof obj.subscriptionId === 'string' ? obj.subscriptionId.trim() : '';
  const missing: string[] = [];
  if (!tenantId) missing.push('tenantId');
  if (!clientId) missing.push('clientId');
  if (!clientSecret) missing.push('clientSecret');
  if (!subscriptionId) missing.push('subscriptionId');
  if (missing.length > 0) {
    throw new Error(
      `Azure OpenAI credential is missing required field(s): ${missing.join(', ')}.`,
    );
  }
  return { tenantId, clientId, clientSecret, subscriptionId };
}

async function run(ctx: ImporterContext): Promise<ImportResult> {
  if (!ctx.apiKey) {
    throw new Error(
      'Azure OpenAI importer requires a credential. Provide a JSON blob with tenantId, clientId, clientSecret, and subscriptionId.',
    );
  }

  // Validate the credential shape up front. Future native impl can drop
  // its own parse step in place of this one.
  const credential = parseCredential(ctx.apiKey);
  void credential; // unused until the AAD client lands.

  const rangeTo = ctx.rangeTo ?? new Date();
  const rangeFrom = ctx.rangeFrom ?? new Date(rangeTo.getTime() - 30 * 24 * 60 * 60 * 1000);

  const records: ImportedRecord[] = [];
  const warnings: string[] = [
    'Native Azure OpenAI importer not yet implemented. Use CSV import for now — see docs/INTEGRATIONS.md.',
  ];

  return {
    records,
    warnings,
    rawRangeFrom: rangeFrom,
    rawRangeTo: rangeTo,
  };
}

export const azureImporter: Importer = {
  provider: 'azure',
  label: 'Azure OpenAI (Cost Management)',
  run,
};
