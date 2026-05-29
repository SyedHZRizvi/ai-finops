'use client';
import { useState } from 'react';
import { logout } from '@/lib/authClient';

interface SignOutButtonProps {
  /**
   * Optional extra class names so the button can blend into whatever
   * container the orchestrator drops it into (sidebar, header dropdown,
   * etc).
   */
  className?: string;
}

/**
 * Renders unconditionally. When auth is disabled, hitting /api/auth/logout
 * is a harmless no-op and the redirect to /login will just bounce back. So
 * the button is always safe to render — no client-side env var probing
 * needed.
 */
export function SignOutButton({ className }: SignOutButtonProps) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    await logout();
    // logout() initiates a hard nav; this state reset rarely runs in
    // practice but keeps the button consistent if nav is somehow blocked.
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Sign out"
      className={
        className ??
        'btn-ghost text-xs'
      }
    >
      {busy ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
