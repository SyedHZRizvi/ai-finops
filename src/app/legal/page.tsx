// /legal — Privacy notice, terms of use, disclaimer, and trademark attribution.
// This page consolidates all legal disclosures into one accessible location.
// It is linked from the footer of every page.

import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';

export const metadata: Metadata = {
  title: 'Legal — Privacy, Terms & Trademarks',
  description:
    'Privacy notice, terms of use, disclaimer of warranty, and trademark attribution for AI FinOps.',
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      <h2 className="text-lg font-semibold text-ink border-b border-border pb-2">{title}</h2>
      <div className="text-sm text-inkDim leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

const SECTIONS = [
  { id: 'privacy',    label: 'Privacy Notice' },
  { id: 'terms',      label: 'Terms of Use' },
  { id: 'disclaimer', label: 'Disclaimer' },
  { id: 'cookies',    label: 'Cookies' },
  { id: 'trademarks', label: 'Trademarks' },
];

export default function LegalPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader
        title="Legal"
        gradient
        subtitle="Privacy notice, terms of use, disclaimer, and trademark attribution."
      />

      {/* Quick-jump index */}
      <nav className="card card-pad flex flex-wrap gap-2" aria-label="Legal sections">
        <span className="label mr-1">Jump to</span>
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={`#${s.id}`}
            className="chip hover:border-brand/40 hover:text-brandLight transition-colors"
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {/* 1. Privacy Notice */}
      <Section id="privacy" title="Privacy Notice">
        <p>
          AI FinOps is a self-hosted application. The organisation that deploys it controls
          all data. The following describes what the application collects and how it is stored.
        </p>

        <div className="space-y-1">
          <div className="font-semibold text-ink">Data we collect</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Authentication data.</strong> If magic-link login is enabled, an email address
              is collected to generate and send a single-use login link. The link token is stored as
              a SHA-256 hash only; the raw token is never persisted. Email addresses are retained
              until the administrator deletes them.
            </li>
            <li>
              <strong>AI usage logs.</strong> Prompt text, token counts, latency, model name, and
              cost are stored when your applications send data via the ingest API
              (<code className="font-mono text-xs">POST /api/log</code>) or when provider import
              jobs run. This is the core data the application analyses. It may contain content
              from your AI applications; ensure you have appropriate internal consent before
              sending sensitive data to the ingest endpoint.
            </li>
            <li>
              <strong>Provider API keys.</strong> Keys entered on the Connectors page are encrypted
              with AES-256-GCM before being written to the database. The raw key is never stored
              in plain text and is never included in logs or API responses.
            </li>
            <li>
              <strong>Feedback.</strong> Text submitted via the feedback widget is stored in the
              database and visible only to administrators.
            </li>
            <li>
              <strong>Audit log.</strong> Every mutating action (budget changes, API-key revocations,
              imports, logins) is recorded in an append-only audit log with a timestamp and actor.
            </li>
          </ul>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-ink">How data is stored</div>
          <p>
            All data is stored in the PostgreSQL database configured by the deploying organisation.
            Provider credentials are additionally encrypted at the application layer (AES-256-GCM).
            The hosting provider (e.g. Vercel, Render, or your own server) processes data as a
            sub-processor under your organisation&apos;s control.
          </p>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-ink">Third-party services</div>
          <p>When certain features are used, data may flow to third-party services:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Anthropic API.</strong> If the AI prompt-rewrite feature is enabled on the
              Optimizer page, prompt text is sent to Anthropic&apos;s API using the API key you
              configured. Anthropic&apos;s{' '}
              <a
                href="https://www.anthropic.com/legal/privacy"
                target="_blank"
                rel="noreferrer noopener"
                className="text-brandLight hover:underline underline-offset-4"
              >
                Privacy Policy
              </a>{' '}
              applies to that data.
            </li>
            <li>
              <strong>Email provider.</strong> If SMTP is configured, email addresses and digest
              content are transmitted to your configured SMTP server.
            </li>
            <li>
              <strong>Slack.</strong> If the Slack integration is enabled, workspace tokens and
              message content may be sent to Slack&apos;s API. Slack&apos;s{' '}
              <a
                href="https://slack.com/trust/privacy/privacy-policy"
                target="_blank"
                rel="noreferrer noopener"
                className="text-brandLight hover:underline underline-offset-4"
              >
                Privacy Policy
              </a>{' '}
              applies to that data.
            </li>
          </ul>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-ink">Your rights</div>
          <p>
            Data subjects whose personal data is processed through this application should direct
            access, rectification, deletion, or portability requests to the organisation that
            deployed this application, not to AI FinOps contributors. As a self-hosted tool,
            the deploying organisation is the data controller.
          </p>
        </div>
      </Section>

      {/* 2. Terms of Use */}
      <Section id="terms" title="Terms of Use">
        <p>
          AI FinOps is open-source software released under the{' '}
          <Link href="/legal#disclaimer" className="text-brandLight hover:underline underline-offset-4">
            MIT Licence
          </Link>
          . By using or deploying this software you agree to the following:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            You are responsible for ensuring your use of this application complies with applicable
            laws, including data-protection regulations (GDPR, CCPA, PDPA, or equivalent) in your
            jurisdiction.
          </li>
          <li>
            You are responsible for the security of your deployment environment, including the
            database, encryption keys, and any API keys stored in the system.
          </li>
          <li>
            Cost estimates, savings projections, and recommendations generated by this application
            are heuristic estimates only — see the Disclaimer below.
          </li>
          <li>
            You must not use this application in a way that violates the terms of service of any
            AI provider whose credentials are stored in the system.
          </li>
        </ul>
      </Section>

      {/* 3. Disclaimer */}
      <Section id="disclaimer" title="Disclaimer of Warranty">
        <div className="card card-pad border-warn/30 bg-warn/5">
          <p className="font-semibold text-warn mb-2">
            All cost estimates and recommendations are for informational purposes only.
          </p>
          <p>
            The token counts, cost figures, savings projections, and optimisation recommendations
            produced by AI FinOps are <strong>estimates</strong>. They are derived from heuristic
            analysis and provider-reported token counts, which may differ from actual provider
            invoices due to caching, rounding, pricing-tier differences, or changes in provider
            pricing. Do not make financial or operational decisions based solely on figures shown
            in this application without independent verification against your provider&apos;s
            billing dashboard.
          </p>
        </div>

        <p>
          AI FinOps is provided &ldquo;as is&rdquo; under the MIT Licence, without warranty of
          any kind, express or implied, including but not limited to the warranties of
          merchantability, fitness for a particular purpose, and non-infringement. In no event
          shall the authors or copyright holders be liable for any claim, damages, or other
          liability, whether in an action of contract, tort, or otherwise, arising from, out of,
          or in connection with the software or the use or other dealings in the software.
        </p>

        <p>
          The full MIT Licence text is available at{' '}
          <a
            href="https://github.com/SyedHZRizvi/ai-finops/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer noopener"
            className="text-brandLight hover:underline underline-offset-4"
          >
            github.com/SyedHZRizvi/ai-finops/blob/main/LICENSE
          </a>
          .
        </p>
      </Section>

      {/* 4. Cookies */}
      <Section id="cookies" title="Cookie Usage">
        <p>
          This application uses the following cookies. No tracking, advertising, or analytics
          cookies are used.
        </p>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Cookie name</th>
                <th>Purpose</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-mono text-xs">finops_session</td>
                <td>
                  Authentication session. Set when you log in via password or magic link.
                  Strictly necessary for the application to function.
                </td>
                <td className="whitespace-nowrap">Session / 7 days</td>
              </tr>
              <tr>
                <td className="font-mono text-xs">finops_slack_oauth_state</td>
                <td>
                  CSRF protection token used during the Slack OAuth installation flow.
                  Set only when you initiate the Slack integration. Cleared immediately
                  after the OAuth callback completes.
                </td>
                <td className="whitespace-nowrap">~5 minutes</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Both cookies are strictly necessary for the services they support and do not require
          a consent banner under the EU ePrivacy Directive. No cookies are set for users who
          are not logged in.
        </p>
      </Section>

      {/* 5. Trademarks */}
      <Section id="trademarks" title="Trademark Attribution">
        <p>
          AI FinOps is an independent open-source project. It is not affiliated with,
          endorsed by, sponsored by, or officially connected to any of the companies listed
          below. All product and company names are trademarks or registered trademarks of their
          respective owners.
        </p>
        <ul className="list-disc pl-5 space-y-1 columns-2">
          <li>OpenAI and GPT are trademarks of OpenAI, LLC.</li>
          <li>Claude and Anthropic are trademarks of Anthropic PBC.</li>
          <li>Gemini, Google, Vertex AI, and Google Cloud are trademarks of Google LLC.</li>
          <li>AWS, Amazon Bedrock, and Amazon Web Services are trademarks of Amazon.com, Inc.</li>
          <li>Azure and Microsoft are trademarks of Microsoft Corporation.</li>
          <li>Slack is a trademark of Slack Technologies, LLC, a Salesforce company.</li>
          <li>Perplexity is a trademark of Perplexity AI, Inc.</li>
          <li>Groq is a trademark of Groq, Inc.</li>
          <li>Mistral is a trademark of Mistral AI SAS.</li>
          <li>Cohere is a trademark of Cohere Inc.</li>
          <li>Together AI is a trademark of Together Computer, Inc.</li>
          <li>Replicate is a trademark of Replicate, Inc.</li>
          <li>LangChain is a trademark of LangChain, Inc.</li>
          <li>Vercel is a trademark of Vercel, Inc.</li>
          <li>Cursor is a trademark of Anysphere, Inc.</li>
        </ul>
        <p>
          Use of these names on this site is purely for interoperability description purposes
          and does not imply any relationship with or endorsement by the respective trademark owners.
        </p>
      </Section>

      <div className="text-xs text-muted">
        Last updated: June 2026 · AI FinOps v0.1 beta
      </div>
    </div>
  );
}
