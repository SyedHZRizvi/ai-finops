// AWS Signature Version 4 (SigV4) signer for HTTP requests.
//
// Hand-rolled implementation using Web Crypto (`crypto.subtle`) so we don't
// pull in the AWS SDK. The algorithm is fully documented at:
//   https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html
//
// Used by the Bedrock importer to sign Cost Explorer POSTs, but the API is
// generic and works for any AWS JSON-RPC service.
//
// Usage:
//   const signed = await signRequest({
//     method: 'POST',
//     url: 'https://ce.us-east-1.amazonaws.com/',
//     region: 'us-east-1',
//     service: 'ce',
//     credentials: { accessKeyId, secretAccessKey, sessionToken? },
//     headers: { 'X-Amz-Target': 'AWSInsightsIndexService.GetCostAndUsage',
//                'Content-Type': 'application/x-amz-json-1.1' },
//     body: JSON.stringify(payload),
//   });
//   await fetch(signed.url, { method: 'POST', headers: signed.headers, body });

import crypto from 'node:crypto';

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SignRequestInput {
  method: string;
  /** Full URL including scheme, host, path, and query string. */
  url: string;
  region: string;
  /** AWS service abbreviation, e.g. `ce`, `s3`, `sts`. */
  service: string;
  credentials: AwsCredentials;
  /**
   * Headers to include in the signed request. The signer will add `Host`,
   * `X-Amz-Date`, and (if a session token is present) `X-Amz-Security-Token`
   * automatically. Any user-supplied `Host`, `X-Amz-Date`, or `Authorization`
   * header is overwritten.
   */
  headers?: Record<string, string>;
  /** Request body. Defaults to an empty string for GET / no-body POSTs. */
  body?: string;
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const ALGORITHM = 'AWS4-HMAC-SHA256';

// --- low-level crypto helpers ---------------------------------------------

function sha256Hex(input: string | Buffer): string {
  const h = crypto.createHash('sha256');
  h.update(input);
  return h.digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  const h = crypto.createHmac('sha256', key);
  h.update(data);
  return h.digest();
}

// --- timestamp formatting --------------------------------------------------

/** Return `YYYYMMDDTHHMMSSZ` for the given Date (UTC). */
function amzDate(d: Date): string {
  const iso = d.toISOString();
  // 2026-05-29T12:34:56.789Z -> 20260529T123456Z
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Return `YYYYMMDD` for the given Date (UTC). */
function shortDate(amz: string): string {
  return amz.slice(0, 8);
}

// --- canonical request -----------------------------------------------------

/**
 * URI-encode a path segment per SigV4 rules. AWS uses RFC 3986 unreserved
 * characters; `/` is kept as a path separator. `encodeURIComponent` is close
 * but leaves `!*'()` unencoded — fix those.
 */
function uriEncode(input: string, encodeSlash: boolean): string {
  let out = '';
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    const isUnreserved =
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x61 && code <= 0x7a) || // a-z
      (code >= 0x30 && code <= 0x39) || // 0-9
      ch === '-' ||
      ch === '_' ||
      ch === '.' ||
      ch === '~';
    if (isUnreserved) {
      out += ch;
    } else if (ch === '/' && !encodeSlash) {
      out += ch;
    } else {
      out += encodeURIComponent(ch).replace(/[!*'()]/g, (c) =>
        `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      );
    }
  }
  return out;
}

function canonicalQueryString(search: string): string {
  // search is "?a=1&b=2" or "" — strip leading ?
  const trimmed = search.startsWith('?') ? search.slice(1) : search;
  if (!trimmed) return '';
  const params: [string, string][] = [];
  for (const pair of trimmed.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const k = eq === -1 ? pair : pair.slice(0, eq);
    const v = eq === -1 ? '' : pair.slice(eq + 1);
    // Decode then re-encode to normalize.
    params.push([
      uriEncode(decodeURIComponent(k), true),
      uriEncode(decodeURIComponent(v), true),
    ]);
  }
  params.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return params.map(([k, v]) => `${k}=${v}`).join('&');
}

function canonicalHeaders(headers: Record<string, string>): {
  canonical: string;
  signed: string;
} {
  // Lower-case names, trim values, sort by name.
  const entries = Object.entries(headers).map(
    ([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')] as [string, string],
  );
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const canonical = entries.map(([k, v]) => `${k}:${v}\n`).join('');
  const signed = entries.map(([k]) => k).join(';');
  return { canonical, signed };
}

// --- public API ------------------------------------------------------------

export async function signRequest(input: SignRequestInput): Promise<SignedRequest> {
  const { method, url, region, service, credentials, body = '' } = input;
  const headers: Record<string, string> = { ...(input.headers ?? {}) };

  const parsed = new URL(url);
  const now = new Date();
  const amz = amzDate(now);
  const date = shortDate(amz);

  // Required headers
  headers['Host'] = parsed.host;
  headers['X-Amz-Date'] = amz;
  if (credentials.sessionToken) {
    headers['X-Amz-Security-Token'] = credentials.sessionToken;
  }
  // Drop any caller-supplied Authorization so we don't end up signing one auth
  // header with another.
  delete headers['Authorization'];
  delete headers['authorization'];

  const payloadHash = sha256Hex(body);
  // Some services require an explicit X-Amz-Content-Sha256 (e.g. S3). For
  // JSON-RPC services like Cost Explorer it's harmless to include.
  headers['X-Amz-Content-Sha256'] = payloadHash;

  const { canonical: canonHeaders, signed: signedHeaders } = canonicalHeaders(headers);

  const canonicalRequest = [
    method.toUpperCase(),
    uriEncode(parsed.pathname || '/', false),
    canonicalQueryString(parsed.search),
    canonHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [ALGORITHM, amz, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  // Derive signing key: kSecret -> kDate -> kRegion -> kService -> kSigning
  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  headers['Authorization'] =
    `${ALGORITHM} Credential=${credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url, headers, body };
}
