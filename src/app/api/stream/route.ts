// Server-Sent Events endpoint. Streams every FinOpsEvent emitted on the
// in-process eventBus to every connected client.
//
// Wire format:
//
//   event: connected
//   data: {"type":"connected","timestamp":1700000000000}
//
//   event: prompt-logged
//   data: {"kind":"prompt-logged","timestamp":1700000000123,"data":{...}}
//
//   : ping        <-- heartbeat comment, every 25s
//
// Why not Edge runtime: subscribe()/emit() lean on Node's module-scope Set,
// which works in the standard Node runtime. The Edge runtime *would* also
// provide a long-lived ReadableStream, but each Edge isolate has its own
// module graph — emit() from a Node route (like /api/log) would never reach
// an Edge subscriber. Pinning everything to Node keeps the bus coherent.
//
// Heartbeat: we send a `: ping` SSE comment every 25s. Two reasons:
//   1. Vercel's default function timeout is 30s, but a function that's
//      actively writing bytes won't be killed mid-write. The heartbeat
//      keeps the response stream warm.
//   2. Intermediate proxies (browser, CDN, corporate gateway) may sever
//      idle connections after 30-60s. A regular write resets that timer.

import type { NextRequest } from 'next/server';
import { subscribe, type FinOpsEvent } from '@/lib/eventBus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 25_000;

// SSE wire-format helpers. Each frame ends with a blank line, per spec.
function sseEvent(name: string, data: string): string {
  // data may be multi-line JSON; split on '\n' and prefix each with 'data: '
  // to remain spec-compliant. We control the JSON so this is defensive only.
  const lines = data.split('\n').map((l) => `data: ${l}`).join('\n');
  return `event: ${name}\n${lines}\n\n`;
}

function sseComment(text: string): string {
  return `: ${text}\n\n`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();

  // Track teardown state across handler closures. Both client disconnect and
  // controller errors must converge on a single cleanup path.
  let isClosed = false;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function safeEnqueue(chunk: string): void {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller closed underneath us (client gone). Trigger teardown.
          cleanup();
        }
      }

      function cleanup(): void {
        if (isClosed) return;
        isClosed = true;
        if (heartbeat !== null) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (unsubscribe !== null) {
          unsubscribe();
          unsubscribe = null;
        }
        try {
          controller.close();
        } catch {
          // Already closed — that's fine.
        }
      }

      // 1. Initial handshake. The client uses this to flip its UI from
      //    "connecting" to "live".
      const helloPayload = JSON.stringify({
        type: 'connected',
        timestamp: Date.now(),
      });
      safeEnqueue(sseEvent('connected', helloPayload));

      // 2. Subscribe to the bus. Every emit() lands here.
      unsubscribe = subscribe((event: FinOpsEvent) => {
        // Use the event kind as the SSE event name so EventSource consumers
        // can attach typed listeners (addEventListener('prompt-logged', ...))
        // if they want. The default 'message' listener also works because
        // we always include the full FinOpsEvent in data.
        try {
          const data = JSON.stringify(event);
          safeEnqueue(sseEvent(event.kind, data));
        } catch (err) {
          // A payload that can't be serialized shouldn't kill the stream.
          // eslint-disable-next-line no-console
          console.warn('[stream] failed to serialize event:', err);
        }
      });

      // 3. Heartbeat. SSE comments are ignored by EventSource but keep the
      //    HTTP response alive past proxy idle timeouts.
      heartbeat = setInterval(() => {
        safeEnqueue(sseComment('ping'));
      }, HEARTBEAT_MS);

      // 4. Client disconnect — Next.js exposes this via the request signal.
      //    On disconnect we tear down the subscription and the heartbeat
      //    so the bus doesn't leak handlers.
      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      // Reader cancelled. Tear down through the same path. Guarded by the
      // isClosed flag so duplicate teardown is a no-op.
      isClosed = true;
      if (heartbeat !== null) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (unsubscribe !== null) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      // Disable Nginx proxy buffering — without this, intermediate buffers
      // can hold writes for seconds, defeating the "real time" point.
      'X-Accel-Buffering': 'no',
    },
  });
}
