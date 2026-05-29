# Dashboard Authentication

AI FinOps ships with an **opt-in shared-password gate** for the web
dashboard. By default it is **disabled** — anyone who can reach the URL can
view every prompt and cost figure. Enable the gate when you want to share
the deployed dashboard with internal staff without exposing it to the
broader internet.

## Enabling

Set a single environment variable on the platform that runs the dashboard
(Vercel, Fly, Render, Docker, etc.):

```bash
FINOPS_DASHBOARD_PASSWORD="some-shared-secret"
```

Restart / redeploy. On the next request, the dashboard will redirect
unauthenticated browsers to `/login`.

That's it. No database migrations, no other config, no SSO.

## Disabling

Unset `FINOPS_DASHBOARD_PASSWORD` (or set it to an empty / whitespace-only
value) and restart. The dashboard immediately reverts to the fully-public
default — every page works without sign-in.

## Model

- **One shared password.** Single tenant, no users table, no roles. Everyone
  who can sign in sees everything.
- **HMAC-signed cookie.** The cookie payload is constant; its signature is
  HMAC-SHA256 of that payload using the password as the key. Rotating the
  password instantly invalidates every existing cookie — no database state
  to clean up.
- **30-day sessions.** Cookie is `HttpOnly`, `Secure` (in production),
  `SameSite=Lax`, `Path=/`, `Max-Age=2592000`. After 30 days users sign in
  again.

## What's protected

When auth is enabled, **all pages** and **most API routes** require a valid
signed cookie. Without one:

- Page requests are redirected to `/login?next=<original-path>`.
- API requests get a JSON `401 { "error": "Authentication required" }`.

## What stays open

A small allowlist remains reachable without a cookie even when auth is
enabled. These are the paths that uptime probes, SDK clients, and the
browser's own infrastructure need:

| Path                   | Why                                                              |
| ---------------------- | ---------------------------------------------------------------- |
| `/api/log`             | SDK ingest — clients use their own bearer token (`FINOPS_INGEST_TOKEN`) |
| `/api/health`          | Uptime monitors, load balancer probes                            |
| `/api/stream`          | SSE live ticker — leaks no sensitive data, useful for monitors   |
| `/api/auth/login`      | Otherwise there's no way to sign in                              |
| `/api/auth/logout`     | No-op when signed out, harmless                                  |
| `/login`               | The sign-in page itself                                          |
| `/favicon.svg`, `/og-default.svg`, `/robots.txt`, `/sitemap.xml`, `/_next/*` | Static assets |

If you want to lock `/api/log` too, keep using `FINOPS_INGEST_TOKEN` —
that's the dedicated bearer secret for SDK auth and is independent of the
dashboard gate.

## Rate limiting

`/api/auth/login` tracks failed attempts per source IP in process memory.
After **5 failures in a 60-second window** the IP gets `HTTP 429` for the
rest of the window. Successful sign-ins clear the counter. Failure counters
are best-effort: serverless cold starts reset them. Pair with a CDN-level
WAF if you need defense against a determined attacker.

## Rotating the password

1. Change `FINOPS_DASHBOARD_PASSWORD` to a new value.
2. Redeploy / restart.

All previously-issued cookies become invalid immediately because the HMAC
key changed. Users will be bounced to `/login` on their next request.

## Signing out

The dashboard exposes a "Sign out" control in the nav. It POSTs to
`/api/auth/logout`, which clears the cookie, and then navigates to
`/login`.

You can also sign out manually by deleting the `finops_session` cookie from
your browser.

## Threat model — what this is and isn't

This is a **simple gate**, not a full identity system. It protects against:

- Random internet scanners stumbling onto your dashboard URL.
- Casual sharing of the URL to people you don't want browsing it.

It does **not** provide:

- Per-user audit trails (everyone uses the same password).
- Role-based access (it's all-or-nothing).
- SSO / federation.
- Defense against an insider who has the shared password.

If you need any of those, this gate is the wrong tool — wire the dashboard
behind your existing identity provider (Cloudflare Access, IAP, Okta SAML,
etc.) instead.
