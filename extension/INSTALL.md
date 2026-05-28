# Install — AI FinOps Optimizer (Chrome MV3)

## Load the extension

1. Open `chrome://extensions` in Chrome (or any Chromium browser: Edge, Brave, Arc).
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked**.
4. Select the `extension/` folder inside your `ai-finops` repo.
5. The extension card appears. Click the puzzle icon in Chrome's toolbar and **pin** "AI FinOps Optimizer" so the icon is always visible.

## Start the dashboard

In a terminal, from the repo root:

```
npm run dev
```

The dashboard must be running at `http://localhost:3000` (or whatever you set as **Base URL** in the popup).

## Try it

Visit any of:

- https://chatgpt.com (or https://chat.openai.com)
- https://claude.ai
- https://gemini.google.com
- https://www.perplexity.ai

You should see a purple lightning-bolt button at the bottom-right. Type a prompt into the site's input, click the bolt, then **Optimize** or **Studio mode**.

## About CORS

You don't need to enable CORS on the dashboard. All `fetch()` calls happen inside the extension's **service worker** (`background.js`), which has `host_permissions` for `http://localhost:3000/*`. The content script (running on `chatgpt.com`, etc.) delegates to the service worker via `chrome.runtime.sendMessage`. The page's CSP and CORS rules don't apply to that path.

If you see "Could not reach AI FinOps":

- Confirm `npm run dev` is running and `curl http://localhost:3000/api/pricing` returns JSON.
- Open the popup, set the correct **Base URL**, click **Test connection**.
- Check `chrome://extensions` → your extension → **Service worker** → **Inspect** for errors.

## Icons (optional)

Chrome accepts the bundled `icon.svg` for most surfaces, but some versions need PNG. See `icons/README-icon.md` for a one-liner to convert.
