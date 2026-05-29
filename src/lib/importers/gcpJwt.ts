// GCP service-account JWT signer + OAuth 2.0 access-token exchange.
//
// Hand-rolled with `node:crypto` so we don't pull in `google-auth-library`.
// Used by the Vertex importer to validate service-account credentials by
// exchanging them for an access token against Google's token endpoint.
//
// Reference:
//   https://developers.google.com/identity/protocols/oauth2/service-account
//
// Usage:
//   const tok = await getAccessToken({
//     clientEmail: '...@<project>.iam.gserviceaccount.com',
//     privateKey: '-----BEGIN PRIVATE KEY-----\n...',
//     scopes: ['https://www.googleapis.com/auth/cloud-billing.readonly'],
//   });
//   await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } });

import crypto from 'node:crypto';

export interface ServiceAccountCredential {
  clientEmail: string;
  /** PEM-encoded RSA private key (the `private_key` field of a service-account JSON). */
  privateKey: string;
}

export interface AccessTokenRequest extends ServiceAccountCredential {
  /** OAuth scopes to request. Multiple scopes are space-joined per spec. */
  scopes: string[];
  /** Override the token URL. Defaults to Google's public endpoint. */
  tokenUrl?: string;
  /**
   * Override the JWT audience. Defaults to the token URL. Some Google
   * endpoints (id_token, impersonation) require a different audience.
   */
  audience?: string;
}

export interface AccessToken {
  accessToken: string;
  /** Epoch milliseconds at which the token expires. */
  expiresAt: number;
  /** Raw token-type from the response (typically "Bearer"). */
  tokenType: string;
}

const DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWT_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const JWT_LIFETIME_SECONDS = 3600;

// --- base64url encoding ---------------------------------------------------

function base64urlEncode(input: string | Buffer): string {
  const b = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return b.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// --- JWT construction -----------------------------------------------------

/**
 * Build and sign a JWT assertion for the OAuth 2.0 JWT-bearer grant.
 *
 * Exported separately so callers can use the assertion for non-token flows
 * (e.g. signing a Google ID-token request directly).
 */
export function signServiceAccountJwt(
  credential: ServiceAccountCredential,
  scopes: string[],
  audience: string = DEFAULT_TOKEN_URL,
): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credential.clientEmail,
    scope: scopes.join(' '),
    aud: audience,
    iat: now,
    exp: now + JWT_LIFETIME_SECONDS,
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Normalize the PEM: JSON-encoded service-account files often embed real
  // `\n` characters, but a user pasting one through a webform might end up
  // with literal `\\n`. Both forms work after this normalization.
  const pem = credential.privateKey.replace(/\\n/g, '\n');

  let signature: Buffer;
  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    signature = signer.sign(pem);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to sign JWT with service-account private key (is the key a valid RSA PEM?): ${msg}`,
    );
  }

  return `${signingInput}.${base64urlEncode(signature)}`;
}

// --- token exchange -------------------------------------------------------

export async function getAccessToken(req: AccessTokenRequest): Promise<AccessToken> {
  const tokenUrl = req.tokenUrl ?? DEFAULT_TOKEN_URL;
  const assertion = signServiceAccountJwt(
    { clientEmail: req.clientEmail, privateKey: req.privateKey },
    req.scopes,
    req.audience ?? tokenUrl,
  );

  const body = new URLSearchParams({
    grant_type: JWT_GRANT_TYPE,
    assertion,
  }).toString();

  let resp: Response;
  try {
    resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error contacting ${tokenUrl}: ${msg}`);
  }

  const rawText = await resp.text().catch(() => '');
  if (!resp.ok) {
    // Google returns JSON error bodies; surface the `error_description` field
    // when present so the operator gets a useful message.
    let detail = rawText.slice(0, 300);
    try {
      const j = JSON.parse(rawText) as Record<string, unknown>;
      const e = typeof j.error === 'string' ? j.error : '';
      const d = typeof j.error_description === 'string' ? j.error_description : '';
      detail = [e, d].filter(Boolean).join(': ') || detail;
    } catch {
      /* keep raw text */
    }
    throw new Error(
      `Google token exchange failed: HTTP ${resp.status} ${resp.statusText} — ${detail}`,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error(`Google token endpoint returned non-JSON: ${rawText.slice(0, 200)}`);
  }

  const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : '';
  const tokenType = typeof parsed.token_type === 'string' ? parsed.token_type : 'Bearer';
  const expiresIn =
    typeof parsed.expires_in === 'number'
      ? parsed.expires_in
      : typeof parsed.expires_in === 'string'
        ? Number.parseInt(parsed.expires_in, 10)
        : JWT_LIFETIME_SECONDS;

  if (!accessToken) {
    throw new Error('Google token endpoint succeeded but returned no access_token.');
  }

  return {
    accessToken,
    tokenType,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : JWT_LIFETIME_SECONDS) * 1000,
  };
}
