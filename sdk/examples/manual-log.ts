// Lowest-level usage — you've already called your LLM and just want to log it.
// Run: tsx sdk/examples/manual-log.ts

import { FinOpsClient } from '@ai-finops/sdk';

async function main() {
  const finops = new FinOpsClient({
    appName: 'manual-log-example',
    fireAndForget: false,
  });

  const start = Date.now();
  const fakeResponseText = 'The capital of France is Paris.';
  const latencyMs = Date.now() - start;

  const result = await finops.log({
    model: 'gpt-4o-mini',
    provider: 'openai',
    userId: 'demo-user',
    promptText: 'What is the capital of France?',
    responseText: fakeResponseText,
    inputTokens: 8,
    outputTokens: 7,
    latencyMs,
    metadata: { source: 'manual-example' },
  });

  console.log('FinOps record:', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
