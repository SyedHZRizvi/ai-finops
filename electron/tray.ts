/**
 * System tray icon + context menu.
 *
 * We hold a module-level Tray reference because letting it get GC'd will make
 * the icon vanish on Windows/Linux. The Tray is created lazily — call
 * `createTray()` once after `app.whenReady()`.
 */
import {
  Tray,
  Menu,
  BrowserWindow,
  app,
  shell,
  nativeImage,
  type NativeImage,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { serverManager } from './server-manager';

let tray: Tray | null = null;

export interface TrayDeps {
  /** Returns the main BrowserWindow, or null if it's been destroyed. */
  getWindow: () => BrowserWindow | null;
}

export function createTray(deps: TrayDeps): Tray {
  if (tray) return tray;

  const image = loadTrayImage();
  tray = new Tray(image);
  tray.setToolTip('AI FinOps');

  const refreshMenu = () => {
    if (!tray) return;
    const menu = buildMenu(deps);
    tray.setContextMenu(menu);
  };

  refreshMenu();

  // Single-click on Windows/Linux: show the window. macOS users expect to
  // click for the menu so we skip the activation handler there.
  tray.on('click', () => {
    if (process.platform === 'darwin') return;
    const win = deps.getWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  return tray;
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
  tray = null;
}

function buildMenu(deps: TrayDeps): Menu {
  return Menu.buildFromTemplate([
    { label: 'AI FinOps', enabled: false },
    { type: 'separator' },
    {
      label: 'Show Dashboard',
      click: () => {
        const win = deps.getWindow();
        if (!win) return;
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      },
    },
    {
      label: 'Open in Browser',
      click: async () => {
        const url = serverManager.url();
        if (url) {
          await shell.openExternal(url);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit AI FinOps',
      click: () => {
        app.quit();
      },
    },
  ]);
}

/**
 * Picks the tray icon for the current platform and falls back to a 1x1
 * transparent image if the file is missing. We never want a missing icon to
 * crash the app launch — better to ship without a tray icon than to fail to
 * start.
 */
function loadTrayImage(): NativeImage {
  // macOS expects template images (monochrome with alpha) which the OS tints
  // for light/dark menu bar. Windows + Linux take a regular small icon.
  const iconsDir = path.join(__dirname, '..', 'electron', 'icons');
  const candidates: string[] =
    process.platform === 'darwin'
      ? [path.join(iconsDir, 'trayTemplate.png')]
      : [path.join(iconsDir, 'tray.png'), path.join(iconsDir, 'icon.png')];

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const img = nativeImage.createFromPath(file);
        if (!img.isEmpty()) {
          if (process.platform === 'darwin') {
            img.setTemplateImage(true);
          }
          return img;
        }
      }
    } catch {
      // try the next candidate
    }
  }

  // 1x1 transparent PNG — minimal valid native image so Tray construction
  // doesn't throw.
  return nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
      'base64',
    ),
  );
}
