import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRICING: Array<{
  model: string;
  provider: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  contextWindow: number;
}> = [
  { model: 'gpt-4o', provider: 'openai', inputCostPer1M: 2.5, outputCostPer1M: 10.0, contextWindow: 128000 },
  { model: 'gpt-4o-mini', provider: 'openai', inputCostPer1M: 0.15, outputCostPer1M: 0.6, contextWindow: 128000 },
  { model: 'gpt-4-turbo', provider: 'openai', inputCostPer1M: 10.0, outputCostPer1M: 30.0, contextWindow: 128000 },
  { model: 'gpt-3.5-turbo', provider: 'openai', inputCostPer1M: 0.5, outputCostPer1M: 1.5, contextWindow: 16385 },
  { model: 'claude-3-5-sonnet-20241022', provider: 'anthropic', inputCostPer1M: 3.0, outputCostPer1M: 15.0, contextWindow: 200000 },
  { model: 'claude-3-5-haiku-20241022', provider: 'anthropic', inputCostPer1M: 0.8, outputCostPer1M: 4.0, contextWindow: 200000 },
  { model: 'claude-3-opus-20240229', provider: 'anthropic', inputCostPer1M: 15.0, outputCostPer1M: 75.0, contextWindow: 200000 },
  { model: 'gemini-1.5-pro', provider: 'google', inputCostPer1M: 1.25, outputCostPer1M: 5.0, contextWindow: 2000000 },
  { model: 'gemini-1.5-flash', provider: 'google', inputCostPer1M: 0.075, outputCostPer1M: 0.3, contextWindow: 1000000 },
];

type Category =
  | 'factual'
  | 'reasoning'
  | 'creative'
  | 'code'
  | 'analytical'
  | 'conversational'
  | 'instructional'
  | 'other';

type Complexity = 'simple' | 'moderate' | 'complex' | 'multidimensional';

interface DemoPrompt {
  promptText: string;
  responseText: string;
  category: Category;
  complexity: Complexity;
  complexityScore: number;
  dimensions: string[];
  hasCode: boolean;
  hasMultipleQuestions: boolean;
  hasRedundancy: boolean;
}

const DEMO_PROMPTS: DemoPrompt[] = [
  {
    promptText: 'What is the capital of France?',
    responseText: 'The capital of France is Paris.',
    category: 'factual',
    complexity: 'simple',
    complexityScore: 8,
    dimensions: ['geography'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText:
      'Write a Python function that takes a list of integers and returns the second largest. Handle duplicates correctly and edge cases like empty lists or lists with only one unique value.',
    responseText:
      'def second_largest(nums):\n    if len(set(nums)) < 2:\n        return None\n    return sorted(set(nums))[-2]',
    category: 'code',
    complexity: 'moderate',
    complexityScore: 45,
    dimensions: ['algorithm', 'edge-cases'],
    hasCode: true,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText:
      'Please please please write me a really really good short story about a robot who learns to feel emotions. Make it touching and very very emotional and please make sure it has a happy ending please.',
    responseText:
      'Unit 7 had calculated the trajectory of three hundred million falling raindrops. Today, for the first time, it noticed they were beautiful...',
    category: 'creative',
    complexity: 'moderate',
    complexityScore: 38,
    dimensions: ['narrative', 'character'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: true,
  },
  {
    promptText:
      'Analyze the macroeconomic impact of rising interest rates on emerging markets, considering capital flows, currency volatility, debt sustainability, and trade balances. Also compare the 2013 taper tantrum to the 2022-2023 hiking cycle.',
    responseText:
      'Rising rates in the US drive capital out of EMs through three mechanisms... The 2013 episode differed in that...',
    category: 'analytical',
    complexity: 'multidimensional',
    complexityScore: 88,
    dimensions: ['capital-flows', 'currency', 'debt', 'trade', 'historical-comparison'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText: 'Hi! How are you today?',
    responseText: "I'm doing well, thanks for asking! How can I help you?",
    category: 'conversational',
    complexity: 'simple',
    complexityScore: 5,
    dimensions: ['greeting'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText:
      'Step by step, explain how the gradient descent algorithm works, including the math behind backpropagation in a neural network with at least two hidden layers.',
    responseText:
      'Gradient descent minimizes a loss function by iteratively updating parameters in the opposite direction of the gradient...',
    category: 'reasoning',
    complexity: 'complex',
    complexityScore: 72,
    dimensions: ['math', 'algorithm', 'neural-networks'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText:
      'Here is a long document I pasted from my notes app, including everything I wrote yesterday: [imagine 4000 tokens of notes here, much of it irrelevant]. Now summarize what I should focus on this week.',
    responseText: 'Based on your notes, your top three priorities this week are...',
    category: 'instructional',
    complexity: 'moderate',
    complexityScore: 50,
    dimensions: ['summarization', 'prioritization'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: true,
  },
  {
    promptText: 'What does HTTP stand for?',
    responseText: 'HTTP stands for HyperText Transfer Protocol.',
    category: 'factual',
    complexity: 'simple',
    complexityScore: 4,
    dimensions: ['acronym'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText:
      'Debug this SQL query: SELECT u.id, u.name, COUNT(o.id) FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.created_at > NOW() - INTERVAL 30 DAY. Why does it exclude users with no orders?',
    responseText:
      'The WHERE clause filters out NULL o.created_at values from the LEFT JOIN. Move the date condition into the ON clause instead.',
    category: 'code',
    complexity: 'moderate',
    complexityScore: 42,
    dimensions: ['sql', 'debugging'],
    hasCode: true,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText:
      'I need you to do three things: (1) draft a launch email for our new product, (2) write three tweet variants promoting it, and (3) suggest five blog post titles. The product is an AI-powered note-taking app for researchers.',
    responseText: '1) Email: Subject: Research, Reimagined...\n2) Tweets:...\n3) Blog titles:...',
    category: 'creative',
    complexity: 'complex',
    complexityScore: 65,
    dimensions: ['email', 'social', 'titles'],
    hasCode: false,
    hasMultipleQuestions: true,
    hasRedundancy: false,
  },
  {
    promptText: 'Translate "good morning" to Japanese.',
    responseText: 'おはようございます (ohayou gozaimasu).',
    category: 'factual',
    complexity: 'simple',
    complexityScore: 6,
    dimensions: ['translation'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText:
      'Compare React Server Components vs traditional client-side React. Discuss bundle size, streaming, data fetching, and developer experience. Include code examples.',
    responseText:
      'RSC moves rendering to the server, reducing client bundle. Example: ```jsx\nasync function Page() {...}\n```',
    category: 'analytical',
    complexity: 'complex',
    complexityScore: 68,
    dimensions: ['react', 'performance', 'dx', 'comparison'],
    hasCode: true,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText: 'Thanks!',
    responseText: "You're welcome!",
    category: 'conversational',
    complexity: 'simple',
    complexityScore: 2,
    dimensions: ['acknowledgment'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText:
      'Write a comprehensive marketing plan for a B2B SaaS startup targeting mid-market companies in the manufacturing sector. Include positioning, ICP definition, channel strategy, content calendar for Q1, pricing tiers, and a competitive analysis vs the top 3 incumbents.',
    responseText: 'Marketing Plan — Manufacturing SaaS Launch\n\n1. Positioning...\n2. ICP...',
    category: 'instructional',
    complexity: 'multidimensional',
    complexityScore: 92,
    dimensions: ['positioning', 'icp', 'channels', 'content', 'pricing', 'competition'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText: 'Is the earth round?',
    responseText: 'Yes, the Earth is approximately spherical (an oblate spheroid).',
    category: 'factual',
    complexity: 'simple',
    complexityScore: 3,
    dimensions: ['science'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText:
      'Refactor this code to be more readable: function f(x){let y=0;for(let i=0;i<x.length;i++){if(x[i]%2===0){y+=x[i];}}return y;}',
    responseText:
      'function sumEvens(numbers) {\n  return numbers.filter(n => n % 2 === 0).reduce((sum, n) => sum + n, 0);\n}',
    category: 'code',
    complexity: 'simple',
    complexityScore: 22,
    dimensions: ['refactoring'],
    hasCode: true,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText:
      'For example, if I have a customer who churned after 6 months, like Acme Corp did last quarter — for example you could look at signals like decreased login frequency, support tickets, or NPS dips. For example, here is what we saw with Beta Inc: [data]. For example with Gamma LLC: [data]. Based on these examples, what are the leading indicators of churn?',
    responseText: 'The strongest leading indicators across your examples are: (1) login frequency dropping...',
    category: 'analytical',
    complexity: 'moderate',
    complexityScore: 48,
    dimensions: ['churn-analysis', 'indicators'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: true,
  },
  {
    promptText: 'Write a haiku about debugging.',
    responseText: 'Late night, broken build\nOne semicolon missing\nCoffee cup empty',
    category: 'creative',
    complexity: 'simple',
    complexityScore: 12,
    dimensions: ['poetry'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText:
      'Explain why my React component re-renders when its parent re-renders, even though I memoized it with React.memo. Here is the code: const Child = React.memo(({ user }) => { ... }); and parent passes user={{ name: "x" }}.',
    responseText:
      'You are creating a new object literal on every parent render. React.memo uses shallow equality...',
    category: 'reasoning',
    complexity: 'moderate',
    complexityScore: 44,
    dimensions: ['react', 'memoization', 'debugging'],
    hasCode: true,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
  {
    promptText: 'List 5 productivity tips.',
    responseText: '1. Time-block...\n2. Two-minute rule...\n3. Single-task...\n4. Inbox zero...\n5. Sleep.',
    category: 'instructional',
    complexity: 'simple',
    complexityScore: 15,
    dimensions: ['productivity'],
    hasCode: false,
    hasMultipleQuestions: false,
    hasRedundancy: false,
  },
];

function estimateTokens(text: string): number {
  // Rough estimate to avoid pulling in the tokenizer here: ~4 chars per token.
  return Math.max(1, Math.ceil(text.length / 4));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

async function main() {
  for (const p of PRICING) {
    await prisma.modelPricingConfig.upsert({
      where: { model: p.model },
      update: {
        provider: p.provider,
        inputCostPer1M: p.inputCostPer1M,
        outputCostPer1M: p.outputCostPer1M,
        contextWindow: p.contextWindow,
        isActive: true,
      },
      create: {
        model: p.model,
        provider: p.provider,
        inputCostPer1M: p.inputCostPer1M,
        outputCostPer1M: p.outputCostPer1M,
        contextWindow: p.contextWindow,
        isActive: true,
      },
    });
  }

  const existingLogCount = await prisma.promptLog.count();
  if (existingLogCount > 0) {
    console.log(`Skipping PromptLog seed — ${existingLogCount} rows already present.`);
    console.log('Seed complete.');
    return;
  }

  const apps = ['chatbot-prod', 'internal-tools', 'support-ai', 'research-assistant', null];
  const users = ['user_001', 'user_002', 'user_003', 'user_004', null];

  const rows = 42;
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < rows; i++) {
    const demo = pick(DEMO_PROMPTS);
    const pricing = pick(PRICING);
    const ts = new Date(now - Math.random() * sevenDaysMs);

    const inputTokens = estimateTokens(demo.promptText) + Math.floor(randomInRange(0, 30));
    const outputTokens = estimateTokens(demo.responseText) + Math.floor(randomInRange(0, 50));
    const totalTokens = inputTokens + outputTokens;

    const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1M;
    const totalCost = inputCost + outputCost;

    let potentialSavedTokens = 0;
    if (demo.hasRedundancy) potentialSavedTokens += Math.floor(inputTokens * 0.25);
    if (demo.complexity === 'multidimensional') potentialSavedTokens += Math.floor(inputTokens * 0.15);
    if (inputTokens > 200) potentialSavedTokens += Math.floor(inputTokens * 0.1);
    const potentialSavedCost = (potentialSavedTokens / 1_000_000) * pricing.inputCostPer1M;

    const characteristics = {
      wordCount: demo.promptText.split(/\s+/).length,
      sentenceCount: Math.max(1, demo.promptText.split(/[.!?]+/).filter(Boolean).length),
      questionCount: (demo.promptText.match(/\?/g) ?? []).length,
      hasCode: demo.hasCode,
      hasMultipleQuestions: demo.hasMultipleQuestions,
      hasContextDump: demo.promptText.length > 500,
      hasRedundancy: demo.hasRedundancy,
      hasExamples: /for example/i.test(demo.promptText),
      imperativeVerbs: (demo.promptText.match(/\b(write|create|make|build|generate|explain|analyze|compare)\b/gi) ?? []).length,
    };

    await prisma.promptLog.create({
      data: {
        timestamp: ts,
        appName: pick(apps),
        userId: pick(users),
        model: pricing.model,
        provider: pricing.provider,
        promptText: demo.promptText,
        responseText: demo.responseText,
        inputTokens,
        outputTokens,
        totalTokens,
        inputCost,
        outputCost,
        totalCost,
        category: demo.category,
        complexity: demo.complexity,
        complexityScore: demo.complexityScore,
        dimensions: JSON.stringify(demo.dimensions),
        characteristics: JSON.stringify(characteristics),
        latencyMs: Math.floor(randomInRange(200, 4500)),
        metadata: null,
        potentialSavedTokens,
        potentialSavedCost,
      },
    });
  }

  console.log(`Seeded ${PRICING.length} pricing rows and ${rows} prompt logs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
