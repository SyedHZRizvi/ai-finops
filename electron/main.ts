/**
 * Electron main process for AI FinOps.
 *
 * Responsibilities (in order, at startup):
 *   1. Acquire the single-instance lock; if a second instance launches, just
 *      focus the existing window and bail.
 *   2. Resolve userData paths for the SQLite DB and credentials key.
 *   3. Generate-or-load the credentials encryption key via safeStorage.
 *   4. In production: spawn the embedded Next.js standalone server on a
 *      random free port and wait for it to come up.
 *      In dev: assume `npm run dev` is already running on :3000.
 *   5. Create the main BrowserWindow pointed at the resolved URL.
 *   6. Wire up the system tray.
 *   7. Quit cleanly: tear down the Next.js child before app exit.
 */
import { app, BrowserWindow, shell, type Event as ElectronEvent } from 'electron';
import path from 'node:path';
import { serverManager } from './server-manager';
import { ensureKey } from './crypto';
import { createTray, destroyTray } from './tray';

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
const DEV_URL = 'http://localhost:3000';

let mainWindow: BrowserWindow | null = null;
/**
 * Flips to true when the user explicitly quits (tray menu, app.quit(), etc.).
 * Used to distinguish "user closed the window — keep running in tray" from
 * "we are actually shutting down — tear everything down".
 */
let isQuitting = false;

/**
 * Single-instance lock. If we don't get the lock, another copy of the app is
 * already running — surface its window and exit immediately. Without this,
 * launching twice would spawn two Next.js servers fighting over the same DB
 * file.
 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(bootstrap).catch(handleFatal);

  // On macOS the standard pattern is to recreate the window when the dock
  // icon is clicked and there are no other windows open.
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        await createMainWindow(mainWindow?.webContents.getURL() ?? (serverManager.url() ?? DEV_URL));
      } catch (err) {
        handleFatal(err);
      }
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Default Electron behavior quits on window-all-closed (non-mac). We want
  // to keep running in the tray on every platform, so override.
  app.on('window-all-closed', () => {
    // intentionally empty — quit happens via the tray's "Quit" item.
  });

  app.on('before-quit', async (event: ElectronEvent) => {
    if (isQuitting) return;
    isQuitting = true;
    event.preventDefault();
    try {
      destroyTray();
      await serverManager.stop();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[main] error during shutdown:', err);
    } finally {
      app.exit(0);
    }
  });
}

/**
 * Whole startup sequence after `app.whenReady()`. Kept in one function so a
 * failure anywhere bubbles to handleFatal() with a consistent error path.
 */
async function bootstrap(): Promise<void> {
  app.setName('AI FinOps');

  const userData = app.getPath('userData');
  const dbPath = path.join(userData, 'ai-finops.db');

  const encryptionKey = await ensureKey();

  let url: string;
  if (isDev) {
    url = DEV_URL;
    // In dev we still set the env vars on our own process so anyone using
    // this Electron run as a Node interpreter sees them. The actual `next
    // dev` server reads from .env in the project root.
    process.env.FINOPS_ENCRYPTION_KEY = encryptionKey;
    process.env.DATABASE_URL = `file:${dbPath}`;
  } else {
    url = await serverManager.start({
      ...process.env,
      FINOPS_ENCRYPTION_KEY: encryptionKey,
      DATABASE_URL: `file:${dbPath}`,
    });
  }

  await createMainWindow(url);
  createTray({ getWindow: () => mainWindow });
}

async function createMainWindow(url: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'AI FinOps',
    backgroundColor: '#0a0b0e',
    autoHideMenuBar: process.platform !== 'darwin',
    icon: resolveWindowIcon(),
    show: false, // show after first paint to avoid the white flash
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // Hide-to-tray on user close. The "real" quit path runs through
  // before-quit, which sets isQuitting = true first.
  win.on('close', (event: ElectronEvent) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  // Route http/https links in the renderer to the user's default browser
  // rather than navigating away from the Next.js app. Anything else (e.g.
  // about:blank, file://) gets denied.
  win.webContents.setWindowOpenHandler(({ url: target }: { url: string }) => {
    if (/^https?:\/\//i.test(target)) {
      shell.openExternal(target).catch(() => {
        /* ignore */
      });
    }
    return { action: 'deny' as const };
  });

  // Prevent the renderer from navigating away from our app origin. Defense
  // in depth: nodeIntegration is already off and contextIsolation on.
  win.webContents.on('will-navigate', (event: ElectronEvent, target: string) => {
    try {
      const parsed = new URL(target);
      const parsedCurrent = new URL(win.webContents.getURL());
      if (parsed.origin !== parsedCurrent.origin) {
        event.preventDefault();
        shell.openExternal(target).catch(() => {
          /* ignore */
        });
      }
    } catch {
      event.preventDefault();
    }
  });

  await win.loadURL(url);
  mainWindow = win;
  return win;
}

function resolveWindowIcon(): string | undefined {
  // electron-builder embeds the icon in the OS-native install metadata;
  // BrowserWindow's `icon` property only matters on Linux + Windows where
  // there's no .app bundle to read from. We point at the platform-appropriate
  // file under electron/icons/ and let Electron ignore it if missing.
  const base = path.join(__dirname, '..', 'electron', 'icons');
  switch (process.platform) {
    case 'win32':
      return path.join(base, 'icon.ico');
    case 'linux':
      return path.join(base, 'icon.png');
    default:
      return undefined;
  }
}

function handleFatal(err: unknown): void {
  // eslint-disable-next-line no-console
  console.error('[main] fatal error:', err);
  // We can't reliably show a dialog from arbitrary error sites (the app may
  // not be ready), so we log + exit. electron-builder's logging captures
  // stderr to <userData>/logs/ on most platforms.
  if (!isQuitting) {
    isQuitting = true;
    serverManager.stop().finally(() => app.exit(1));
  }
}
