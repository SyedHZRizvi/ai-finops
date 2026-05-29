// Together AI cost importer — credential-validation-only stub.
//
// As of writing, Together AI does not expose a public usage admin API.
// Their billing dashboard at https://api.together.ai/settings/billing shows
// per-day spend and per-model breakdowns, but there is no programmatic
// endpoint to pull that history. The closest public endpoint is
// `GET https://api.together.xyz/v1/models`, which lets the operator confirm
// the API key works without committing them to a full native import.
//
// This importer:
//   1. Validates the credential shape (JSON object with apiKey, plus
//      optional orgId — or, for convenience, a raw API key string).
//   2. Probes `GET /v1/models` to confirm the key is accepted.
//   3. Returns an empty records array with an actionable warning pointing
//      operators at the CSV upload route documented in docs/INTEGRATIONS.md.
//
// When Together AI ships a usage API, run() will swap the probe for an
// actual /usage call and emit per-day records; the credential parser will
// not need to change.
//
// Credential format (JSON in the apiKey field):
//   {
//     "apiKey": "abc123...",
//     "orgId":  "..."        // optional
//   }
// or simply: "abc123..." (raw key string)

import type { ImportedRecord, Importer, ImporterContext, ImportResult } from './types';

interface TogetherCredential {
  apiKey: string;
  orgId?: string;
}

const PROBE_URL = 'https://api.together.xyz/v1/models';
const PROBE_TIMEOUT_MS = 3_000;

function parseCredential(raw: string): TogetherCredential {
  const trimmed = raw.trim();
  // Permit a raw API key string for convenience. JSON-shaped credentials
  // get a structured parse below.
  if (!trimmed.startsWith('{')) {
    if (trimmed.length === 0) {
      throw new Error('Together AI credential is empty.');
    }
    return { apiKey: trimmed };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      'Together AI credential must be a JSON object of the form `{"apiKey":"...","orgId":"..."}` or a raw API key string.',
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Together AI credential must be a JSON object or raw API key string.');
  }
  const obj = parsed as Record<string, unknown>;
  const apiKey =
    typeof obj.apiKey === 'string'
      ? obj.apiKey.trim()
      : typeof obj.api_key === 'string'
        ? obj.api_key.trim()
        : '';
  if (!apiKey) {
    throw new Error('Together AI credential is missing required field: apiKey.');
  }
  const orgId =
    typeof obj.orgId === 'string' && obj.orgId.trim().length > 0
      ? obj.orgId.trim()
      : typeof obj.org_id === 'string' && obj.org_id.trim().length > 0
        ? obj.org_id.trim()
        : undefined;
  return { apiKey, orgId };
}

async function probeCredential(credential: TogetherCredential): Promise<{ ok: boolean; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const resp = await fetch(PROBE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (resp.status === 401) {
      return {
        ok: false,
        message:
          'Together AI rejected the API key (HTTP 401). Generate a new key at ' +
          'https://api.together.ai/settings/api-keys and try again.',
      };
    }
    if (resp.status === 403) {
      return {
        ok: false,
        message:
          'Together AI accepted the key but the account does not have permission to list ' +
          'models (HTTP 403). Confirm the key belongs to an active billing account.',
      };
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return {
        ok: false,
        message: `Together AI /v1/models probe returned HTTP ${resp.status}: ${body.slice(0, 200)}.`,
      };
    }
    return {
      ok: true,
      message:
        'Together AI key validated against /v1/models. Native usage import is not yet ' +
        'implemented — Together does not currently expose a public usage admin API. ' +
        'Export your billing data as CSV from https://api.together.ai/settings/billing and ' +
        'use the CSV import below. See docs/INTEGRATIONS.md for column requirements.',
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        message: `Together AI /v1/models probe timed out after ${PROBE_TIMEOUT_MS}ms.`,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Network error contacting Together AI: ${msg}.` };
  } finally {
    clearTimeout(timer);
  }
}

async function run(ctx: ImporterContext): Promise<ImportResult> {
  if (!ctx.apiKey) {
    throw new Error(
      'Together AI importer requires an API key (or a JSON blob containing `apiKey`).',
    );
  }
  const credential = parseCredential(ctx.apiKey);

  const rangeTo = ctx.rangeTo ?? new Date();
  const rangeFrom = ctx.rangeFrom ?? new Date(rangeTo.getTime() - 30 * 24 * 60 * 60 * 1000);

  const records: ImportedRecord[] = [];
  const warnings: string[] = [];

  const outcome = await probeCredential(credential);
  warnings.push(outcome.message);
  if (!outcome.ok) {
    warnings.push(
      'Together AI native usage import is not available until (a) the API key validates and ' +
        '(b) Together ships a public usage admin API. Until then, export billing data as CSV ' +
        'from your Together dashboard and use the CSV importer. See docs/INTEGRATIONS.md.',
    );
  } else {
    warnings.push(
      'Together AI native usage API not yet implemented — use CSV upload from your billing ' +
        'dashboard. See docs/INTEGRATIONS.md for steps.',
    );
  }

  return {
    records,
    warnings,
    rawRangeFrom: rangeFrom,
    rawRangeTo: rangeTo,
  };
}

export const togetherImporter: Importer = {
  provider: 'together',
  label: 'Together AI (validate only)',
  run,
};
