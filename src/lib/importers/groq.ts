// Groq cost importer — credential-validation-only stub.
//
// Groq's console at https://console.groq.com/settings/billing shows per-day
// usage and per-model breakdowns, but as of writing there is no public
// programmatic endpoint exposing that history. The closest public endpoint
// is `GET https://api.groq.com/openai/v1/models` (Groq's OpenAI-compatible
// surface), which we hit to confirm the key works without committing to
// a full native import.
//
// This importer:
//   1. Validates the credential shape (JSON object with apiKey, or a raw
//      key string).
//   2. Probes `GET /openai/v1/models` to confirm the key is accepted.
//   3. Returns an empty records array with an actionable warning pointing
//      operators at the CSV upload route documented in docs/INTEGRATIONS.md.
//
// When Groq ships a public usage admin API, swap the probe for the real
// /usage call.
//
// Credential format (JSON in the apiKey field):
//   {
//     "apiKey": "gsk_..."
//   }
// or simply: "gsk_..." (raw key string)

import type { ImportedRecord, Importer, ImporterContext, ImportResult } from './types';

interface GroqCredential {
  apiKey: string;
}

const PROBE_URL = 'https://api.groq.com/openai/v1/models';
const PROBE_TIMEOUT_MS = 3_000;

function parseCredential(raw: string): GroqCredential {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) {
    if (trimmed.length === 0) {
      throw new Error('Groq credential is empty.');
    }
    return { apiKey: trimmed };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      'Groq credential must be a JSON object of the form `{"apiKey":"gsk_..."}` or a raw API key string.',
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Groq credential must be a JSON object or raw API key string.');
  }
  const obj = parsed as Record<string, unknown>;
  const apiKey =
    typeof obj.apiKey === 'string'
      ? obj.apiKey.trim()
      : typeof obj.api_key === 'string'
        ? obj.api_key.trim()
        : '';
  if (!apiKey) {
    throw new Error('Groq credential is missing required field: apiKey.');
  }
  return { apiKey };
}

async function probeCredential(credential: GroqCredential): Promise<{ ok: boolean; message: string }> {
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
          'Groq rejected the API key (HTTP 401). Generate a new key at ' +
          'https://console.groq.com/keys and try again.',
      };
    }
    if (resp.status === 403) {
      return {
        ok: false,
        message:
          'Groq accepted the key but the account does not have permission to list ' +
          'models (HTTP 403). Confirm the key belongs to an active organization.',
      };
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return {
        ok: false,
        message: `Groq /openai/v1/models probe returned HTTP ${resp.status}: ${body.slice(0, 200)}.`,
      };
    }
    return {
      ok: true,
      message:
        'Groq key validated against /openai/v1/models. Native usage import is not yet ' +
        'implemented — Groq does not currently expose a public usage admin API. Export your ' +
        'billing data as CSV from https://console.groq.com/settings/billing and use the CSV ' +
        'import below. See docs/INTEGRATIONS.md for column requirements.',
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        message: `Groq /openai/v1/models probe timed out after ${PROBE_TIMEOUT_MS}ms.`,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Network error contacting Groq: ${msg}.` };
  } finally {
    clearTimeout(timer);
  }
}

async function run(ctx: ImporterContext): Promise<ImportResult> {
  if (!ctx.apiKey) {
    throw new Error('Groq importer requires an API key (or a JSON blob containing `apiKey`).');
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
      'Groq native usage import is not available until (a) the API key validates and ' +
        '(b) Groq ships a public usage admin API. Until then, export billing data as CSV ' +
        'from the Groq console and use the CSV importer. See docs/INTEGRATIONS.md.',
    );
  } else {
    warnings.push(
      'Groq native usage API not yet implemented — use CSV upload from your billing ' +
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

export const groqImporter: Importer = {
  provider: 'groq',
  label: 'Groq (validate only)',
  run,
};
