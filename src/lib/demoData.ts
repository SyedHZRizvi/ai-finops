// Demo data generator (AI FinOps).
//
// Produces synthetic-but-realistic PromptLog rows for evaluators who want a
// populated dashboard before any real provider data flows in. Rows are tagged
// `source:'demo'` in their JSON metadata so /api/demo can find and remove them
// without touching real ingest.
//
// The generator runs prompts through the real categorizer + optimizer so the
// resulting category / complexity / dimensions / savings columns mirror what
// production data looks like. Costs are recomputed from the in-memory pricing
// table — they line up exactly with how /api/log would have stored them.
//
// "Intentional bad patterns" are sprinkled in:
//   - repeated near-identical prompts → redundancy / caching insights fire
//   - simple prompts on expensive models → model-mismatch insights fire
//   - bloated outputs (output:input >> 1) → cap-output suggestions fire
//   - multidimensional prompts → split-suggestions fire
//
// Targeted total bill: roughly $80-$200/month at the default 300 rows over 30
// days. Tuned by the input/output token bands per template + model mix below.

import { analyzePrompt } from './categorizer';
import { optimizePrompt } from './optimizer';
import { calculateCost, getPricing } from './pricing';
import { countTokens } from './tokenizer';
import type { Category, Complexity, PromptCharacteristics } from './types';

export interface DemoSeedOptions {
  count?: number;
  daysBack?: number;
  includeMultidim?: boolean;
}

export interface DemoPromptRow {
  timestamp: Date;
  appName: string | null;
  userId: string | null;
  model: string;
  provider: string | null;
  promptText: string;
  responseText: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  category: Category;
  complexity: Complexity;
  complexityScore: number;
  dimensions: string;
  characteristics: string;
  latencyMs: number;
  metadata: string;
  potentialSavedTokens: number;
  potentialSavedCost: number;
  tags: string;
}

// --- prompt template bank -------------------------------------------------
//
// Each template carries an output template too so we generate realistic
// response text (used for output-token estimation and downstream tokenization).
// The categorizer sorts each prompt at runtime — these are just buckets.

interface PromptTemplate {
  prompt: string;
  response: string;
  outputBloat?: boolean; // when true, response is intentionally bloated
}

const FACTUAL: PromptTemplate[] = [
  { prompt: 'What is the capital of France?', response: 'The capital of France is Paris.' },
  { prompt: 'What does HTTP stand for?', response: 'HTTP stands for HyperText Transfer Protocol.' },
  { prompt: 'When was the Linux kernel first released?', response: 'The Linux kernel was first released by Linus Torvalds on September 17, 1991.' },
  { prompt: 'What is the chemical symbol for gold?', response: 'The chemical symbol for gold is Au, from the Latin "aurum".' },
  { prompt: 'Who wrote "Pride and Prejudice"?', response: 'Jane Austen wrote "Pride and Prejudice" in 1813.' },
  { prompt: 'What is the speed of light?', response: 'The speed of light in a vacuum is approximately 299,792,458 meters per second.' },
  { prompt: 'Translate "good morning" to Japanese.', response: 'おはようございます (ohayou gozaimasu).' },
  { prompt: 'What year did World War II end?', response: 'World War II ended in 1945, with the formal surrender of Japan on September 2.' },
  { prompt: 'What is the population of Tokyo?', response: 'Tokyo has a population of approximately 14 million people in the city proper.' },
  { prompt: 'Is the earth round?', response: 'Yes, Earth is approximately spherical (technically an oblate spheroid).' },
];

const REASONING: PromptTemplate[] = [
  {
    prompt:
      'Explain why my React component re-renders when its parent re-renders, even though I memoized it with React.memo. The parent passes `user={{ name: "x" }}` and the child is `const Child = React.memo(({ user }) => { ... })`.',
    response:
      'You are creating a new object literal `{ name: "x" }` on every parent render. React.memo uses shallow equality, so the reference change defeats the memoization. Pass a stable reference: either hoist the object out of render, useMemo it, or compare with a custom equality function.',
  },
  {
    prompt:
      'Why does TCP need a three-way handshake instead of a two-way exchange? Walk me through what each step accomplishes.',
    response:
      'Two-way is insufficient because both sides must independently confirm sequence numbers before sending data. Step 1 (SYN): client picks an initial sequence number x. Step 2 (SYN-ACK): server acknowledges x and picks its own y. Step 3 (ACK): client acknowledges y. Now both directions have validated send/receive state, so neither side will accept stale or replayed packets.',
  },
  {
    prompt:
      'Why does prompt caching reduce cost more for long system prompts than for short user messages? Explain step by step.',
    response:
      'Cache hits charge a fraction of the standard input rate (≈10% on Anthropic). A long system prompt is the same on every request, so the cache key matches and savings scale with its length. User messages change request-to-request so they rarely hit the cache. The break-even is roughly: cost saved per hit × hit rate > cache-write surcharge on first miss.',
  },
  {
    prompt:
      'Explain the reasoning behind eventual consistency in distributed databases. Why is it not the same as "the database is buggy"?',
    response:
      'Eventual consistency is a deliberate trade — availability and partition tolerance over instant linearizability (CAP theorem). A write propagates asynchronously; readers on different replicas may see different snapshots for a bounded window. It is not a bug because it is documented behavior with explicit conflict-resolution rules. Strong consistency would require coordination on every write, costing latency and availability during partitions.',
  },
  {
    prompt: 'Why does sorting an already-sorted array still take O(n log n) for merge sort? Derive the recurrence.',
    response:
      'Merge sort always splits to a single element regardless of input order, so the recursion tree has depth log n. T(n) = 2 T(n/2) + O(n). By the master theorem this resolves to O(n log n) for every input, including sorted ones. Insertion sort, by contrast, drops to O(n) on sorted input because its inner loop short-circuits.',
  },
];

const CREATIVE: PromptTemplate[] = [
  {
    prompt:
      'Write a short story about a robot who learns to feel emotions for the first time. Keep it under 300 words with a hopeful ending.',
    response:
      'Unit 7 had calculated the trajectory of three hundred million falling raindrops. Today, for the first time, it noticed they were beautiful. The data did not change. Only Unit 7 did. It stood in the rain for hours, learning a word it had never needed: wonder.',
  },
  {
    prompt: 'Write a haiku about debugging code at 2am.',
    response: 'Late night, broken build\nOne semicolon missing\nCoffee cup empty',
  },
  {
    prompt: 'Compose a tagline for a new productivity app aimed at developers.',
    response: 'Stop tab-switching. Start shipping.',
  },
  {
    prompt: 'Draft a witty out-of-office reply for someone on a two-week sabbatical.',
    response:
      'Out of office until the 28th. I am off learning to surf. If you replied to this before then, the wave was bigger than the email. Try Sara on the team for anything urgent.',
  },
  {
    prompt: 'Write a poem about open-source maintainers in fewer than 100 words.',
    response: 'They patch in silence,\nthrough thousand-issue nights,\nasking for nothing\nbut a star, sometimes a thanks.',
  },
];

const CODE: PromptTemplate[] = [
  {
    prompt:
      'Write a Python function that takes a list of integers and returns the second largest. Handle duplicates and empty lists.',
    response:
      'def second_largest(nums):\n    if len(set(nums)) < 2:\n        return None\n    return sorted(set(nums))[-2]',
  },
  {
    prompt:
      'Debug this SQL query: SELECT u.id, u.name, COUNT(o.id) FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.created_at > NOW() - INTERVAL 30 DAY. Why does it drop users with no orders?',
    response:
      'The WHERE clause filters on o.created_at, which is NULL for users without matching orders, eliminating them. Move the date filter into the ON clause: LEFT JOIN orders o ON u.id = o.user_id AND o.created_at > NOW() - INTERVAL 30 DAY.',
  },
  {
    prompt:
      'Refactor this function to be more readable: function f(x){let y=0;for(let i=0;i<x.length;i++){if(x[i]%2===0){y+=x[i];}}return y;}',
    response:
      'function sumEvens(numbers) {\n  return numbers.filter(n => n % 2 === 0).reduce((sum, n) => sum + n, 0);\n}',
  },
  {
    prompt:
      'Implement a TypeScript debounce function with proper generic typing. Should support cancellation.',
    response:
      "export function debounce<T extends (...a: unknown[]) => unknown>(fn: T, ms: number) {\n  let t: ReturnType<typeof setTimeout> | null = null;\n  const debounced = (...args: Parameters<T>) => {\n    if (t) clearTimeout(t);\n    t = setTimeout(() => fn(...args), ms);\n  };\n  debounced.cancel = () => { if (t) clearTimeout(t); t = null; };\n  return debounced;\n}",
  },
  {
    prompt:
      'Write a Go function that reads a CSV file and returns a slice of structs. Use the encoding/csv package.',
    response:
      'func ReadRows(path string) ([]Row, error) {\n    f, err := os.Open(path)\n    if err != nil { return nil, err }\n    defer f.Close()\n    r := csv.NewReader(f)\n    records, err := r.ReadAll()\n    if err != nil { return nil, err }\n    out := make([]Row, 0, len(records))\n    for _, rec := range records[1:] {\n        out = append(out, Row{Name: rec[0], Value: rec[1]})\n    }\n    return out, nil\n}',
  },
  {
    prompt: 'Write a regex in JavaScript that matches valid email addresses for a signup form.',
    response: "const RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;",
  },
];

const ANALYTICAL: PromptTemplate[] = [
  {
    prompt:
      'Compare React Server Components and traditional client-side React. Discuss bundle size, streaming, data fetching, and developer experience.',
    response:
      'RSC moves rendering to the server, shrinking the client bundle by leaving non-interactive components off the wire. Streaming lets the server flush HTML as data resolves, improving TTFB. Data fetching can happen colocated with the component (no client useEffect). DX cost: a new "use client" boundary model, and harder mental separation between server-only and shared code.',
  },
  {
    prompt:
      'Analyze why our churn rate jumped from 2% to 4% in Q2. Consider product changes, pricing, market conditions, and onboarding.',
    response:
      'Three signals correlate with the jump: (1) the May pricing change moved a popular tier from $19 to $29; cohort drop-off centers on month 2 of that tier. (2) onboarding emails switched providers in April and open rates fell 18%. (3) competitor X launched a free plan in early Q2. Confidence: high on (1) given exact cohort timing, medium on others.',
  },
  {
    prompt: 'Compare Redis vs Memcached for a session-store use case at 10M DAU. Cost, ops, and feature differences.',
    response:
      'Redis wins for: persistence (AOF/RDB), data structures (hashes for partial-update of session blobs), and cluster topology. Memcached wins for: pure throughput at uniform key/value, no persistence overhead, and lower memory per entry. At 10M DAU sessions, Redis is the safer pick because session updates are rarely whole-blob writes.',
  },
  {
    prompt:
      'Evaluate the trade-offs between monorepo and polyrepo for a 30-engineer team shipping 5 deployable services.',
    response:
      'Monorepo trade: atomic cross-service refactors, shared tooling, one CI pipeline — at the cost of build-graph complexity (need Nx/Bazel/Turborepo for incremental builds) and slower untargeted CI. Polyrepo trade: independent release cadence and isolated CI — at the cost of cross-cutting refactors becoming N PRs and dependency drift. At 5 services / 30 engineers, monorepo with affected-only CI usually wins.',
  },
  {
    prompt: 'Assess the security posture of allowing API keys in environment variables vs a secret manager.',
    response:
      'Env-var keys are simple but leak via: process listing, core dumps, debugger attach, and accidental log statements that dump process.env. Secret managers (Vault, AWS SM, GCP SM) add: rotation, audit log, ACL per secret, and short-lived dynamic credentials. The right answer for production is a secret manager; env vars are acceptable for ephemeral dev only.',
  },
];

const CONVERSATIONAL: PromptTemplate[] = [
  { prompt: 'Hi! How are you today?', response: 'I am doing well — thanks for asking! How can I help?' },
  { prompt: 'Thanks!', response: "You're welcome!" },
  { prompt: 'Ok cool.', response: 'Glad that worked!' },
  { prompt: 'Hello there.', response: 'Hi! What can I help you with today?' },
  { prompt: 'Sure, sounds good.', response: 'Great — let me know if anything else comes up.' },
];

const INSTRUCTIONAL: PromptTemplate[] = [
  {
    prompt:
      'How to set up two-factor authentication on a GitHub account? Walk me through it.',
    response:
      "Go to Settings → Password and authentication → Two-factor authentication → Enable. Choose either an authenticator app (recommended) or SMS. Scan the QR code with Authy / 1Password / Google Authenticator. Enter the 6-digit code. Save the recovery codes somewhere safe — you'll need them if you lose your phone.",
  },
  {
    prompt:
      'Guide me through deploying a Next.js app to Vercel with a custom domain. Assume I have the app working locally.',
    response:
      'Push your code to GitHub. In Vercel: New Project → import the repo → accept defaults → Deploy. Once it builds, go to Project Settings → Domains → Add. Enter the domain you own; Vercel shows you the DNS records to set at your registrar. Wait for the green check (usually under 5 minutes after DNS propagates). HTTPS provisions automatically.',
  },
  {
    prompt: 'List five productivity tips for software engineers.',
    response:
      '1. Time-block deep work; protect 2-hour blocks from meetings.\n2. Use the two-minute rule: if it takes under two minutes, do it now.\n3. Single-task — context switches are 10-20 minute taxes each.\n4. Inbox zero by EOD; treat email as queue, not stream.\n5. Sleep seven-plus hours; productivity collapses below that.',
  },
  {
    prompt:
      'Steps to migrate a Postgres database from one region to another with minimal downtime?',
    response:
      "1. Spin up replica in target region via logical replication. 2. Let it catch up to within seconds of lag. 3. Schedule a maintenance window. 4. Pause writes on the source. 5. Wait for replica to be fully caught up (lag = 0). 6. Promote replica to primary. 7. Re-point app's connection string. 8. Decommission source after smoke tests pass.",
  },
  {
    prompt: 'How to write a good post-mortem for a production incident?',
    response:
      'Lead with: what happened, impact (customer-facing), and detection time. Then a timeline (UTC). Then root cause — separate "what failed" from "what went wrong with our process". Then remediation: short-term (already done), medium-term (this quarter), long-term (next planning cycle). End with what went well. Blameless throughout — focus on systems, not people.',
  },
];

// "Bad pattern" templates: these intentionally exercise the insights engine.

const REDUNDANT_DUPES: PromptTemplate[] = [
  {
    prompt:
      'Summarize the following meeting notes and extract the action items: [Q3 planning notes - product roadmap discussion - feature prioritization]. Format as a bulleted list with owners.',
    response: 'Action items: (1) Design — finalize new dashboard mocks by Friday (owner: J. Lee)...',
  },
  {
    prompt:
      'Summarize the following meeting notes and extract the action items: [retrospective notes - last sprint blockers - team velocity]. Format as a bulleted list with owners.',
    response: 'Action items: (1) DevOps — investigate flaky CI pipeline (owner: M. Patel)...',
  },
  {
    prompt:
      'Summarize the following meeting notes and extract the action items: [customer call notes - feature requests - integration concerns]. Format as a bulleted list with owners.',
    response: 'Action items: (1) Product — draft RFC for SSO integration (owner: T. Kim)...',
  },
];

const BLOATED_OUTPUTS: PromptTemplate[] = [
  {
    prompt: 'What is 2 + 2?',
    response:
      'Two plus two equals four. This is a fundamental arithmetic operation that forms the basis of addition in mathematics. Addition is one of the four basic operations of arithmetic, along with subtraction, multiplication, and division. When we add two numbers together, we are essentially combining their quantities. In this case, we are combining two and two, which gives us four. This concept has been understood since ancient civilizations developed early counting systems. The Babylonians, Egyptians, and Greeks all had their own numerical systems that included basic addition. In modern mathematics, addition is represented by the plus sign (+), which originated from the Latin word "et" meaning "and". The number four itself has significant cultural meaning in various societies. Some cultures consider four to be a lucky number, while others associate it with misfortune. In computer science, the binary representation of four is 100. Four is also the smallest composite number, the smallest number of colors needed to color a planar graph (four color theorem), and the number of bases in DNA. So while the answer to your question is simply four, the concept itself touches on many areas of mathematics, history, and culture.',
    outputBloat: true,
  },
  {
    prompt: 'What time zone is UTC?',
    response:
      'UTC stands for Coordinated Universal Time, and it is the primary time standard by which the world regulates clocks and time. It is, for most practical purposes, equivalent to Greenwich Mean Time (GMT), though they are defined slightly differently. UTC does not change with the seasons (no daylight saving). It is used as a reference point for all other time zones, which are typically expressed as offsets from UTC (for example, UTC-5 for Eastern Standard Time, UTC+1 for Central European Time). UTC was implemented in 1972 to replace earlier mean solar time standards. It is maintained by the International Bureau of Weights and Measures (BIPM) in France and is based on atomic clocks. Aviation, computing, the internet, weather forecasting, and the International Space Station all use UTC as their reference time. Software systems often store timestamps in UTC and convert to local time only when displaying to users — this is a best practice because it avoids ambiguity around daylight saving transitions and lets you correctly compare events that occurred in different regions.',
    outputBloat: true,
  },
];

const MULTIDIM: PromptTemplate[] = [
  {
    prompt:
      'I need you to do three things: (1) draft a launch email for our new product, (2) write three tweet variants promoting it, and (3) suggest five blog post titles. The product is an AI-powered note-taking app for researchers.',
    response: '1) Email: Subject: Research, Reimagined...\n2) Tweets: ...\n3) Blog titles: ...',
  },
  {
    prompt:
      'Write a comprehensive marketing plan for a B2B SaaS startup targeting mid-market manufacturing companies. Include positioning, ICP definition, channel strategy, content calendar for Q1, pricing tiers, and competitive analysis vs the top 3 incumbents.',
    response:
      'Marketing Plan — Manufacturing SaaS Launch\n1. Positioning: ...\n2. ICP: ...\n3. Channels: ...\n4. Q1 calendar: ...\n5. Pricing: ...\n6. Competitive analysis: ...',
  },
  {
    prompt:
      'For our Q4 planning, please: outline the engineering OKRs, draft a hiring plan for 5 roles, identify the top 3 technical risks, propose a budget for cloud spend, and write the all-hands narrative explaining the roadmap.',
    response:
      'Q4 Plan:\n- OKRs: ...\n- Hiring: ...\n- Risks: ...\n- Budget: ...\n- Narrative: ...',
  },
];

// --- distributions --------------------------------------------------------

interface ModelChoice {
  model: string;
  provider: string;
  // weight controls share of total rows
  weight: number;
}

// Distribution per spec: 40% mini/haiku, 35% mid-tier, 25% premium.
//   - cheap   (40%): gpt-4o-mini, claude-haiku-4, gemini-1.5-flash, gpt-3.5-turbo
//   - mid     (35%): gemini-1.5-pro (single mid-priced model in the spec list)
//   - premium (25%): gpt-4o, claude-sonnet-4 (the most expensive in the list)
//
// Within each tier the weights are tuned so the resulting monthly bill lands
// in the $80-$200 enterprise-ish band when paired with the input/output
// padding bands below.
const MODEL_MIX: ModelChoice[] = [
  { model: 'gpt-4o-mini', provider: 'openai', weight: 18 },
  { model: 'claude-haiku-4', provider: 'anthropic', weight: 12 },
  { model: 'gemini-1.5-flash', provider: 'google', weight: 6 },
  { model: 'gpt-3.5-turbo', provider: 'openai', weight: 4 },
  { model: 'gemini-1.5-pro', provider: 'google', weight: 35 },
  { model: 'claude-sonnet-4', provider: 'anthropic', weight: 17 },
  { model: 'gpt-4o', provider: 'openai', weight: 8 },
];

const APPS = [
  'chatbot',
  'doc-summarizer',
  'support-bot',
  'code-review',
  'research-tool',
  'sales-emails',
  'analytics-q',
];

const USER_POOL: string[] = Array.from({ length: 20 }, (_, i) => `user_${String(i + 1).padStart(3, '0')}`);

const TEAM_TAGS = [
  'team-engineering',
  'team-marketing',
  'team-support',
  'team-sales',
  'team-data',
  'team-product',
];

const FEATURE_TAGS = [
  'feature-summarize',
  'feature-search',
  'feature-classify',
  'feature-draft',
  'feature-review',
  'feature-extract',
];

const ENV_TAGS = ['prod', 'staging'];

// --- RNG (deterministic seedable) ----------------------------------------
//
// We need realism but not strict determinism across runs (each seed call
// produces a fresh-looking dashboard). Math.random is fine — the orchestrator
// does NOT rely on reproducibility.

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickWeighted<T extends { weight: number }>(arr: readonly T[]): T {
  const total = arr.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of arr) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return arr[arr.length - 1]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// log-normal-ish latency: mostly around 1500ms, occasional long-tail spikes.
function sampleLatency(): number {
  // log-normal: exp(N(mu, sigma)). Tuned so median ~ 1500ms, p99 ~ 12s.
  const mu = Math.log(1500);
  const sigma = 0.65;
  // Box-Muller for a standard normal.
  const u1 = Math.max(1e-9, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const v = Math.exp(mu + sigma * z);
  return Math.max(50, Math.min(45_000, Math.round(v)));
}

// Time spread: weighted toward business hours (9–18 local), past `daysBack` days,
// avoiding heavy weekend traffic.
function sampleTimestamp(daysBack: number): Date {
  const now = Date.now();
  const span = daysBack * 24 * 60 * 60 * 1000;
  // Random day offset (skew slightly toward more recent).
  const dayOffset = Math.floor(Math.pow(Math.random(), 1.3) * daysBack);
  const dayStart = new Date(now - dayOffset * 24 * 60 * 60 * 1000);
  dayStart.setHours(0, 0, 0, 0);

  // Business hours weight: 9-18 → 80% probability; rest of day → 20%.
  const inBiz = Math.random() < 0.8;
  const hour = inBiz ? randInt(9, 18) : Math.random() < 0.5 ? randInt(0, 8) : randInt(19, 23);
  const minute = randInt(0, 59);
  const second = randInt(0, 59);

  // Weekend dampening: if Sat/Sun, 50% chance of resampling deeper into past.
  const day = dayStart.getDay();
  if ((day === 0 || day === 6) && Math.random() < 0.5) {
    // Push into nearby weekday.
    dayStart.setDate(dayStart.getDate() - (day === 0 ? 2 : 1));
  }

  dayStart.setHours(hour, minute, second, 0);
  // Don't return future timestamps if we picked today + late hour.
  return new Date(Math.min(now, dayStart.getTime()));
}

// Random subset of tags. Most rows get 2-3 tags; a few get 0 or many.
function sampleTags(category: Category, includeDemoCategory = true): string {
  const tags: string[] = [];
  if (includeDemoCategory) {
    tags.push('demo');
    tags.push(category);
  }
  // env
  if (Math.random() < 0.85) tags.push(pick(ENV_TAGS));
  // team
  if (Math.random() < 0.7) tags.push(pick(TEAM_TAGS));
  // feature
  if (Math.random() < 0.5) tags.push(pick(FEATURE_TAGS));
  // dedup
  return Array.from(new Set(tags)).join(',');
}

interface TemplateBucket {
  templates: PromptTemplate[];
  // share of rows drawn from this bucket
  weight: number;
}

function buildBuckets(includeMultidim: boolean): TemplateBucket[] {
  const buckets: TemplateBucket[] = [
    { templates: FACTUAL, weight: 18 },
    { templates: REASONING, weight: 10 },
    { templates: CREATIVE, weight: 8 },
    { templates: CODE, weight: 18 },
    { templates: ANALYTICAL, weight: 10 },
    { templates: CONVERSATIONAL, weight: 12 },
    { templates: INSTRUCTIONAL, weight: 10 },
    { templates: REDUNDANT_DUPES, weight: 8 },
    { templates: BLOATED_OUTPUTS, weight: 4 },
  ];
  if (includeMultidim) buckets.push({ templates: MULTIDIM, weight: 6 });
  return buckets;
}

interface Bucket {
  templates: PromptTemplate[];
  weight: number;
}

function pickTemplate(buckets: Bucket[]): PromptTemplate {
  const total = buckets.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;
  for (const b of buckets) {
    r -= b.weight;
    if (r <= 0) return pick(b.templates);
  }
  return pick(buckets[buckets.length - 1]!.templates);
}

// Optional jitter: occasionally append a small filler phrase to vary the
// prompt slightly so cluster fingerprints differ but stay near-duplicate.
function jitter(prompt: string): string {
  const fillers = ['', '', '', ' Thanks!', ' Please be concise.', ' Make it short.'];
  return prompt + pick(fillers);
}

// Cheap "model mismatch" generator: with some probability, force a simple
// prompt onto an expensive model to seed the model-mismatch insight.
function maybeMismatch(model: string, complexity: Complexity): string {
  if (
    (complexity === 'simple' || complexity === 'moderate') &&
    Math.random() < 0.15
  ) {
    // Force a premium model on a simple task.
    return pick(['claude-sonnet-4', 'gpt-4o']);
  }
  return model;
}

export function generateDemoPrompts(opts: DemoSeedOptions = {}): DemoPromptRow[] {
  const count = Math.max(1, Math.floor(opts.count ?? 300));
  const daysBack = Math.max(1, Math.floor(opts.daysBack ?? 30));
  const includeMultidim = opts.includeMultidim ?? true;

  const generatedAt = new Date().toISOString();
  const buckets = buildBuckets(includeMultidim);
  const rows: DemoPromptRow[] = [];

  for (let i = 0; i < count; i++) {
    const template = pickTemplate(buckets);
    const promptText = jitter(template.prompt);
    const responseText = template.response;

    const modelChoice = pickWeighted(MODEL_MIX);
    let model = modelChoice.model;
    let provider: string | null = modelChoice.provider;
    const appName = pick(APPS);
    const userId = Math.random() < 0.9 ? pick(USER_POOL) : null;

    // Real categorize/analyze (so categories aren't random).
    const analysis = analyzePrompt(promptText, model);

    // Inject occasional model-mismatch for simple/moderate prompts.
    const mismatched = maybeMismatch(model, analysis.complexity);
    if (mismatched !== model) {
      model = mismatched;
      provider = getPricing(model).provider ?? provider;
    }

    // Token counts: use the tokenizer on the actual prompt + response text.
    // Then add realistic input "padding" (system prompt, retrieved context,
    // conversation history) so per-call cost matches what enterprise traffic
    // looks like — a bare 10-token prompt run alone would never bill $0.30.
    // We pad input substantially because almost every production LLM call
    // carries a system prompt + RAG context. Output is also amplified for
    // long-form apps and bloated for the cap-output insight.
    //
    // The token bands here are tuned so that 300 rows over 30 days totals
    // roughly $80-$200 — realistic mid-size enterprise spend.
    const rawInput = countTokens(promptText, model);
    let rawOutput = countTokens(responseText, model);

    // App-based input padding bands. Doc summarizer / research / analytics
    // routinely include big context dumps (RAG retrieval — 100k-500k tokens
    // is common for high-context apps on Claude/Gemini); chatbots include
    // conversation history; code-review pulls in the diff + repo context.
    // Numbers are calibrated so 300 rows total roughly $80-$200/mo at the
    // spec's 40/35/25 model mix.
    //
    // Exception: bloated-output templates intentionally keep input small so
    // the output:input ratio passes the >3x threshold in insights.ts —
    // otherwise the cap-output insight never fires.
    const APP_INPUT_PAD: Record<string, [number, number]> = {
      'doc-summarizer': [180000, 500000],
      'research-tool': [120000, 350000],
      'analytics-q': [80000, 250000],
      'support-bot': [25000, 90000],
      'code-review': [50000, 160000],
      'chatbot': [20000, 75000],
      'sales-emails': [10000, 40000],
    };
    const pad = APP_INPUT_PAD[appName] ?? [15000, 60000];
    const inputPadding = template.outputBloat ? randInt(50, 250) : randInt(pad[0], pad[1]);
    const inputTokens = rawInput + inputPadding;

    // Output amplification: real LLM responses are far longer than the
    // sketch text in our templates. We multiply by category-appropriate
    // bands so creative + analytical drive higher output cost than factual.
    if (!template.outputBloat) {
      const outBase =
        analysis.category === 'creative' || analysis.category === 'analytical'
          ? randInt(2500, 6000)
          : analysis.category === 'code' || analysis.category === 'reasoning'
          ? randInt(1500, 4500)
          : analysis.category === 'instructional'
          ? randInt(2000, 5000)
          : analysis.category === 'factual'
          ? randInt(150, 600)
          : analysis.category === 'conversational'
          ? randInt(80, 400)
          : randInt(800, 2500);
      rawOutput = Math.max(rawOutput, outBase);
    } else {
      // Bloated rows: keep them dramatically high so cap-output fires.
      rawOutput = Math.max(rawOutput, randInt(4000, 8000));
    }

    // 10% chance: extra "long-output" call (drives totals + cap-output insight).
    if (!template.outputBloat && Math.random() < 0.10) {
      rawOutput = Math.round(rawOutput * randInt(2, 3) + randInt(1000, 2500));
    }
    const outputTokens = rawOutput;

    const { inputCost, outputCost, totalCost } = calculateCost(inputTokens, outputTokens, model);

    // Run the real optimizer to populate potentialSavedTokens / potentialSavedCost.
    let potentialSavedTokens = 0;
    let potentialSavedCost = 0;
    try {
      const opt = optimizePrompt(promptText, model, outputTokens);
      potentialSavedTokens = opt.savedTokens;
      potentialSavedCost = opt.estimatedCostSavings;
    } catch {
      // Optimization failures shouldn't break seed.
    }

    const ts = sampleTimestamp(daysBack);
    const characteristics: PromptCharacteristics = analysis.characteristics;
    const category = analysis.category;
    const complexity = analysis.complexity;

    const tags = sampleTags(category);

    rows.push({
      timestamp: ts,
      appName,
      userId,
      model,
      provider,
      promptText,
      responseText,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCost,
      outputCost,
      totalCost,
      category,
      complexity,
      complexityScore: analysis.complexityScore,
      dimensions: JSON.stringify(analysis.dimensions),
      characteristics: JSON.stringify(characteristics),
      latencyMs: sampleLatency(),
      metadata: JSON.stringify({ source: 'demo', generatedAt }),
      potentialSavedTokens,
      potentialSavedCost,
      tags,
    });
  }

  return rows;
}
