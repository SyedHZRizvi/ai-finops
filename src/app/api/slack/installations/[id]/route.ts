// DELETE /api/slack/installations/[id]
//
// Revoke a workspace install. Marks the row inactive rather than deleting
// it so a future "who used this app, and when" audit query still works.
// The dashboard /slack page hits this when an operator clicks "Revoke"
// on a connected workspace. Idempotent — missing ids return 200.

import { NextRequest, NextResponse } from 'next/server';
import { deactivateInstallation } from '@/lib/slackInstall';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  try {
    await deactivateInstallation(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
