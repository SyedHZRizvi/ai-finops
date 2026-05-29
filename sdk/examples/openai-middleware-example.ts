// Run: npm i openai && tsx sdk/examples/openai-middleware-example.ts
// Requires: OPENAI_API_KEY env var. Optionally FINOPS_BASE_URL / FINOPS_INGEST_TOKEN.
//
// This example shows the drop-in OpenAI SDK middleware. Pass the FinOps
// fetch wrapper to the OpenAI constructor and every chat/completion call —
// streaming or not, anywhere in your app — is logged automatically. No need
// to wrap individual call sites.

import OpenAI from 'openai';
import { FinOpsClient, finopsOpenAIFetch } from '@ai-finops/sdk';

async function main() {
  const finops = new FinOpsClient({
    appName: 'openai-middleware-example',
    fireAndForget: false,
    onError: (err) => console.error('[finops]', err.message),
  });

  // The wrapper has the standard fetch signature, so it slots in via the
  // `fetch` option that openai-node accepts. Every chat completion, completion,
  // and responses-API call through this client lands in FinOps.
  const openai = new OpenAI({
    fetch: finopsOpenAIFetch(finops, {
      appName: 'openai-middleware-example',
      // Tag the provider — useful when pointing at OpenAI-compatible APIs
      // (Groq, Together, Fireworks, vLLM). Default is 'openai'.
      provider: 'openai',
      // Lift the user id off the request body (OpenAI accepts a `user` field).
      resolveUserId: ({ body }) =>
        body && typeof body === 'object' && typeof (body as { user?: unknown }).user === 'string'
          ? (body as { user: string }).user
          : undefined,
      resolveMetadata: () => ({ feature: 'openai-middleware-example' }),
    }),
  });

  // ---- 1. Non-streaming chat completion -------------------------------------

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    user: 'demo-user',
    messages: [
      { role: 'system', content: 'You write tiny haikus.' },
      { role: 'user', content: 'A haiku about caches.' },
    ],
  });
  console.log('chat.completions ->', completion.choices[0]?.message.content);

  // ---- 2. Streaming chat completion -----------------------------------------
  // The middleware tees the SSE stream — your code sees the chunks live, and
  // FinOps gets the accumulated transcript and final token usage on the side.
  // Pass `stream_options: { include_usage: true }` if you want token totals.

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    user: 'demo-user',
    stream: true,
    stream_options: { include_usage: true },
    messages: [{ role: 'user', content: 'Stream-explain consistent hashing.' }],
  });

  process.stdout.write('chat.completions (stream) -> ');
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) process.stdout.write(delta);
  }
  process.stdout.write('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
