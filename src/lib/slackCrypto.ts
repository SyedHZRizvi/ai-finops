// Encryption helpers for Slack bot tokens at rest.
//
// We reuse the AES-256-GCM helper from `importers/crypto.ts` (keyed off
// `FINOPS_ENCRYPTION_KEY`) so Slack tokens are protected by the same
// scheme as provider credentials — one key to rotate, one audit story.
// The wrapper exposes a slightly tighter API for the Slack call sites:
// they always get/store a plaintext bot token and three short base64
// strings, rather than wrangling the importer's `EncryptedBlob` shape.

import { encrypt as importerEncrypt, decrypt as importerDecrypt } from './importers/crypto';

export interface SlackEncryptedToken {
  /** Base64 ciphertext. Stored as `accessTokenBlob` on `SlackInstallation`. */
  blob: string;
  /** Base64 12-byte IV. Stored as `accessTokenIv`. */
  iv: string;
  /** Base64 16-byte GCM auth tag. Stored as `accessTokenTag`. */
  tag: string;
}

/**
 * Encrypt a Slack bot token (`xoxb-...`) using the shared FinOps key.
 * Returns the three base64 pieces in the exact shape the
 * `SlackInstallation` table expects.
 */
export function encryptToken(plaintext: string): SlackEncryptedToken {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptToken: plaintext must be a non-empty string');
  }
  const b = importerEncrypt(plaintext);
  return {
    blob: b.encryptedBlob,
    iv: b.iv,
    tag: b.authTag,
  };
}

/**
 * Decrypt a Slack bot token previously stored via `encryptToken`. Throws
 * if any field is missing or the auth tag fails to verify.
 */
export function decryptToken(blob: string, iv: string, tag: string): string {
  if (!blob || !iv || !tag) {
    throw new Error('decryptToken: blob, iv, and tag are all required');
  }
  return importerDecrypt({
    encryptedBlob: blob,
    iv,
    authTag: tag,
  });
}

/**
 * Returns true when the encryption key is configured correctly. The
 * Slack OAuth callback uses this to refuse to persist a token rather
 * than store an unencrypted secret.
 */
export function slackEncryptionConfigured(): boolean {
  const hex = process.env.FINOPS_ENCRYPTION_KEY;
  return typeof hex === 'string' && hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex);
}
