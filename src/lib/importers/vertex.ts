// Google Vertex AI cost importer — partial native support.
//
// The honest story: there is no GCP API that returns per-day Vertex AI spend
// the way Anthropic and OpenAI expose org-level usage. Cloud Billing's REST
// API (cloudbilling.googleapis.com) only returns SKU *metadata*, not the
// customer's consumption. Actual per-day Vertex usage lives in BigQuery once
// the customer enables Cloud Billing → BigQuery export, which is a separate
// piece of GCP setup that AI FinOps cannot do remotely.
//
// What this importer DOES do, natively:
//   1. Parses the service-account JSON.
//   2. Signs a JWT and exchanges it for an OAuth 2.0 access token against
//      Google's token endpoint. This validates that the key is real, the
//      service account exists, and the private_key matches.
//   3. Hits cloudbilling.googleapis.com's `services.list` to confirm the
//      access token works against an actual Google API.
//
// What it does NOT do, by design:
//   - Pull per-day cost rows. That requires either the BigQuery billing
//     export (customer-set-up, separate from this credential) or scraping
//     SKU pricing × usage from an undocumented combination of APIs.
//
// The importer emits an empty records array and a single actionable warning
// pointing the operator at the CSV billing-export path documented in
// docs/INTEGRATIONS.md. When the credential is wrong, the warning instead
// describes the exact validation failure.
//
// Credential format (the standard service-account JSON Google emits):
//   {
//     "type": "service_account",
//     "project_id": "...",
//     "private_key_id": "...",
//     "private_key": "-----BEGIN PRIVATE KEY-----\n...",
//     "client_email": "...@<project>.iam.gserviceaccount.com",
//     ...
//   }

import type { ImportedRecord, Importer, ImporterContext, ImportResult } from './types';
import { getAccessToken } from './gcpJwt';

interface VertexCredential {
  type: string;
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

// Scope used to probe the access token. We pick `cloud-billing.readonly`
// because it's the scope a *real* Vertex importer would need once a native
// usage source exists. If the service account is missing the matching IAM
// role, the token exchange itself still succeeds (scopes are caller-asserted)
// but the probe call to cloudbilling.googleapis.com will fail with 403, which
// is a useful signal to surface.
const PROBE_SCOPES = ['https://www.googleapis.com/auth/cloud-billing.readonly'];
const PROBE_URL = 'https://cloudbilling.googleapis.com/v1/services?pageSize=1';

// --- credential parsing ---------------------------------------------------

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

// --- credential probe -----------------------------------------------------

interface ProbeOutcome {
  ok: boolean;
  message: string;
}

async function probeCredential(credential: VertexCredential): Promise<ProbeOutcome> {
  // Step 1: exchange the JWT for an access token. Failures here mean the
  // service account itself is broken (revoked key, malformed PEM, wrong
  // client_email, etc.) — they're actionable for the operator.
  let tokenResp: Awaited<ReturnType<typeof getAccessToken>>;
  try {
    tokenResp = await getAccessToken({
      clientEmail: credential.clientEmail,
      privateKey: credential.privateKey,
      scopes: PROBE_SCOPES,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message:
        `Could not exchange the service-account JWT for an access token: ${msg}. ` +
        `Verify the key has not been revoked in IAM → Service Accounts → Keys.`,
    };
  }

  // Step 2: probe a real Google API with the token. We don't actually care
  // about the response body — just that the token is accepted.
  let probeResp: Response;
  try {
    probeResp = await fetch(PROBE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenResp.accessToken}` },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Network error contacting Cloud Billing API to validate the access token: ${msg}.`,
    };
  }

  if (probeResp.status === 401) {
    return {
      ok: false,
      message:
        'Google rejected the access token (HTTP 401). The token exchange succeeded but the ' +
        'token was not accepted by Cloud Billing — this usually means the service account ' +
        'has been disabled.',
    };
  }
  if (probeResp.status === 403) {
    return {
      ok: false,
      message:
        'The service account is missing the `roles/billing.viewer` (or equivalent) IAM ' +
        'role on the billing account. Grant it in Cloud Console → IAM & Admin → Billing.',
    };
  }
  if (!probeResp.ok) {
    const body = await probeResp.text().catch(() => '');
    return {
      ok: false,
      message: `Cloud Billing probe returned HTTP ${probeResp.status}: ${body.slice(0, 200)}.`,
    };
  }

  return {
    ok: true,
    message:
      'Service-account credential validated against Google Cloud Billing API. ' +
      'Native per-day Vertex usage requires Cloud Billing → BigQuery export to be configured ' +
      'by your GCP admin. Once set up, export the billing data as CSV and use the manual ' +
      'CSV import. See docs/INTEGRATIONS.md for setup steps.',
  };
}

// --- entry point ----------------------------------------------------------

async function run(ctx: ImporterContext): Promise<ImportResult> {
  if (!ctx.apiKey) {
    throw new Error(
      'Google Vertex AI importer requires a service-account JSON key in the apiKey field.',
    );
  }
  const credential = parseCredential(ctx.apiKey);

  const rangeTo = ctx.rangeTo ?? new Date();
  const rangeFrom = ctx.rangeFrom ?? new Date(rangeTo.getTime() - 30 * 24 * 60 * 60 * 1000);

  const records: ImportedRecord[] = [];
  const warnings: string[] = [];

  const outcome = await probeCredential(credential);
  warnings.push(outcome.message);

  // If the credential is wrong, surface a second, more prescriptive line so
  // the operator can act without scrolling back to docs.
  if (!outcome.ok) {
    warnings.push(
      'Vertex AI native cost import is not available until both (a) the service-account ' +
        'credential is valid and (b) the GCP project has Cloud Billing → BigQuery export ' +
        'enabled. Until then, export billing data as CSV and use the CSV importer. ' +
        'See docs/INTEGRATIONS.md.',
    );
  }

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
