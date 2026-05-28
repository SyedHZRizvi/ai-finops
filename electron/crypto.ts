/**
 * Credentials-key bootstrap.
 *
 * A single 256-bit symmetric key is generated on first launch and persisted to
 * `<userData>/finops.key`. When the OS keychain is available (macOS Keychain,
 * Windows DPAPI, GNOME Keyring / KWallet on Linux) we wrap it with Electron's
 * `safeStorage`. Otherwise we fall back to a plaintext file with 0600 perms —
 * better than nothing for headless Linux installs.
 *
 * The Next.js child process reads this key from the FINOPS_ENCRYPTION_KEY env
 * var and uses it to encrypt/decrypt provider API keys in the Credential
 * table.
 */
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function keyFilePath(): string {
  return path.join(app.getPath('userData'), 'finops.key');
}

/**
 * Returns the hex-encoded 256-bit key, creating + persisting it on first call.
 * Idempotent across launches.
 */
export async function ensureKey(): Promise<string> {
  const file = keyFilePath();

  // Make sure userData exists — on first launch on some platforms it may not
  // have been created yet (Electron usually creates it lazily).
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(file)) {
    return readExistingKey(file);
  }

  return createAndPersistKey(file);
}

function readExistingKey(file: string): string {
  const raw = fs.readFileSync(file);
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(raw);
    } catch (err) {
      // Encrypted blob exists but we can't decrypt it — likely the user moved
      // their userData dir between machines, or the keychain entry was wiped.
      // Surface a clear error rather than silently rotating the key (which
      // would orphan their stored credentials).
      throw new Error(
        `[finops] cannot decrypt credentials key at ${file}. ` +
          `The OS keychain entry may have been cleared. Delete ${file} to ` +
          `regenerate (you will need to re-enter provider API keys). ` +
          `Underlying error: ${(err as Error).message}`,
      );
    }
  }
  // No safeStorage available: assume plaintext, written by a previous run
  // under the same constraints.
  return raw.toString('utf-8').trim();
}

function createAndPersistKey(file: string): string {
  const key = crypto.randomBytes(32).toString('hex'); // 64-char hex
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key);
    fs.writeFileSync(file, encrypted, { mode: 0o600 });
  } else {
    fs.writeFileSync(file, key, { encoding: 'utf-8', mode: 0o600 });
  }
  return key;
}
