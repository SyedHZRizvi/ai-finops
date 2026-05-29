// Slack request signature verification.
//
// Every request Slack sends to our slash-command and event endpoints
// carries two HTTP headers:
//
//   X-Slack-Request-Timestamp: <unix seconds>
//   X-Slack-Signature:         v0=<hex>
//
// The signature is HMAC-SHA256 over the literal string:
//
//   "v0:" + timestamp + ":" + rawBody
//
// keyed on the app's signing secret. We verify exact equality with a
// constant-time hex compare and also enforce a ±5 minute timestamp
// window — this is Slack's documented replay-protection requirement.
//
// We use the Web Crypto subtle API (rather than node:crypto) so this
// module is safe to import from middleware / edge runtime if we ever
// move there. Constant-time hex compare is rolled by hand because
// `crypto.timingSafeEqual` is Node-only.

const MAX_AGE_SECONDS = 5 * 60; // ±5 minutes

export interface VerifySlackSignatureOptions {
  rawBody: string;
  /** Value of `X-Slack-Request-Timestamp` header. */
  timestamp: string;
  /** Value of `X-Slack-Signature` header (`v0=<hex>`). */
  signature: string;
  /** App's signing secret from api.slack.com → Basic Information. */
  signingSecret: string;
}

/**
 * Verify a Slack request's signature and freshness. Never throws — any
 * malformed input or HMAC mismatch returns `false`. A `true` return means
 * (a) the timestamp is within ±5 minutes of now AND (b) the signature
 * matches `HMAC(signingSecret, "v0:" + timestamp + ":" + rawBody)`.
 */
export async function verifySlackSignature(
  opts: VerifySlackSignatureOptions,
): Promise<boolean> {
  const { rawBody, timestamp, signature, signingSecret } = opts;
  if (!rawBody || !timestamp || !signature || !signingSecret) return false;

  // Slack signatures are always "v0=<64 hex chars>". Anything else is
  // either a misconfiguration or an attacker probing the endpoint.
  const expectedPrefix = 'v0=';
  if (!signature.startsWith(expectedPrefix)) return false;
  const providedHex = signature.slice(expectedPrefix.length).toLowerCase();
  if (!/^[0-9a-f]+$/.test(providedHex)) return false;

  // Replay protection. Parse the timestamp as integer seconds; reject
  // anything outside the ±5 minute window. NaN guards a malformed header.
  const tsSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(tsSeconds)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - tsSeconds);
  if (ageSeconds > MAX_AGE_SECONDS) return false;

  let expectedHex: string;
  try {
    expectedHex = await hmacSha256Hex(signingSecret, `v0:${timestamp}:${rawBody}`);
  } catch {
    return false;
  }

  return constantTimeHexEqual(providedHex, expectedHex);
}

/** HMAC-SHA256 over `data` keyed on `secret`, lowercase hex output. */
async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Constant-time compare of two lowercase hex strings. Length mismatch
 * bails early — that's not a secret, only equal-length compares need to
 * be timing-safe. Every byte of an equal-length compare is examined.
 */
function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
