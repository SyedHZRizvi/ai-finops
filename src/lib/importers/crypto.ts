// AES-256-GCM helpers for encrypting provider credentials at rest.
//
// The key is supplied as a hex string via `FINOPS_ENCRYPTION_KEY`
// (32 bytes / 64 hex chars). The Electron main process is responsible for
// generating and persisting that key; the Next.js child process inherits it
// through the environment.

import crypto from 'node:crypto';

export interface EncryptedBlob {
  /** Base64 ciphertext. */
  encryptedBlob: string;
  /** Base64 12-byte IV (GCM nonce). */
  iv: string;
  /** Base64 16-byte GCM auth tag. */
  authTag: string;
}

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_HEX_LENGTH = 64; // 32 bytes = 256 bits

export function getKey(): Buffer {
  const hex = process.env.FINOPS_ENCRYPTION_KEY;
  if (!hex || hex.length !== KEY_HEX_LENGTH) {
    throw new Error('FINOPS_ENCRYPTION_KEY must be 64 hex chars (256 bits)');
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('FINOPS_ENCRYPTION_KEY must be a hex string');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plain: string): EncryptedBlob {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedBlob: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decrypt(b: EncryptedBlob): string {
  if (!b || !b.encryptedBlob || !b.iv || !b.authTag) {
    throw new Error('decrypt: blob is missing encryptedBlob, iv, or authTag');
  }
  const key = getKey();
  const iv = Buffer.from(b.iv, 'base64');
  const authTag = Buffer.from(b.authTag, 'base64');
  const ciphertext = Buffer.from(b.encryptedBlob, 'base64');

  if (iv.length !== IV_BYTES) {
    throw new Error(`decrypt: iv must be ${IV_BYTES} bytes, got ${iv.length}`);
  }

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}
