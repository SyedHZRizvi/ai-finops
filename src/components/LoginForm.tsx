'use client';
import { useState } from 'react';

interface LoginFormProps {
  initialError: string | null;
  /**
   * Relative path to bounce the user back to after a successful sign-in.
   * Empty string means "go home". The parent server component is
   * responsible for sanitizing this — never trust it for an external URL.
   */
  next: string;
}

export function LoginForm({ initialError, next }: LoginFormProps) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError('Enter the dashboard password.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 429) {
        setError('Too many failed attempts. Try again in a minute.');
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Incorrect password.');
        setSubmitting(false);
        return;
      }
      // Hard navigation — needed so the middleware re-runs and the cookie
      // is honored on the next page render. router.push would do a soft
      // navigation and might race the cookie store.
      const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      window.location.assign(dest);
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="finops-password" className="label block mb-2">
          Password
        </label>
        <input
          id="finops-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          placeholder="Enter password"
          disabled={submitting}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="border border-bad/40 bg-bad/5 rounded-xl text-sm text-bad px-4 py-3"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn-primary w-full justify-center"
        disabled={submitting}
      >
        {submitting ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
