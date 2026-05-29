// /slack — Slack app configuration & installation surface.
//
// Two states, decided server-side:
//
//   1. SLACK_CLIENT_ID unset → render the setup guide (manifest YAML
//      link, where to put env vars). Operators see exactly what they
//      need to do before any user can install.
//
//   2. SLACK_CLIENT_ID set → render the "Add to Slack" button and the
//      table of connected workspaces. The success/error toast comes
//      from the ?installed=1 / ?error=... query params our OAuth
//      callback sets.

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { SlackInstallButton } from '@/components/SlackInstallButton';
import { SlackInstallationsList } from '@/components/SlackInstallationsList';
import { listInstallations } from '@/lib/slackInstall';
import { slackEncryptionConfigured } from '@/lib/slackCrypto';

export const dynamic = 'force-dynamic';

interface SlackPageProps {
  searchParams?: { installed?: string; error?: string };
}

// Friendlier copy for the error codes the OAuth callback emits.
const ERROR_MESSAGES: Record<string, string> = {
  not_configured:
    'Slack environment variables are missing. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_SIGNING_SECRET in your deployment.',
  encryption_not_configured:
    'FINOPS_ENCRYPTION_KEY is not set. We refuse to store an unencrypted Slack token — set the key and try again.',
  missing_code: 'Slack did not return an authorization code. Try installing again.',
  invalid_state:
    'The install session expired or did not match. Start the install from this page (not by reusing a stale link).',
  access_denied: 'Install canceled — Slack reported the request was denied.',
  incomplete_response: 'Slack returned an unexpected response shape. Retry the install.',
  oauth_failed: 'Slack rejected the OAuth exchange. Check your client id/secret in Slack admin.',
};

function friendlyError(code: string | undefined): string | null {
  if (!code) return null;
  // exchange_failed:foo / persist_failed:bar — split off the prefix.
  const base = code.split(':')[0];
  const known = ERROR_MESSAGES[base];
  if (known) return known;
  return `Install failed: ${code}`;
}

export default async function SlackPage({ searchParams }: SlackPageProps) {
  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  const encryptionOk = slackEncryptionConfigured();

  const installed = searchParams?.installed === '1';
  const errMsg = friendlyError(searchParams?.error);

  // Always read the table — empty list is the common case for an
  // operator visiting the page before anyone installs.
  let installations: Awaited<ReturnType<typeof listInstallations>> = [];
  try {
    installations = await listInstallations();
  } catch {
    installations = [];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Slack app"
        gradient
        subtitle="Install AI FinOps into your Slack workspace. Users can run /finops commands and @mention the bot from any channel to query the dashboard."
      />

      {installed && (
        <div className="card card-pad border-good/40 bg-good/5 text-sm flex items-start gap-3">
          <span className="w-6 h-6 rounded-full bg-good/20 text-good flex items-center justify-center text-xs font-bold">
            ✓
          </span>
          <div>
            <div className="font-semibold text-good">Workspace connected</div>
            <div className="text-inkDim mt-0.5">
              Try <code className="font-mono text-xs">/finops help</code> in any channel, or
              {' '}<code className="font-mono text-xs">@finops cost</code>{' '}after inviting the bot.
            </div>
          </div>
        </div>
      )}

      {errMsg && (
        <div className="card card-pad border-bad/40 bg-bad/5 text-sm flex items-start gap-3">
          <span className="w-6 h-6 rounded-full bg-bad/20 text-bad flex items-center justify-center text-xs font-bold">
            !
          </span>
          <div className="text-bad">{errMsg}</div>
        </div>
      )}

      {!clientId ? <SetupGuide encryptionOk={encryptionOk} /> : <InstallSurface encryptionOk={encryptionOk} />}

      <div className="card card-pad">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="label">Connected workspaces</div>
            <div className="text-xs text-muted mt-1">
              One row per workspace that has installed the app. Revoking marks the row inactive — the
              workspace will need to re-install to use commands again.
            </div>
          </div>
        </div>
        <SlackInstallationsList
          items={installations.map((it) => ({
            id: it.id,
            teamId: it.teamId,
            teamName: it.teamName,
            installedAt: it.installedAt.toISOString(),
            isActive: it.isActive,
          }))}
        />
      </div>

      <CommandReference />
    </div>
  );
}

function InstallSurface({ encryptionOk }: { encryptionOk: boolean }) {
  return (
    <div className="card card-pad space-y-4">
      <div>
        <div className="label">Install</div>
        <p className="text-sm text-inkDim mt-1">
          Clicking the button below redirects you to Slack&apos;s consent screen. After approving,
          you&apos;ll be bounced back here and the workspace will appear in the table below.
        </p>
      </div>
      <SlackInstallButton enabled={encryptionOk} />
      {!encryptionOk && (
        <div className="text-xs text-warn">
          FINOPS_ENCRYPTION_KEY is not configured. Set a 64-char hex key (generate with{' '}
          <code className="font-mono">openssl rand -hex 32</code>) and reload — we refuse to persist
          a Slack token unencrypted.
        </div>
      )}
    </div>
  );
}

function SetupGuide({ encryptionOk }: { encryptionOk: boolean }) {
  return (
    <div className="card card-pad space-y-4">
      <div>
        <div className="label">Setup required</div>
        <p className="text-sm text-inkDim mt-1">
          The Slack app isn&apos;t configured for this deployment yet. Follow these steps once per
          deployment — afterwards anyone who visits this page can install AI FinOps into their
          workspace with one click.
        </p>
      </div>
      <ol className="text-sm space-y-3 list-decimal list-inside text-inkDim">
        <li>
          Visit{' '}
          <a
            href="https://api.slack.com/apps?new_app=1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brandLight underline underline-offset-4"
          >
            api.slack.com/apps
          </a>{' '}
          and click <strong>Create New App → From an app manifest</strong>.
        </li>
        <li>
          Paste the YAML from{' '}
          <code className="font-mono text-xs">docs/slack-app-manifest.yaml</code> (replace{' '}
          <code className="font-mono text-xs">YOUR_BASE_URL</code> with your deployed origin), then
          click <strong>Create</strong>.
        </li>
        <li>
          On the app&apos;s <strong>Basic Information</strong> page, copy the <em>Client ID</em>,
          <em> Client Secret</em>, and <em>Signing Secret</em>.
        </li>
        <li>
          Set them as env vars in your deployment:
          <pre className="mt-1 p-3 bg-panel2 border border-border rounded-lg text-xs font-mono overflow-x-auto">
{`SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...`}
          </pre>
        </li>
        <li>
          {encryptionOk ? (
            <span>
              <span className="text-good">✓</span> FINOPS_ENCRYPTION_KEY is configured.
            </span>
          ) : (
            <span className="text-warn">
              Set FINOPS_ENCRYPTION_KEY to a 64-char hex string (
              <code className="font-mono">openssl rand -hex 32</code>). Required to encrypt the
              workspace tokens at rest.
            </span>
          )}
        </li>
        <li>Reload this page; the &quot;Add to Slack&quot; button will appear.</li>
      </ol>
      <div className="pt-2">
        <Link
          href="https://github.com/ai-finops/ai-finops/blob/main/docs/SLACK.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brandLight text-sm underline underline-offset-4"
        >
          Full setup walkthrough →
        </Link>
      </div>
    </div>
  );
}

function CommandReference() {
  return (
    <div className="card card-pad">
      <div className="label">Command reference</div>
      <p className="text-xs text-muted mt-1 mb-4">
        Once installed, every member of the workspace can use the commands below. Slash commands are
        ephemeral (only the runner sees the reply). @mentions reply in-channel.
      </p>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Command</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono text-xs">/finops cost [period]</td>
              <td>Spend summary for 24h, 7d, 30d, or all-time. Default 7d.</td>
            </tr>
            <tr>
              <td className="font-mono text-xs">/finops insights</td>
              <td>Top 3 recommendations and projected monthly/annual savings.</td>
            </tr>
            <tr>
              <td className="font-mono text-xs">/finops optimize &lt;prompt&gt;</td>
              <td>Rewrite a prompt and report token + cost savings.</td>
            </tr>
            <tr>
              <td className="font-mono text-xs">/finops anomalies</td>
              <td>Unresolved critical/warn anomalies from the last 7 days.</td>
            </tr>
            <tr>
              <td className="font-mono text-xs">/finops digest</td>
              <td>Link to the weekly cost digest page.</td>
            </tr>
            <tr>
              <td className="font-mono text-xs">/finops help</td>
              <td>List all available commands.</td>
            </tr>
            <tr>
              <td className="font-mono text-xs">@finops &lt;query&gt;</td>
              <td>
                Same shortcuts (cost / insights / optimize) reply in-channel. Invite{' '}
                <code className="font-mono text-xs">@finops</code> to the channel first.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
