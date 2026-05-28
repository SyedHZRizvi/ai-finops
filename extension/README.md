# AI FinOps Optimizer — Browser Extension

A tiny Chrome (Manifest V3) extension that drops a purple lightning-bolt onto ChatGPT, Claude, Gemini, and Perplexity. One click sends your draft prompt to your local AI FinOps dashboard, where it gets optimized for tokens, cost, and clarity — then you apply the result back into the page with another click.

## Features

- **One-click optimize** — Capture the prompt you're typing into the host site, send it to `/api/optimize`, and see how many tokens and dollars you'd save before sending.
- **Apply or copy** — Drop the optimized prompt directly into the page's textarea (works with React-backed inputs, ProseMirror, Quill) or copy it to the clipboard.
- **Studio mode** — Open the dashboard's `/studio` page with your prompt and target provider pre-filled, for deeper rewrites and variant comparison.
- **Local-first** — Talks only to your own dashboard (`http://localhost:3000` by default). No third-party calls.
- **CORS-safe** — All fetches go through the extension service worker, which has explicit host permissions for `localhost:3000`. Your dashboard does not need CORS headers.
- **Dark mini-UI** — Matches the dashboard's purple gradient. Won't pollute the host page (everything is prefixed `aifo-`).

## Supported sites

| Site | URL |
|---|---|
| ChatGPT | `chat.openai.com`, `chatgpt.com` |
| Claude | `claude.ai` |
| Gemini | `gemini.google.com` |
| Perplexity | `perplexity.ai`, `www.perplexity.ai` |

## Install

See [INSTALL.md](./INSTALL.md). Short version: `chrome://extensions` → Developer mode → Load unpacked → pick this folder.

## Configure

Click the toolbar icon. Two fields:

- **Base URL** — your dashboard origin. Default `http://localhost:3000`.
- **Ingest token** — optional bearer token, sent as `Authorization: Bearer <token>` on every API call.

Click **Test connection** to ping `/api/pricing`.

## How it works

```
chatgpt.com  ─[click bolt]──▶  content.js
                                   │
                                   ▼
                       chrome.runtime.sendMessage
                                   │
                                   ▼
                          background.js (SW)
                                   │
                                   ▼
                http://localhost:3000/api/{optimize,studio,log}
```

The content script never fetches `localhost` directly. The service worker has `host_permissions` for localhost, so it bypasses both the host page's CSP and any CORS rule on the dashboard.

## Screenshots

_(placeholder — add screenshots of the FAB and panel here)_

## Limitations

- **Selectors break when sites redesign.** If the bolt opens but says "Prompt is empty" when the textarea clearly has text, the selectors in `SITE_CONFIG` (top of `content.js`) need updating. Add the new selector to the relevant site's array — the code tries them in order.
- **Can't intercept passively.** The extension only acts on user click. It doesn't watch your typing or auto-rewrite outgoing requests.
- **Token counts are approximations.** The optimizer uses the dashboard's tokenizer estimate, not the host model's exact tokenization. Expect ~5–10% drift.
- **MV3 service worker can be evicted.** The first call after a long idle may take a second longer while the worker spins back up. This is a Chrome platform limitation.
- **SVG icons.** Some Chrome versions don't render the SVG in every surface. See `icons/README-icon.md` to convert to PNG.

## Files

```
extension/
├── manifest.json
├── background.js   ─ service worker; all fetches go through here
├── content.js      ─ injected into the four target sites; FAB + panel
├── styles.css      ─ aifo-prefixed styles
├── popup.html      ─ toolbar popup (settings, test connection)
├── popup.js
├── icons/icon.svg
├── INSTALL.md
└── README.md
```

## Privacy

The extension only sends data to the **Base URL** you configure. By default that's `http://localhost:3000`, i.e. nothing leaves your machine. No analytics, no telemetry, no third-party calls.
