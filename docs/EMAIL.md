# Email & Magic-Link Authentication

AI FinOps ships with optional outbound email — used for **magic-link
sign-in**, weekly digests, anomaly alerts, and welcome notes. Email is
opt-in: without any of the `FINOPS_MAIL_*` variables set, the dashboard
keeps working exactly as it did before, and outbound traffic stays
webhook-only (Slack / Teams).

## TL;DR

```bash
# Recommended for production — Resend, free tier covers 3k/mo.
FINOPS_MAIL_TRANSPORT=resend
FINOPS_MAIL_FROM="AI FinOps <noreply@yourdomain.com>"
FINOPS_MAIL_API_KEY=re_xxx_xxx
```

Restart, then visit `/login`. You'll see a "Email me a sign-in link"
form below the password field.

## Transports

The mailer accepts four transport modes, picked via
`FINOPS_MAIL_TRANSPORT`:

| Transport  | Required vars                                  | Notes                                                |
| ---------- | ---------------------------------------------- | ---------------------------------------------------- |
| `resend`   | `FINOPS_MAIL_FROM`, `FINOPS_MAIL_API_KEY`      | Recommended. Free tier 3,000 emails/month.           |
| `sendgrid` | `FINOPS_MAIL_FROM`, `FINOPS_MAIL_API_KEY`      | Enterprise option. Free tier 100/day.                |
| `smtp`     | `FINOPS_MAIL_FROM`, `FINOPS_SMTP_URL`          | **Placeholder.** Requires nodemailer (not bundled).  |
| `console`  | (none)                                         | Logs emails to stdout for dev. Default when nothing else is configured. |

If you set `FINOPS_MAIL_API_KEY` but leave `FINOPS_MAIL_TRANSPORT` blank,
the mailer defaults to `resend`.

### Resend

1. Sign up at https://resend.com — free tier requires no credit card.
2. Add and verify your sending domain (SPF, DKIM, DMARC walkthrough is in
   the Resend dashboard).
3. Create an API key (Project → API Keys → "Create API Key", grant the
   `sending_access` scope).
4. Set:
   ```bash
   FINOPS_MAIL_TRANSPORT=resend
   FINOPS_MAIL_FROM="AI FinOps <noreply@yourdomain.com>"
   FINOPS_MAIL_API_KEY=re_xxx_xxx
   ```
5. Restart. Hit `POST /api/email/test` with `{ "to": "you@yourdomain.com" }`
   to verify.

### SendGrid

1. Sign up at https://sendgrid.com.
2. Verify a sender identity (Single Sender for testing; Domain Authentication
   for production).
3. Create an API key with **Mail Send → Full Access** permission.
4. Set:
   ```bash
   FINOPS_MAIL_TRANSPORT=sendgrid
   FINOPS_MAIL_FROM="AI FinOps <noreply@yourdomain.com>"
   FINOPS_MAIL_API_KEY=SG.xxx
   ```

### SMTP (placeholder)

The `smtp` transport is reserved. AI FinOps does not bundle nodemailer
and the SMTP protocol is too involved to hand-roll. If you need plain
SMTP delivery you have two paths:

- **Front your SMTP server with Resend/SendGrid.** Both accept custom
  domains and inherit modern deliverability features.
- **Add nodemailer yourself.** Install it (`npm i nodemailer`) and replace
  the `smtpStub()` in `src/lib/mailer.ts` with an implementation that
  uses `nodemailer.createTransport(cfg.smtpUrl).sendMail(...)`.

### Console (dev)

When no transport is configured, the mailer logs a pretty preview of every
email to stdout. Useful for local development — no setup, no real emails:

```
┌─ EMAIL (dev console transport) ─────────
│ From: ai-finops@localhost
│ To: you@example.com
│ Subject: Your AI FinOps sign-in link
│ — body —
│ <h1>Sign in to AI FinOps</h1>...
└─────────────────────────────────────────
```

To click a magic link generated in console mode: copy the URL from the
log output (or — easier — set `FINOPS_MAIL_TRANSPORT=console` explicitly,
which still goes through the full template path so you can copy from the
preview block).

## DNS records for production

Once you have a sending domain (e.g. `mail.yourcompany.com`), set up the
three standard records. Both Resend and SendGrid provide copy-pasteable
values in their dashboard.

| Record | Purpose                                                                 |
| ------ | ----------------------------------------------------------------------- |
| **SPF** (TXT) | Authorize the provider to send on your domain's behalf. Example: `v=spf1 include:_spf.resend.com -all`. Don't stack multiple `v=spf1` records — merge them. |
| **DKIM** (TXT / CNAME) | Per-message cryptographic signature. The provider gives you a CNAME or TXT record to add. Without this, emails go to spam. |
| **DMARC** (TXT) | Policy that tells receivers what to do with mail that fails SPF + DKIM. Start with `v=DMARC1; p=none; rua=mailto:dmarc@yourcompany.com;` to monitor, then tighten to `p=quarantine` or `p=reject`. |

Allow up to 48 hours for DNS to propagate. The provider dashboard will
show a green checkmark once everything verifies — DO NOT send mail
before then or your domain reputation takes the hit.

## Magic-link sign-in flow

This is how a user signs in once email is configured:

1. **User visits `/login`**. They see an email input and "Email me a
   sign-in link" button (below the password form if both are configured;
   alone if only email is configured).

2. **User submits email**. The browser POSTs `{ email }` to
   `/api/auth/magic-link`. The endpoint:
   - Validates the email (light syntactic check — no MX lookup).
   - Checks the per-email 60-second cooldown.
   - Generates a 32-byte random token, stores its **SHA-256 hash** in
     `MagicLinkToken` with a 15-minute expiry.
   - Sends the email via the configured transport.
   - Returns `{ ok: true }` — ALWAYS, regardless of whether the email
     was real, rate-limited, or the mailer succeeded. This prevents
     **email enumeration**.

3. **User receives email** containing a link like
   `https://your-finops/magic?t=<token>`.

4. **User clicks link**. The `/magic` page server-side:
   - Hashes the URL token, looks up the row.
   - Rejects if not found, expired, or already used.
   - Marks `usedAt = now()` atomically (single-use enforcement; concurrent
     clicks race on the same row, only one wins).
   - Mints the `finops_session` cookie — the **same** cookie used by the
     password gate, so the middleware accepts both auth modes.
   - On first-ever sign-in for that email, sends a welcome email.
   - Redirects to `/` (or `?next=...` if supplied on the original link).

5. **Subsequent requests carry the cookie**. 30-day session.

### Cookie signing in magic-link-only mode

When `FINOPS_DASHBOARD_PASSWORD` is set, that password is the HMAC key
for the session cookie. When ONLY magic-link is configured, we derive a
stable secret from `FINOPS_MAIL_FROM`:

```
secret = "magic-link:" + FINOPS_MAIL_FROM
```

Rotating `FINOPS_MAIL_FROM` therefore invalidates every existing
session — same one-line rotation story as password rotation.

## Testing

```bash
# As a logged-in user (cookie set):
curl -X POST https://your-finops/api/email/test \
  -H "Content-Type: application/json" \
  -d '{"to":"you@yourcompany.com"}' \
  --cookie "finops_session=<your-cookie>"

# As ops, with the cron secret:
curl -X POST https://your-finops/api/email/test \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"to":"you@yourcompany.com"}'
```

Response:

```json
{
  "ok": true,
  "transport": "resend",
  "messageId": "8f...d3"
}
```

A failure response gives the provider's actual error message, e.g.
`"Resend: API key is invalid"` or `"SendGrid: From address does not
match a verified Sender Identity"`.

## Security model

- **Tokens are stored as SHA-256 hashes**, never plaintext. A DB leak
  cannot be used to sign in.
- **Single-use**: the `MagicLinkToken.usedAt` column is set atomically on
  redemption. Replaying the URL returns "link already used".
- **15-minute expiry**: hard upper bound on how long a leaked link is
  usable.
- **1 link / 60s per email**: prevents email-flood abuse AND limits how
  many parallel tokens an attacker can generate while brute-forcing.
- **Enumeration neutrality**: `/api/auth/magic-link` always returns the
  same response. Probes can't tell which addresses are valid.
- **No users table**: the magic-link grants a session, but every magic
  link is just a "yes, I control this inbox" check. If you need an email
  allowlist, add one in front of `requestMagicLink()` (e.g. an
  `FINOPS_ALLOWED_EMAIL_DOMAINS` env var).

## Disabling email

Unset all `FINOPS_MAIL_*` variables and restart. The dashboard reverts to
the prior webhook-only outbound. The login page hides the magic-link
form. Existing sessions stay valid until they expire normally.

## Failure modes

| Symptom                                          | Cause                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `/api/email/test` returns `ok: true` but no email arrives | Console transport. Set a real `FINOPS_MAIL_TRANSPORT`.                     |
| `Resend: API key is invalid`                     | Key copied with a stray space, or revoked in the Resend dashboard.                 |
| `Resend: domain is not verified`                 | Add SPF + DKIM records, wait for verification in the Resend domain settings.       |
| `SendGrid: The from address does not match a verified Sender Identity` | Verify your sending domain (or Single Sender for testing).        |
| Magic link → "this link has expired"             | More than 15 minutes between request and click. Send a fresh link.                 |
| Magic link → "already been used"                 | The link was clicked twice (likely a corporate link-prewarming security scanner — common with Outlook ATP / Mimecast). Send a fresh link; user must click within ~5 minutes before the scanner does. |

## Related files

- `src/lib/mailer.ts` — transport dispatch + Resend/SendGrid clients.
- `src/lib/magicLink.ts` — token mint / verify / rate-limit / dedupe.
- `src/lib/emailTemplates.ts` — per-template body builders.
- `src/app/api/auth/magic-link/route.ts` — public request endpoint.
- `src/app/api/email/test/route.ts` — ops verification endpoint.
- `src/app/magic/route.ts` — token redemption + session mint (Route Handler; redirects on success, renders HTML on failure).
- `prisma/schema.prisma` — `MagicLinkToken` model.
