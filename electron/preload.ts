/**
 * Preload script: runs in an isolated world before the renderer page loads.
 * Bridges a tiny, read-only "I'm running inside the desktop shell" hint to
 * the Next.js UI via contextBridge. Keep this surface intentionally small —
 * the renderer is untrusted territory.
 */
import { contextBridge } from 'electron';

type AiFinOpsBridge = {
  readonly isDesktop: true;
  readonly version: string;
  readonly platform: NodeJS.Platform;
};

const bridge: AiFinOpsBridge = {
  isDesktop: true,
  version: process.env.npm_package_version ?? '0.1.0',
  platform: process.platform,
};

try {
  contextBridge.exposeInMainWorld('aiFinops', bridge);
} catch (err) {
  // contextBridge throws if contextIsolation is disabled. We never disable it,
  // but we still guard so a misconfigured packaged build doesn't crash the
  // renderer on load.
  // eslint-disable-next-line no-console
  console.error('[preload] failed to expose aiFinops bridge:', err);
}
