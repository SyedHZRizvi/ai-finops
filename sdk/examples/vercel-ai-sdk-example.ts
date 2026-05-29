// Run: npm i ai @ai-sdk/openai && tsx sdk/examples/vercel-ai-sdk-example.ts
// Requires: OPENAI_API_KEY env var. Optionally FINOPS_BASE_URL / FINOPS_INGEST_TOKEN.
//
// This example shows the Vercel AI SDK middleware. Wrap a model once with
// `wrapLanguageModel` + `finopsMiddleware`, then every generateText, streamText,
// generateObject, or streamObject call against that wrapped model flows
// through FinOps automatically.

import { generateText, streamText, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { FinOpsClient, finopsMiddleware } from '@ai-finops/sdk';

async function main() {
  const finops = new FinOpsClient({
    appName: 'vercel-ai-example',
    fireAndForget: false,
    onError: (err) => console.error('[finops]', err.message),
  });

  // Build a logged version of the model. Use this everywhere instead of the
  // raw model and every call is automatically instrumented.
  const model = wrapLanguageModel({
    model: openai('gpt-4o-mini'),
    middleware: finopsMiddleware(finops, {
      appName: 'vercel-ai-example',
      // Optional: lift a user id off the request. Useful when the caller
      // sets `providerOptions.openai.user` or stuffs it in headers.
      resolveUserId: (params) => {
        const headerUser = params.headers?.['x-user-id'];
        return typeof headerUser === 'string' ? headerUser : undefined;
      },
      resolveMetadata: () => ({ feature: 'vercel-ai-example' }),
    }),
  });

  // ---- 1. Non-streaming generateText ----------------------------------------

  const { text } = await generateText({
    model,
    prompt: 'Write a haiku about distributed systems.',
    headers: { 'x-user-id': 'demo-user' },
  });
  console.log('generateText ->', text);

  // ---- 2. Streaming streamText ----------------------------------------------
  // The middleware tees the stream — the user-visible chunks are unchanged,
  // and on the side we accumulate the full text + final usage and ship a
  // single FinOps log after the stream finishes.

  const stream = await streamText({
    model,
    prompt: 'Stream-explain Paxos in one paragraph.',
    headers: { 'x-user-id': 'demo-user' },
  });

  process.stdout.write('streamText -> ');
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  process.stdout.write('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
