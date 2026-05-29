// Persistence helpers for SlackInstallation rows.
//
// These wrap the Prisma client so call sites never see encrypted blob
// fields or have to remember to encrypt before insert. On insert we
// AES-256-GCM the bot token using the shared FINOPS_ENCRYPTION_KEY; on
// read we decrypt before returning. The OAuth callback, the slash-command
// handler, and the events handler all go through `getInstallation()` so
// the encryption boundary is identical everywhere.

import { prisma } from './db';
import { encryptToken, decryptToken } from './slackCrypto';

export interface PersistInstallationInput {
  teamId: string;
  teamName: string | null;
  /** Bot user OAuth token (`xoxb-...`). Stored encrypted. */
  accessToken: string;
  botUserId: string;
  appId?: string | null;
  authedUserId?: string | null;
}

export interface InstallationReadModel {
  /** Decrypted bot token. Suitable for direct use in Slack API calls. */
  accessToken: string;
  botUserId: string;
  teamName: string | null;
}

export interface InstallationListItem {
  id: string;
  teamId: string;
  teamName: string | null;
  installedAt: Date;
  isActive: boolean;
}

/**
 * Insert or update a workspace installation. Identified by `teamId` —
 * if the workspace re-installs (or re-authorizes with new scopes), we
 * overwrite the stored token rather than create a duplicate row. The
 * `isActive` flag flips back to `true` so a previously-revoked install
 * coming back through OAuth is auto-reactivated.
 */
export async function persistInstallation(input: PersistInstallationInput): Promise<void> {
  const enc = encryptToken(input.accessToken);

  await prisma.slackInstallation.upsert({
    where: { teamId: input.teamId },
    create: {
      teamId: input.teamId,
      teamName: input.teamName,
      accessTokenBlob: enc.blob,
      accessTokenIv: enc.iv,
      accessTokenTag: enc.tag,
      botUserId: input.botUserId,
      appId: input.appId ?? null,
      authedUserId: input.authedUserId ?? null,
      isActive: true,
    },
    update: {
      teamName: input.teamName,
      accessTokenBlob: enc.blob,
      accessTokenIv: enc.iv,
      accessTokenTag: enc.tag,
      botUserId: input.botUserId,
      appId: input.appId ?? null,
      authedUserId: input.authedUserId ?? null,
      isActive: true,
    },
  });
}

/**
 * Look up a workspace's installation by team ID. Returns the decrypted
 * bot token in plaintext alongside the bot user id and team name.
 * Returns `null` when no row exists or the row is marked inactive — the
 * caller should treat that as "this workspace has not installed us".
 */
export async function getInstallation(teamId: string): Promise<InstallationReadModel | null> {
  if (!teamId) return null;
  const row = await prisma.slackInstallation.findUnique({
    where: { teamId },
  });
  if (!row || !row.isActive) return null;
  let accessToken: string;
  try {
    accessToken = decryptToken(row.accessTokenBlob, row.accessTokenIv, row.accessTokenTag);
  } catch {
    // A row whose token can't be decrypted is unusable. Surface as null
    // so the handler responds "not installed" rather than throwing 500.
    return null;
  }
  return {
    accessToken,
    botUserId: row.botUserId,
    teamName: row.teamName,
  };
}

/**
 * List all known installations, including inactive ones. The dashboard
 * uses this to show "connected workspaces" with revoke buttons. We
 * deliberately do NOT decrypt tokens here — the UI never needs them and
 * fewer decrypt paths means a smaller blast radius if anything leaks.
 */
export async function listInstallations(): Promise<InstallationListItem[]> {
  const rows = await prisma.slackInstallation.findMany({
    orderBy: { installedAt: 'desc' },
    select: {
      id: true,
      teamId: true,
      teamName: true,
      installedAt: true,
      isActive: true,
    },
  });
  return rows;
}

/**
 * Mark an installation as inactive. The row is preserved (so audit
 * history stays intact) but `getInstallation()` will treat it as gone.
 * Used by the "Revoke" button on `/slack`.
 */
export async function deactivateInstallation(id: string): Promise<void> {
  await prisma.slackInstallation
    .update({
      where: { id },
      data: { isActive: false },
    })
    .catch(() => {
      // Idempotent: missing rows are treated as success.
    });
}
