// Run: npm i @langchain/openai @langchain/core && tsx sdk/examples/langchain-example.ts
// Requires: OPENAI_API_KEY env var. Optionally FINOPS_BASE_URL / FINOPS_INGEST_TOKEN.
//
// This example shows the LangChain callback handler. Attach it once at the
// model (or runnable) level and every `.invoke`, `.batch`, or `.stream` call
// in that subtree is logged to FinOps.

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { FinOpsClient, FinOpsLangChainHandler } from '@ai-finops/sdk';

async function main() {
  const finops = new FinOpsClient({
    appName: 'langchain-example',
    // Block in the example so we can console.log the result. In production
    // leave the default (fire-and-forget) so logging stays off the hot path.
    fireAndForget: false,
    onError: (err) => console.error('[finops]', err.message),
  });

  // One handler can be reused across many models / chains.
  const handler = new FinOpsLangChainHandler(finops, {
    appName: 'langchain-example',
    resolveUserId: ({ metadata }) =>
      typeof metadata?.userId === 'string' ? metadata.userId : undefined,
  });

  // ---- 1. Attach the handler at the model level ------------------------------

  const model = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
    // The handler satisfies LangChain's BaseCallbackHandler structurally — no
    // import of LangChain on our side, no import of `@ai-finops/sdk` types on
    // LangChain's side.
    callbacks: [handler],
  });

  const direct = await model.invoke('Write a haiku about distributed systems.');
  console.log('Direct call ->', direct.content);

  // ---- 2. Same handler used inside a LCEL chain ------------------------------

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a concise summarizer. Two sentences max.'],
    ['user', '{input}'],
  ]);

  const chain = prompt.pipe(model).pipe(new StringOutputParser());

  // Per-invocation callbacks merge with the model's callbacks, so the handler
  // fires once per LLM call regardless of where it lives in the chain.
  const summary = await chain.invoke(
    { input: 'Explain Raft consensus to a tired engineer.' },
    { metadata: { userId: 'demo-user', feature: 'summarizer' } },
  );
  console.log('Chain output ->', summary);

  // Optional: tear down. Not required — the client doesn't hold open sockets.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
