// Run: npm i @anthropic-ai/sdk && tsx sdk/examples/anthropic-example.ts
// Requires: ANTHROPIC_API_KEY env var. Optionally FINOPS_BASE_URL / FINOPS_INGEST_TOKEN.

import Anthropic from '@anthropic-ai/sdk';
import { FinOpsClient, withAnthropicLogging } from '@ai-finops/sdk';

async function main() {
  const anthropic = new Anthropic();
  const finops = new FinOpsClient({
    appName: 'anthropic-example',
    // Block on the ingest call so we can read the result back. In production
    // leave the default (fire-and-forget) so logging stays off the hot path.
    fireAndForget: false,
    onError: (err) => console.error('[finops]', err.message),
  });

  const promptText = 'Summarize the plot of Hamlet in two sentences.';

  const message = await withAnthropicLogging(
    finops,
    {
      model: 'claude-sonnet-4-5',
      promptText,
      userId: 'demo-user',
      metadata: { feature: 'summarizer' },
    },
    () =>
      anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 256,
        messages: [{ role: 'user', content: promptText }],
      }),
  );

  const firstBlock = message.content[0];
  if (firstBlock && firstBlock.type === 'text') {
    console.log('Claude says:', firstBlock.text);
  }

  // Direct call to inspect the FinOps record (this is a *second* log; the
  // wrapper above already submitted one). In real apps you only need the wrapper.
  const result = await finops.log({
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    promptText,
    responseText: firstBlock && firstBlock.type === 'text' ? firstBlock.text : undefined,
  });
  console.log('FinOps record:', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
