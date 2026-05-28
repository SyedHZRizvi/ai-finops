// Run: npm i openai && tsx sdk/examples/openai-example.ts
// Requires: OPENAI_API_KEY env var. Optionally FINOPS_BASE_URL / FINOPS_INGEST_TOKEN.

import OpenAI from 'openai';
import { FinOpsClient, withOpenAILogging } from '@ai-finops/sdk';

async function main() {
  const openai = new OpenAI();
  const finops = new FinOpsClient({
    appName: 'openai-example',
    fireAndForget: false,
    onError: (err) => console.error('[finops]', err.message),
  });

  const promptText = 'Write a haiku about distributed systems.';

  const completion = await withOpenAILogging(
    finops,
    {
      model: 'gpt-4o-mini',
      promptText,
      userId: 'demo-user',
      metadata: { feature: 'haiku-bot' },
    },
    () =>
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: promptText }],
      }),
  );

  console.log('OpenAI says:', completion.choices[0]?.message.content);

  const result = await finops.log({
    model: 'gpt-4o-mini',
    provider: 'openai',
    promptText,
    responseText: completion.choices[0]?.message.content ?? undefined,
  });
  console.log('FinOps record:', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
