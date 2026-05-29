'use client';

// "Add to Slack" button. Links to /api/slack/oauth/install which kicks
// off the OAuth dance. We render the official "Add to Slack" visual
// inline as SVG — same proportions as Slack's PNG asset but no binary
// dependency, no extra HTTP request, and it scales cleanly at any DPI.

import Link from 'next/link';

interface SlackInstallButtonProps {
  /**
   * When false, the button is shown as a disabled-looking stub. Used
   * on the /slack page when SLACK_CLIENT_ID isn't configured yet so
   * users see the visual but can't initiate a doomed redirect.
   */
  enabled?: boolean;
  /** Custom label override; defaults to "Add to Slack". */
  label?: string;
}

function SlackLogo() {
  // Slack's logo is 4 rounded rectangles arranged in a pinwheel. The
  // canonical brand colors are documented on slack.com/intl/en-us/media-kit.
  return (
    <svg
      viewBox="0 0 122.8 122.8"
      width="20"
      height="20"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z"
        fill="#E01E5A"
      />
      <path
        d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z"
        fill="#36C5F0"
      />
      <path
        d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z"
        fill="#2EB67D"
      />
      <path
        d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z"
        fill="#ECB22E"
      />
    </svg>
  );
}

export function SlackInstallButton({ enabled = true, label = 'Add to Slack' }: SlackInstallButtonProps) {
  // The visual matches Slack's official button — dark slate background,
  // white text, multicolor logo. We render it as a Next.js Link when
  // enabled and a plain disabled-styled div when not.
  const common =
    'inline-flex items-center gap-2.5 px-5 h-12 rounded-xl font-semibold text-sm select-none transition-all duration-150 shadow-card';

  if (!enabled) {
    return (
      <div
        className={`${common} bg-panel2 text-muted cursor-not-allowed border border-border`}
        aria-disabled="true"
      >
        <SlackLogo />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <Link
      href="/api/slack/oauth/install"
      className={`${common} bg-[#4A154B] text-white hover:bg-[#611F69] active:scale-[0.98]`}
      // Pre-fetch is pointless for an OAuth redirect — keep the network quiet.
      prefetch={false}
    >
      <SlackLogo />
      <span>{label}</span>
    </Link>
  );
}
