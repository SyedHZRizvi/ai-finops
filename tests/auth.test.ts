import { describe, it, expect } from 'vitest';
import {
  constantTimeEqual,
  signSessionCookie,
  verifySessionCookie,
} from '@/lib/auth';

describe('constantTimeEqual()', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEqual('hello', 'hello')).toBe(true);
  });

  it('returns false for different strings of equal length', () => {
    expect(constantTimeEqual('hello', 'world')).toBe(false);
  });

  it('short-circuits on length mismatch (sanity check)', () => {
    // Length is allowed to leak — the contract is constant-time only for
    // equal-length inputs.
    expect(constantTimeEqual('a', 'abc')).toBe(false);
  });
});

describe('signSessionCookie() + verifySessionCookie()', () => {
  it('roundtrips a signed cookie against the same secret', async () => {
    const secret = 'super-secret-password';
    const cookie = await signSessionCookie(secret);
    expect(cookie.length).toBeGreaterThan(20);
    const ok = await verifySessionCookie(cookie, secret);
    expect(ok).toBe(true);
  });

  it('rejects a tampered cookie', async () => {
    const secret = 'super-secret-password';
    const cookie = await signSessionCookie(secret);
    // Flip the first character — verify must fail.
    const tampered = (cookie[0] === 'A' ? 'B' : 'A') + cookie.slice(1);
    const ok = await verifySessionCookie(tampered, secret);
    expect(ok).toBe(false);
  });

  it('returns false for an empty cookie or empty secret', async () => {
    expect(await verifySessionCookie('', 'secret')).toBe(false);
    expect(await verifySessionCookie('something', '')).toBe(false);
  });
});
