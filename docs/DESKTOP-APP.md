# AI FinOps — Desktop App

## What this is

AI FinOps as a native desktop application for Windows, macOS, and Linux. The
same dashboard you'd run at `localhost:3000`, the same SQLite database, the
same Prisma engine — wrapped in an Electron shell so end users can install it
with a double-click and launch it from their dock / Start menu / launcher.
Designed for **internal enterprise deployment**: each analyst runs their own
copy against their own local database, with provider API keys encrypted at
rest using the OS keychain.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  AI FinOps.app (Electron)                                             │
│                                                                       │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │  Main process (Node)                                         │    │
│   │                                                              │    │
│   │   server-manager.ts ──spawn──> next-standalone/server.js     │    │
│   │                                  (random free 127.0.0.1 port)│    │
│   │                                                              │    │
│   │   tray.ts ─────────────> system tray menu                    │    │
│   │   crypto.ts ────────────> OS keychain (safeStorage)          │    │
│   └─────────────────────────────────────────────────────────────┘    │
│                              │                                        │
│                              ▼                                        │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │  BrowserWindow → http://127.0.0.1:<port>                     │    │
│   │  context-isolated, no nodeIntegration, sandboxed renderer    │    │
│   └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

The Next.js server runs as a child process of Electron, listening only on the
loopback interface on an OS-assigned port (so two desktops on the same
machine never collide). Nothing is exposed to the network.

### Where data lives

| Platform | Path                                                   |
| -------- | ------------------------------------------------------ |
| macOS    | `~/Library/Application Support/AI FinOps/`             |
| Windows  | `%APPDATA%\AI FinOps\`                                 |
| Linux    | `~/.config/AI FinOps/`                                 |

Inside that directory:

- `ai-finops.db` — the SQLite database (usage events, credentials, jobs)
- `finops.key` — credentials encryption key, wrapped by `safeStorage`
- `logs/` — Electron + Next.js stdout/stderr

## Development

```bash
npm install
npm run electron:dev
```

`electron:dev` runs `next dev` and the Electron shell side-by-side via
`concurrently`. `wait-on` blocks Electron until `http://localhost:3000`
responds, so you get the dashboard with HMR.

You can also continue to use plain `npm run dev` and load the app in your
browser — the Electron shell is purely additive.

### Iterating on the Electron code

Electron sources live in `electron/`. The dev script transpiles them on each
Electron launch (`tsc -p electron`). If you only changed Electron code, kill
the Electron window (Cmd-Q) and re-run `npm run electron:start`. Next.js
content doesn't need a rebuild — HMR handles it.

## Building installers

Output lands in `release/`.

```bash
# All targets for the current host platform
npm run electron:build

# Or per-platform
npm run electron:build:mac
npm run electron:build:win
npm run electron:build:linux
```

### What each script does

1. `npm run build` → produces `.next/standalone/` (requires
   `output: 'standalone'` in `next.config.mjs`, already set).
2. `npm run electron:build:tsc` → compiles `electron/*.ts` to
   `dist-electron/`.
3. `electron-builder` → bundles everything into platform installers.

### Cross-compilation caveats

| Building for | Best built on | Possible on other hosts?                              |
| ------------ | ------------- | ----------------------------------------------------- |
| macOS        | macOS         | No (code signing + .icns generation require macOS)    |
| Windows      | Windows       | From macOS/Linux with Wine installed                  |
| Linux        | Linux         | Yes, but cleanest from Linux or via Docker            |

For reproducible cross-platform builds, run electron-builder inside the
`electronuserland/builder` Docker image.

## Code signing and notarization

The honest version: signing turns "scary download" into "trusted install,"
and Apple + Microsoft both want money for that trust.

### macOS

Distribution outside the Mac App Store requires:

1. **Apple Developer Program** membership (~$99/yr).
2. A **Developer ID Application** certificate downloaded from
   developer.apple.com.
3. **Notarization** — your built binary uploaded to Apple, scanned, stapled.

Set these env vars and electron-builder handles signing + notarization:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD='cert-password'
export APPLE_ID='you@company.com'
export APPLE_APP_SPECIFIC_PASSWORD='app-specific-password-from-appleid.com'
export APPLE_TEAM_ID='ABC123XYZ'
npm run electron:build:mac
```

Without signing, the app will launch but Gatekeeper warns users with
"`AI FinOps` is damaged and can't be opened" or similar. Internal users
can right-click → Open the first time to bypass, or run
`xattr -dr com.apple.quarantine /Applications/AI\ FinOps.app`.

### Windows

Distribution should use a code-signing certificate from a public CA:

- **Standard OV cert**: ~$200-400/yr, still triggers SmartScreen warnings
  until enough users install the same binary to build reputation.
- **EV cert**: ~$300-700/yr, requires a hardware token, but reputation is
  granted immediately.

Set `CSC_LINK` and `CSC_KEY_PASSWORD` the same way. Without signing,
SmartScreen shows "Windows protected your PC" — clickable past, but
unsettling for non-technical users.

### Linux

AppImage and `.deb` don't require signing. For an apt repository you'll
want a GPG key — add it via `electron-builder`'s `linux.maintainer` and
publish your repo with a signed `Release` file. Out of scope for this app's
current build.

### Internal enterprise distribution

If you're shipping to corporate devices managed by MDM (Intune, Jamf,
Workspace ONE), the MDM can install an unsigned binary and trust it
implicitly. Talk to your sysadmin — you may not need a public certificate
at all.

## Auto-update

Not wired up. electron-builder supports it via `electron-updater` and can
target GitHub Releases, S3, or a generic HTTPS host. To enable later:

1. Add a `publish` block under `build` in `package.json` (e.g.
   `{ "provider": "github", "owner": "your-org", "repo": "ai-finops" }`).
2. Add `electron-updater` to dependencies.
3. Wire `autoUpdater.checkForUpdatesAndNotify()` into `electron/main.ts`
   after `app.whenReady()`.

Until then, distribute new versions by re-running `electron:build` and
asking users to reinstall.

## First-run experience

On first launch the BrowserWindow opens directly to the dashboard. If the
database is empty (no usage events, no credentials), the dashboard routes to
the `/setup` wizard built by the setup-wizard agent. The wizard collects
provider API keys (OpenAI, Anthropic, etc.) and optionally kicks off a
backfill import.

## Tray menu

The system tray icon is always present while the app is running. Right-click
(or single-click on Windows/Linux) opens:

- **AI FinOps** (header, disabled)
- **Show Dashboard** — restore + focus the window
- **Open in Browser** — opens `http://127.0.0.1:<port>` in the default
  browser. Useful for screen-sharing the dashboard without sharing the
  whole Electron window.
- **Quit AI FinOps** — actually exits (closing the window only hides it).

Closing the window via the OS close button **does not** quit the app; it
hides to tray. Same model as Slack, Discord, etc.

## Troubleshooting

**Port conflict.** We bind to an OS-assigned ephemeral port, so a stuck
process on 3000 won't break us.

**SQLite permission errors.** The DB lives under `userData`, which Electron
guarantees is writable by the current user. If you see EACCES, you've moved
the app between user accounts — copy `ai-finops.db` to the new account's
userData dir.

**`safeStorage` not available (Linux, no keyring).** The credentials key
falls back to a 0600 plaintext file at `<userData>/finops.key`. Acceptable
for single-user installs. To enable proper encryption, install
`gnome-keyring` or `kwallet` and re-launch — but note that switching modes
won't migrate existing encrypted credentials; you'd need to re-enter API
keys.

**Window opens to a blank page.** Likely the Next.js standalone server
didn't start. Check `<userData>/logs/` (or stderr if you ran from a
terminal) for `[next]`-prefixed errors. The most common cause is a missing
`.next/standalone/` directory — run `npm run build` before
`electron:build`.

**Tray icon missing.** You haven't generated the icon binaries yet. See
`electron/icons/README.md`. The app still works; only the icons are
cosmetic.

## Limitations

- **Bundle size.** A packaged installer is ~150-250 MB. Electron + Node +
  Chromium + the Next.js bundle. Roughly the same as VS Code or Slack.
- **RAM idle.** ~250 MB resident. Most of that is Chromium for the
  renderer.
- **Native modules.** Today there are none. If you ever add one (e.g. a
  native SQLite driver) it must be rebuilt against Electron's Node ABI via
  `electron-rebuild`. `better-sqlite3` users will need this; we currently
  use Prisma's bundled engine so we're fine.
- **First build requires a manual two-step.** `next build` and the Electron
  tsc compile both run from `electron:build`, but if you skip
  `electron:build` and run `electron:start` against a fresh checkout, the
  shell will fail with "Next.js standalone server.js not found" — that's
  the expected error. Run `npm run build` once.
- **No auto-update channel** (see "Auto-update" above).
- **No telemetry.** Deliberate. The app talks only to the configured
  provider APIs and your local DB.
