// Google Vertex AI / Gemini API cost importer (stub).
//
// Vertex AI usage is not exposed via a per-call admin endpoint. The standard
// programmatic source of truth is Cloud Billing — either the REST API
// (https://cloudbilling.googleapis.com/v1/) or, more commonly, the BigQuery
// billing export that customers enable in the Cloud Console.
//
// The BigQuery route is the right long-term target: enabling billing export
// to BigQuery materializes a `gcp_billing_export_v1_<billing-account>` table
// per day, with per-SKU rows that include `service.description = 'Vertex AI'`
// and the model identifier in the SKU description.
//
// Endpoint (future native impl, BigQuery route):
//   POST https://bigquery.googleapis.com/bigquery/v2/projects/<project>/queries
//   Auth: OAuth 2.0 access token derived from the service-account JSON.
//   Body: parameterized SELECT against the billing export table.
//
// Until the BigQuery client (and a small JWT signer for the service-account
// flow) lands, this importer is a stub: it parses and validates the
// service-account JSON so an operator gets clear feedback on shape errors,
// then returns an empty result with a warning pointing at the CSV upload
// path documented in docs/INTEGRATIONS.md.
//
// Credential format (JSON in the apiKey field) — a Google service-account
// key. The minimum fields we use:
//   {
//     "type": "service_account",
//     "project_id": "...",
//     "private_key_id": "...",
//     "private_key": "-----BEGIN PRIVATE KEY-----\n...",
//     "client_email": "...@<project>.iam.gserviceaccount.com",
//     "client_id": "..."
//   }
//
// When the native implementation lands, run() will:
//   1. Parse the service-account JSON (already done below).
//   2. Mint a JWT and exchange it for an OAuth 2.0 access token with the
//      https://www.googleapis.com/auth/bigquery scope.
//   3. POST a parameterized SELECT against
//      `<project>.<dataset>.gcp_billing_export_v1_<billing-account>` that
//      groups by `usage_start_time`, `sku.description`, and emits cost +
//      usage rows. (The dataset name is configured at billing-export time;
//      we'll need a separate UI input for it.)
//   4. Translate each SKU description into a Vertex model id, splitting
//      input vs output via the `Input` / `Output` suffix in the SKU name.
//   5. Emit one ImportedRecord per day-bucket × model.

import type { ImportedRecord, Importer, ImporterContext, ImportResult } from './types';

interface VertexCredential {
  type: string;
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function parseCredential(raw: string): VertexCredential {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'Google Vertex AI credential must be a service-account JSON key. Download it from the Cloud Console (IAM → Service Accounts → Keys → Add Key → JSON).',
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Google Vertex AI credential must be a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;
  const type = typeof obj.type === 'string' ? obj.type.trim() : '';
  const projectId = typeof obj.project_id === 'string' ? obj.project_id.trim() : '';
  const clientEmail = typeof obj.client_email === 'string' ? obj.client_email.trim() : '';
  const privateKey = typeof obj.private_key === 'string' ? obj.private_key : '';

  if (type !== 'service_account') {
    throw new Error(
      'Google Vertex AI credential must have `"type": "service_account"`. Personal OAuth tokens are not supported.',
    );
  }
  const missing: string[] = [];
  if (!projectId) missing.push('project_id');
  if (!clientEmail) missing.push('client_email');
  if (!privateKey) missing.push('private_key');
  if (missing.length > 0) {
    throw new Error(
      `Google Vertex AI credential is missing required field(s): ${missing.join(', ')}.`,
    );
  }
  return { type, projectId, clientEmail, privateKey };
}

async function run(ctx: ImporterContext): Promise<ImportResult> {
  if (!ctx.apiKey) {
    throw new Error(
      'Google Vertex AI importer requires a service-account JSON key in the apiKey field.',
    );
  }

  // Validate the service-account shape up front. This gives the operator
  // clear feedback now (wrong format vs. expired key vs. missing role) and
  // means the future BigQuery / Cloud Billing client can drop the parse
  // step in place.
  const credential = parseCredential(ctx.apiKey);
  void credential; // unused until the BigQuery client lands.

  const rangeTo = ctx.rangeTo ?? new Date();
  const rangeFrom = ctx.rangeFrom ?? new Date(rangeTo.getTime() - 30 * 24 * 60 * 60 * 1000);

  const records: ImportedRecord[] = [];
  const warnings: string[] = [
    'Native Google Vertex AI importer not yet implemented. Use CSV import for now — see docs/INTEGRATIONS.md.',
  ];

  return {
    records,
    warnings,
    rawRangeFrom: rangeFrom,
    rawRangeTo: rangeTo,
  };
}

export const vertexImporter: Importer = {
  provider: 'vertex',
  label: 'Google Vertex AI (Cloud Billing)',
  run,
};
