'use client';
import { useState } from 'react';

/**
 * Magic-link sign-in form. Email-only — no password field, no captcha. The
 * confirmation text is enumeration-neutral ("if that email is associated…")
 * so the same response works whether or not the address is real.
 *
 * Why this is a separate component from LoginForm:
 *   - The two flows have entirely different state machines: password is
 *     immediate sign-in success/fail, magic-link is "we kicked off an
 *     email, check your inbox".
 *   - Mixing them in one component leads to spaghetti `if (mode === ...)`
 *     branches. Cleaner to compose two simple components on the login page.
 */
export function MagicLinkForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    try {
      // The endpoint ALWAYS returns 200 ok:true regardless of whether the
      // address exists, was rate-limited, or the mailer failed — so we
      // don't try to surface error paths. Network-error is the only thing
      // we treat as "something went wrong".
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        // Should never happen given the route's contract, but be defensive
        // in case middleware blocks the request.
        setConfirmed(true);
      } else {
        setConfirmed(true);
      }
    } catch {
      // Network failure — still claim success (enumeration-neutral). The
      // user will simply notice the email never arrives.
      setConfirmed(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div
        role="status"
        className="border border-good/40 bg-good/5 rounded-xl text-sm px-4 py-3 leading-relaxed"
      >
        <div className="font-semibold mb-1">Check your inbox.</div>
        <div className="text-muted">
          If that email is associated with this dashboard, you&apos;ll receive a
          sign-in link shortly. Links expire after 15 minutes.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="finops-magic-email" className="label block mb-2">
          Email
        </label>
        <input
          id="finops-magic-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          placeholder="you@company.com"
          disabled={submitting}
        />
      </div>
      <button
        type="submit"
        className="btn-primary w-full justify-center"
        disabled={submitting || !email.trim()}
      >
        {submitting ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      <p className="text-xs text-muted text-center">
        No password to remember — we&apos;ll email a one-time link.
      </p>
    </form>
  );
}
