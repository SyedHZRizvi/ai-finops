/**
 * Spawns and supervises the embedded Next.js standalone server.
 *
 * In production we ship the output of `next build` (with
 * `output: 'standalone'`) as an extraResources blob. This module forks a child
 * Node process running `server.js` on a random free localhost port, waits for
 * it to accept HTTP, and exposes the resolved URL to the rest of the main
 * process.
 *
 * In dev we don't use this — the main process points BrowserWindow at
 * `npm run dev` running on :3000 instead.
 */
import { spawn, ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const READY_TIMEOUT_MS = 20_000;
const READY_POLL_INTERVAL_MS = 250;

class ServerManager {
  private proc: ChildProcess | null = null;
  private port: number | null = null;

  /**
   * Boots the Next.js standalone server. Resolves with its base URL once the
   * server responds to an HTTP request. Throws on timeout or crash during
   * startup.
   *
   * @param env  env vars to forward to the child (DATABASE_URL,
   *             FINOPS_ENCRYPTION_KEY, anything else the Next app needs).
   *             PORT/HOSTNAME/NODE_ENV are overridden here.
   */
  async start(env: NodeJS.ProcessEnv): Promise<string> {
    if (this.proc) {
      throw new Error('[server-manager] already started');
    }

    this.port = await pickFreePort();

    const { standaloneDir, entry } = resolveStandalonePaths();
    if (!fs.existsSync(entry)) {
      throw new Error(
        `[server-manager] Next.js standalone server.js not found at ${entry}. ` +
          `Did you run \`npm run build\` with \`output: 'standalone'\` in next.config.mjs?`,
      );
    }

    // ELECTRON_RUN_AS_NODE makes the Electron binary behave as a plain Node
    // interpreter. We use process.execPath (the bundled Electron binary) so
    // packaged installs don't depend on the user having Node installed.
    const childEnv: NodeJS.ProcessEnv = {
      ...env,
      PORT: String(this.port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1',
    };

    this.proc = spawn(process.execPath, [entry], {
      env: childEnv,
      cwd: standaloneDir,
      stdio: 'pipe',
    });

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      // eslint-disable-next-line no-console
      console.log('[next]', chunk.toString().trimEnd());
    });
    this.proc.stderr?.on('data', (chunk: Buffer) => {
      // eslint-disable-next-line no-console
      console.error('[next]', chunk.toString().trimEnd());
    });

    this.proc.on('exit', (code, signal) => {
      // eslint-disable-next-line no-console
      console.error(`[next] process exited code=${code} signal=${signal}`);
      this.proc = null;
    });

    const url = `http://127.0.0.1:${this.port}`;
    await waitForHttp(url, READY_TIMEOUT_MS);
    return url;
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    this.port = null;
    return new Promise<void>((resolve) => {
      // Give the child a chance to flush. If it doesn't exit cleanly within
      // 2s, escalate to SIGKILL. We never want quit to hang on a wedged Next
      // process.
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      proc.once('exit', done);
      try {
        proc.kill('SIGTERM');
      } catch {
        // already dead
        done();
        return;
      }
      setTimeout(() => {
        if (!resolved) {
          try {
            proc.kill('SIGKILL');
          } catch {
            /* ignore */
          }
          done();
        }
      }, 2_000);
    });
  }

  url(): string | null {
    return this.port ? `http://127.0.0.1:${this.port}` : null;
  }
}

/**
 * In packaged builds, electron-builder places the Next.js standalone tree at
 * `<resources>/app/.next/standalone/`. In an unpackaged dev/test run we look
 * relative to `app.getAppPath()` instead.
 */
function resolveStandalonePaths(): { standaloneDir: string; entry: string } {
  const standaloneDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app', '.next', 'standalone')
    : path.join(app.getAppPath(), '.next', 'standalone');
  const entry = path.join(standaloneDir, 'server.js');
  return { standaloneDir, entry };
}

/**
 * Asks the OS for an unused TCP port by binding to port 0, reading back the
 * assigned port, then releasing the socket. There is an inherent TOCTOU window
 * here — but on a single-user desktop it's vanishingly unlikely something
 * grabs the port between the close() and the Next.js bind().
 */
function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        srv.close();
        reject(new Error('[server-manager] could not determine free port'));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Polls the URL until it returns any HTTP response (we don't require 2xx —
 * a 404 still means the server is up). Times out with a clear error message
 * after `timeoutMs`.
 */
async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  let lastErr: Error | null = null;
  while (Date.now() - started < timeoutMs) {
    try {
      // Node 18+ has global fetch. AbortController for per-attempt timeout so
      // we don't accumulate slow attempts against the overall budget.
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 1_500);
      try {
        const res = await fetch(url, { signal: controller.signal });
        // Any HTTP response = server is alive and routing.
        if (res.status > 0) {
          return;
        }
      } finally {
        clearTimeout(t);
      }
    } catch (err) {
      lastErr = err as Error;
    }
    await sleep(READY_POLL_INTERVAL_MS);
  }
  throw new Error(
    `[server-manager] timed out after ${timeoutMs}ms waiting for ${url}` +
      (lastErr ? ` (last error: ${lastErr.message})` : ''),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const serverManager = new ServerManager();
