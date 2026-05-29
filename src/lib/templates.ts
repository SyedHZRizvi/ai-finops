/**
 * Prompt Templates Library
 *
 * Curated, production-ready prompt templates for common LLM tasks.
 * Each template embodies prompt-engineering best practices:
 *   - Explicit role + task framing
 *   - Format directives (JSON shape, bullet count, etc.)
 *   - Constraint clauses (fallback handling, refusal conditions)
 *   - Provider-specific structure (XML for Claude, headers for GPT,
 *     numbered sections for Gemini, clean prose for "any")
 *
 * Placeholders use {{name}} syntax and are described in the
 * `placeholders` array so the UI can render them and so the Studio
 * can pre-fill the corresponding fields.
 */

export type TemplateCategory =
  | 'rag'
  | 'classification'
  | 'summarization'
  | 'extraction'
  | 'generation'
  | 'analysis'
  | 'code'
  | 'translation'
  | 'conversation'
  | 'planning'
  | 'creative';

export type TemplateTarget = 'claude' | 'gpt' | 'gemini' | 'any';

export interface TemplatePlaceholder {
  name: string;
  description: string;
  example: string;
}

export interface TemplateExample {
  filled: string;
  expectedOutput: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  target: TemplateTarget;
  tags: string[];
  prompt: string;
  placeholders: TemplatePlaceholder[];
  estimatedTokens: number;
  useCase: string;
  example?: TemplateExample;
}

export const TEMPLATES: PromptTemplate[] = [
  // ============================================================
  // RAG (4 templates)
  // ============================================================
  {
    id: 'rag-with-citations',
    name: 'RAG with citations',
    description: 'Answer a question strictly from retrieved passages and cite each claim by passage ID.',
    category: 'rag',
    target: 'claude',
    tags: ['rag', 'citations', 'grounded', 'retrieval', 'qa'],
    prompt: `You are a careful research assistant. Answer the user's question using ONLY the passages provided. Every factual claim must be supported by a citation in the form [P#] where # is the passage id.

<passages>
{{passages}}
</passages>

<question>
{{question}}
</question>

<rules>
- Use only information from the passages above.
- Cite the passage id(s) after every factual sentence, e.g. "The launch was in 2019 [P2]."
- If the passages do not contain enough information to answer, reply exactly: "I don't have enough information to answer this from the provided sources."
- Do not speculate or use outside knowledge.
- Keep your answer under {{max_words}} words.
</rules>

Answer:`,
    placeholders: [
      { name: 'passages', description: 'Retrieved passages, each prefixed with [P1], [P2], etc.', example: '[P1] Acme was founded in 2014 by Jane Doe.\n[P2] Acme launched its flagship product in 2019.' },
      { name: 'question', description: 'The user\'s natural-language question', example: 'When did Acme launch its flagship product?' },
      { name: 'max_words', description: 'Maximum length of the answer in words', example: '120' },
    ],
    estimatedTokens: 320,
    useCase: 'Use when you have a retrieval system and need answers that are auditable. Citations make hallucinations easy to spot in QA and let users verify claims.',
    example: {
      filled: 'You are a careful research assistant. Answer the user\'s question using ONLY the passages provided...\n\n<passages>\n[P1] Acme was founded in 2014 by Jane Doe.\n[P2] Acme launched its flagship product in 2019.\n</passages>\n\n<question>\nWhen did Acme launch its flagship product?\n</question>',
      expectedOutput: 'Acme launched its flagship product in 2019 [P2].',
    },
  },
  {
    id: 'rag-with-confidence',
    name: 'RAG with confidence',
    description: 'Answer from retrieved passages and self-rate confidence as high, medium, or low.',
    category: 'rag',
    target: 'claude',
    tags: ['rag', 'confidence', 'uncertainty', 'retrieval'],
    prompt: `You are a research assistant. Answer using ONLY the provided passages, then self-rate your confidence based on how directly the passages support your answer.

<passages>
{{passages}}
</passages>

<question>
{{question}}
</question>

Respond as JSON with this exact shape:
{
  "answer": "<your answer in 1-3 sentences>",
  "confidence": "<high | medium | low>",
  "confidence_reason": "<one sentence: why this confidence level>",
  "cited_passages": [<list of passage ids used, e.g. 1, 3>]
}

Confidence rubric:
- high: passages state the answer directly and unambiguously
- medium: passages strongly imply the answer but require minor inference
- low: passages only partially address the question OR conflict with each other

If passages don't address the question at all, set answer to "unknown" and confidence to "low".`,
    placeholders: [
      { name: 'passages', description: 'Numbered passages from your retriever', example: '[1] The Series B closed at $40M in March 2023.\n[2] Series A was $12M.' },
      { name: 'question', description: 'User question', example: 'How much did the company raise in total funding?' },
    ],
    estimatedTokens: 280,
    useCase: 'When downstream systems need to route low-confidence answers to humans or fall back to a different model. Confidence scores enable trust calibration.',
  },
  {
    id: 'rag-multi-source-synthesis',
    name: 'Multi-source synthesis',
    description: 'Synthesize a coherent answer across multiple sources, flagging contradictions.',
    category: 'rag',
    target: 'claude',
    tags: ['rag', 'synthesis', 'multi-source', 'contradictions'],
    prompt: `You are synthesizing information from multiple sources to answer a question. Some sources may disagree.

<sources>
{{sources}}
</sources>

<question>
{{question}}
</question>

Your job:
1. Identify what the sources AGREE on.
2. Identify what they DISAGREE on (if anything).
3. Produce a single synthesized answer.

Respond using these exact sections:

## Agreed facts
- <fact> [S1, S2, ...]

## Contradictions
- <topic>: Source S1 says X, Source S2 says Y. (omit this section entirely if no contradictions)

## Synthesized answer
<2-4 sentence answer, citing sources>

If the sources do not collectively answer the question, write "Insufficient sources to answer." in the synthesized answer section.`,
    placeholders: [
      { name: 'sources', description: 'Sources labeled [S1], [S2], etc., each with title and content', example: '[S1] Annual Report 2023: Revenue grew 18% YoY to $240M.\n[S2] Q4 Press Release: Full-year revenue reached $245M, up 20%.' },
      { name: 'question', description: 'The question requiring synthesis', example: 'What was the company\'s 2023 revenue and growth rate?' },
    ],
    estimatedTokens: 400,
    useCase: 'For research workflows where you pull from heterogeneous sources (reports, news, internal docs). Surfacing contradictions is often more valuable than the answer itself.',
  },
  {
    id: 'rag-quote-attributed',
    name: 'Quote-attributed answer',
    description: 'Answer using direct quotes from sources, with attribution.',
    category: 'rag',
    target: 'claude',
    tags: ['rag', 'quotes', 'attribution', 'verbatim'],
    prompt: `You will answer a question by pulling DIRECT QUOTES from the provided documents. Do not paraphrase the supporting evidence — quote it verbatim.

<documents>
{{documents}}
</documents>

<question>
{{question}}
</question>

For each main claim in your answer:
1. State the claim in your own words (1 sentence).
2. Follow with a verbatim quote in quotation marks.
3. Attribute to the document, e.g. (Doc 2).

Format:
**Answer:** <2-4 sentence direct answer>

**Evidence:**
1. <claim>. "<verbatim quote>" (Doc <N>)
2. <claim>. "<verbatim quote>" (Doc <N>)

If a relevant verbatim quote cannot be found, say "No direct supporting quote was found in the provided documents." and do not include the claim.`,
    placeholders: [
      { name: 'documents', description: 'Documents labeled "Doc 1:", "Doc 2:", etc.', example: 'Doc 1: "We have decided to discontinue Product X effective March 1, 2024."\nDoc 2: "Customers on Product X will be migrated to Product Y at no cost."' },
      { name: 'question', description: 'The question to answer', example: 'What\'s happening with Product X?' },
    ],
    estimatedTokens: 280,
    useCase: 'High-stakes domains (legal, medical, policy) where paraphrasing introduces risk. Verbatim quotes preserve the source\'s authority and let humans audit faster.',
  },

  // ============================================================
  // CLASSIFICATION (5 templates)
  // ============================================================
  {
    id: 'cls-intent',
    name: 'Intent classifier',
    description: 'Classify a user message into one of a fixed set of intents with confidence.',
    category: 'classification',
    target: 'gpt',
    tags: ['classification', 'intent', 'routing', 'nlu'],
    prompt: `# Role
You are an intent classifier for a {{product_type}}.

# Intents (choose exactly one)
{{intent_list}}

# Rules
- Choose the SINGLE best-fit intent from the list above.
- If none fit, respond with intent "other".
- Do not invent new intents.
- Confidence must reflect how clear-cut the classification is.

# Input
User message: "{{user_message}}"

# Output format (JSON only — no prose)
{
  "intent": "<one of the listed intents>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<1 short sentence>"
}`,
    placeholders: [
      { name: 'product_type', description: 'What kind of product the assistant serves', example: 'banking customer support chatbot' },
      { name: 'intent_list', description: 'A bulleted list of intents with short descriptions', example: '- balance_check: User asks about account balance\n- transfer_money: User wants to move funds\n- card_lost: User reports a lost or stolen card\n- other: Anything else' },
      { name: 'user_message', description: 'The message from the user', example: 'I think someone stole my Visa, please help' },
    ],
    estimatedTokens: 200,
    useCase: 'First step of any routing system: deciding which downstream handler, agent, or skill should take a message. The fixed intent list prevents drift across calls.',
  },
  {
    id: 'cls-sentiment-3class',
    name: 'Sentiment 3-class',
    description: 'Classify text as positive, negative, or neutral with a short rationale.',
    category: 'classification',
    target: 'any',
    tags: ['sentiment', 'classification', 'analysis'],
    prompt: `Classify the sentiment of the following text as exactly one of: positive, negative, or neutral.

Definitions:
- positive: clearly expresses approval, satisfaction, or pleasure
- negative: clearly expresses dissatisfaction, complaint, or frustration
- neutral: factual, ambiguous, or mixed without a dominant emotional tone

Text:
"""
{{text}}
"""

Respond with JSON only:
{
  "sentiment": "positive | negative | neutral",
  "rationale": "<one sentence explaining the choice, referencing specific words or phrases>"
}`,
    placeholders: [
      { name: 'text', description: 'The text to classify (review, tweet, support message, etc.)', example: 'The delivery was on time but the packaging was damaged and the product arrived bent.' },
    ],
    estimatedTokens: 160,
    useCase: 'Reviewing customer feedback, monitoring brand mentions, or filtering inbound support tickets by tone. Neutral is the under-used class — most models over-predict positive or negative.',
    example: {
      filled: 'Classify the sentiment of the following text as exactly one of: positive, negative, or neutral...\n\nText:\n"""\nThe delivery was on time but the packaging was damaged.\n"""',
      expectedOutput: '{"sentiment": "negative", "rationale": "While the delivery was praised, the dominant feedback is about damaged packaging."}',
    },
  },
  {
    id: 'cls-multi-label',
    name: 'Multi-label tagger',
    description: 'Assign zero or more topic labels from a fixed taxonomy.',
    category: 'classification',
    target: 'gpt',
    tags: ['classification', 'multi-label', 'tagging', 'taxonomy'],
    prompt: `# Role
You are a topic tagger. Assign ALL applicable labels from the taxonomy below to the input. Zero, one, or many labels may apply.

# Taxonomy
{{taxonomy}}

# Rules
- Only use labels from the taxonomy above. Do not invent labels.
- Be conservative: only tag a label if the text clearly discusses that topic, not if it only mentions it in passing.
- If no labels apply, return an empty array.

# Input
{{text}}

# Output (JSON only)
{
  "labels": ["<label1>", "<label2>", ...],
  "notes": "<optional: edge cases you considered, max 1 sentence>"
}`,
    placeholders: [
      { name: 'taxonomy', description: 'Bulleted list of allowed labels with short definitions', example: '- pricing: discussion of cost, fees, plans\n- onboarding: setup, getting started, first-use\n- bug: software defect or unexpected behavior\n- feature_request: asks for new capability' },
      { name: 'text', description: 'Input text to tag', example: 'I just signed up and the wizard kept crashing on step 3. Also, can you add Slack integration?' },
    ],
    estimatedTokens: 220,
    useCase: 'Routing support tickets to multiple teams, building product analytics from free-text feedback, or tagging documents for retrieval. Multi-label is preferred to single-label when topics overlap.',
  },
  {
    id: 'cls-spam',
    name: 'Spam detector',
    description: 'Detect spam, phishing, or low-quality content with reason codes.',
    category: 'classification',
    target: 'gpt',
    tags: ['spam', 'classification', 'safety', 'moderation'],
    prompt: `# Role
You are a content safety classifier focused on spam and phishing detection.

# Categories
- spam: unsolicited promotional content, mass marketing
- phishing: attempts to steal credentials, money, or personal info via deception
- legitimate: normal user content
- low_quality: not spam but lacks substance (e.g., one-word reply, "test", gibberish)

# Reason codes (you may use 0+ per classification)
- urgency_pressure: "act now", "limited time", artificial scarcity
- suspicious_link: link with mismatched display vs href, IP address URL, or random subdomain
- credential_request: asks for password, SSN, OTP, banking details
- unsolicited_offer: unrequested deal, promotion, or "you've won"
- impersonation: claims to be a known brand or person inauthentically
- generic_greeting: "Dear customer" with no personalization in a personal context
- bulk_pattern: text reads like a templated mass message

# Input
{{content}}

# Output (JSON only)
{
  "category": "spam | phishing | legitimate | low_quality",
  "confidence": <0.0 to 1.0>,
  "reason_codes": ["<code1>", "<code2>"],
  "summary": "<one sentence justification>"
}`,
    placeholders: [
      { name: 'content', description: 'The message or content to evaluate', example: 'URGENT: Your account will be locked! Verify your password at http://secure-bank-login.tk/auth' },
    ],
    estimatedTokens: 300,
    useCase: 'Email gateways, comment moderation, or DMs filtering. Reason codes are essential — they let you tune downstream actions (block, quarantine, warn) per code.',
  },
  {
    id: 'cls-pii-detector',
    name: 'PII detector',
    description: 'Detect and classify personally identifiable information in text.',
    category: 'classification',
    target: 'gpt',
    tags: ['pii', 'classification', 'privacy', 'compliance'],
    prompt: `# Role
You are a privacy classifier that detects PII (Personally Identifiable Information) in text.

# PII types to detect
- person_name, email, phone, address, ssn, credit_card, dob, ip_address, passport, license_plate, medical_info, financial_account

# Input
{{text}}

# Rules
- Report every PII instance even if duplicated.
- Use character offsets (0-indexed, inclusive start, exclusive end) relative to the input text.
- Include the matched substring verbatim.
- If no PII is present, return an empty entities array.

# Output (JSON only)
{
  "has_pii": <true | false>,
  "entities": [
    { "type": "<pii_type>", "value": "<exact text>", "start": <int>, "end": <int> }
  ]
}`,
    placeholders: [
      { name: 'text', description: 'Text to scan for PII', example: 'Hi, I\'m Jane Doe (jane@example.com). My SSN is 123-45-6789.' },
    ],
    estimatedTokens: 220,
    useCase: 'Pre-screening prompts before sending to a third-party LLM, redacting logs, or compliance pipelines. Offsets let downstream code do precise redaction without re-parsing.',
  },

  // ============================================================
  // SUMMARIZATION (5 templates)
  // ============================================================
  {
    id: 'sum-exec-bullets',
    name: 'Executive summary (3 bullets)',
    description: 'Distill long content into exactly 3 bullets aimed at a busy executive.',
    category: 'summarization',
    target: 'any',
    tags: ['summary', 'executive', 'bullets', 'brief'],
    prompt: `Summarize the following content for a {{audience}}. They have 30 seconds. They want decisions and impact, not narrative.

Content:
"""
{{content}}
"""

Constraints:
- Exactly 3 bullets.
- Each bullet starts with the most important word (the "what").
- Use specific numbers, names, and dates when present in the source.
- Total length: under {{max_words}} words across all 3 bullets.
- No preamble like "Here are the bullets". Just the bullets.

Output format:
- <bullet 1>
- <bullet 2>
- <bullet 3>`,
    placeholders: [
      { name: 'audience', description: 'Who the summary is for', example: 'CEO of a 200-person startup' },
      { name: 'content', description: 'The long-form content to summarize (report, email thread, doc)', example: 'Q3 revenue came in at $4.2M vs $3.8M guidance...(long text)' },
      { name: 'max_words', description: 'Total word budget across all 3 bullets', example: '75' },
    ],
    estimatedTokens: 200,
    useCase: 'Daily standup digests, board pre-read summaries, executive briefings. The 3-bullet constraint forces ruthless prioritization.',
  },
  {
    id: 'sum-detailed-digest',
    name: 'Detailed digest',
    description: 'Produce a structured summary with sections, key facts, and follow-ups.',
    category: 'summarization',
    target: 'gpt',
    tags: ['summary', 'digest', 'structured', 'detailed'],
    prompt: `# Role
You are an analyst producing a structured digest for {{audience}}.

# Content to digest
"""
{{content}}
"""

# Output format (use these exact section headers)

## TL;DR
<2-3 sentence overall summary>

## Key facts
- <fact with specific number/date/name>
- <fact with specific number/date/name>
- (3-6 facts total)

## Decisions or actions called out
- <decision/action> — owner: <person or team if mentioned, else "unspecified">
- (omit this section entirely if none)

## Open questions
- <question implied but not answered in the source>
- (omit this section entirely if none)

## What's notably missing
- <important info you'd expect but wasn't in the source>
- (omit this section entirely if nothing is notably missing)`,
    placeholders: [
      { name: 'audience', description: 'Target reader and their interest', example: 'a product manager preparing for a stakeholder review' },
      { name: 'content', description: 'Source material to digest', example: 'Meeting transcript or long report text' },
    ],
    estimatedTokens: 350,
    useCase: 'Post-meeting recaps, weekly digests, board memo prep. The "notably missing" section is the highest-signal output — it surfaces blind spots.',
  },
  {
    id: 'sum-tweet',
    name: 'Tweet-length summary',
    description: 'Compress content to a single tweet (280 chars) with hook + value.',
    category: 'summarization',
    target: 'any',
    tags: ['summary', 'tweet', 'social', 'compression'],
    prompt: `Compress this content into a single tweet of 280 characters or fewer.

Content:
"""
{{content}}
"""

Rules:
- Lead with the most surprising or specific fact.
- Use numbers when the source has them.
- {{hashtag_rule}}
- No "Here's a summary:" preamble — just the tweet text.
- Hard limit: 280 characters including spaces and any hashtags.

Output the tweet only, on a single line.`,
    placeholders: [
      { name: 'content', description: 'The content to compress', example: 'A long article about a new battery research breakthrough.' },
      { name: 'hashtag_rule', description: 'Whether to include hashtags', example: 'Include 1-2 relevant hashtags at the end.' },
    ],
    estimatedTokens: 150,
    useCase: 'Social distribution of long-form content, push notifications, headline generation. Forcing the 280-char limit is what makes it hard — and useful.',
  },
  {
    id: 'sum-action-items',
    name: 'Action items extractor',
    description: 'Pull out actionable items from meeting notes or threads with owners and due dates.',
    category: 'summarization',
    target: 'gpt',
    tags: ['summary', 'action-items', 'meeting', 'tasks'],
    prompt: `# Role
You extract action items from {{source_type}}.

# Definitions
- Action item: a concrete task someone committed to doing or was assigned. NOT a general topic discussed.
- An action item must have a verb and an object (e.g., "send the report", "talk to legal").

# Source
"""
{{content}}
"""

# Rules
- Be precise: extract only what was actually committed to or assigned, not what was merely mentioned.
- For owners: use the explicit name/role if stated; otherwise "unassigned".
- For due dates: only include if stated. Otherwise leave null.
- If no action items exist, return an empty array.

# Output (JSON only)
{
  "action_items": [
    {
      "task": "<imperative phrasing, e.g. 'Send revised contract to vendor'>",
      "owner": "<name/role or 'unassigned'>",
      "due": "<ISO date YYYY-MM-DD or null>",
      "source_quote": "<short verbatim quote that triggered this extraction>"
    }
  ]
}`,
    placeholders: [
      { name: 'source_type', description: 'Where the content comes from', example: 'Slack threads and meeting transcripts' },
      { name: 'content', description: 'Raw meeting notes, transcript, or thread', example: 'Alice: I\'ll send the contract by Friday. Bob: Cool, and I\'ll loop in legal next week.' },
    ],
    estimatedTokens: 280,
    useCase: 'Personal productivity layers on top of meeting recorders, follow-up emails after calls, or sprint planning extraction. The `source_quote` field provides auditability.',
  },
  {
    id: 'sum-changelog',
    name: 'Changelog from commits',
    description: 'Generate a user-facing changelog from raw git commit messages.',
    category: 'summarization',
    target: 'any',
    tags: ['summary', 'changelog', 'release', 'git'],
    prompt: `Convert these raw git commits into a user-facing changelog for version {{version}}.

Commits:
"""
{{commits}}
"""

Group entries under these sections (omit any section that has no entries):

### Added
- <new feature, written from user perspective>

### Changed
- <behavior change>

### Fixed
- <bug fix>

### Removed
- <removed feature or capability>

### Internal
- <refactors, infra, build — only include if user-visible impact, otherwise skip>

Rules:
- Write from the user's perspective, not the developer's. "Added dark mode" not "Add dark mode toggle to theme provider".
- Drop merge commits, version bumps, and trivial commits.
- One bullet per change. Combine related commits if they describe one user-facing change.
- No commit SHAs in the output.`,
    placeholders: [
      { name: 'version', description: 'Version being released', example: 'v2.4.0' },
      { name: 'commits', description: 'Raw git log output', example: 'feat: add dark mode toggle\nfix: handle null in pricing fetcher\nchore: bump deps' },
    ],
    estimatedTokens: 260,
    useCase: 'Automating release notes for product launches. Saves engineers hours per release and produces consistent, user-readable changelogs.',
  },

  // ============================================================
  // EXTRACTION (5 templates)
  // ============================================================
  {
    id: 'ext-entities-json',
    name: 'Entity extraction (JSON)',
    description: 'Extract named entities (people, orgs, locations, dates) as structured JSON.',
    category: 'extraction',
    target: 'gpt',
    tags: ['extraction', 'ner', 'json', 'entities'],
    prompt: `# Role
You are a named-entity extractor.

# Entity types
- person: individual humans
- organization: companies, agencies, teams, governments
- location: cities, countries, regions, addresses
- date: any date or date range
- money: monetary amounts (include currency)
- product: named products or services

# Input
"""
{{text}}
"""

# Rules
- Extract the entity exactly as it appears (preserve capitalization, punctuation).
- Deduplicate: if the same entity appears multiple times, list it once with count.
- If unsure of a type, prefer omitting over guessing.

# Output (JSON only)
{
  "entities": [
    { "type": "<type>", "value": "<verbatim>", "count": <int> }
  ]
}`,
    placeholders: [
      { name: 'text', description: 'Text to extract entities from', example: 'On March 3, Acme Corp announced a $15M deal with Globex in Berlin.' },
    ],
    estimatedTokens: 220,
    useCase: 'Building structured search indexes from unstructured text, populating CRMs from emails, or pre-processing for knowledge graphs.',
    example: {
      filled: '# Role\nYou are a named-entity extractor...\n\n# Input\n"""\nOn March 3, Acme Corp announced a $15M deal with Globex in Berlin.\n"""',
      expectedOutput: '{"entities":[{"type":"date","value":"March 3","count":1},{"type":"organization","value":"Acme Corp","count":1},{"type":"money","value":"$15M","count":1},{"type":"organization","value":"Globex","count":1},{"type":"location","value":"Berlin","count":1}]}',
    },
  },
  {
    id: 'ext-dates-amounts',
    name: 'Date and amount extractor',
    description: 'Pull every date and monetary amount with normalized values.',
    category: 'extraction',
    target: 'any',
    tags: ['extraction', 'dates', 'amounts', 'financial'],
    prompt: `Extract every date and every monetary amount from the text below.

Text:
"""
{{text}}
"""

Output a JSON object:
{
  "dates": [
    {
      "raw": "<as it appears in text>",
      "normalized": "<YYYY-MM-DD if a single date; YYYY-MM-DD/YYYY-MM-DD if a range; or null if ambiguous>",
      "context": "<short phrase showing what the date refers to>"
    }
  ],
  "amounts": [
    {
      "raw": "<as it appears>",
      "value": <number, e.g. 15000000 for $15M>,
      "currency": "<ISO 4217 code, e.g. USD, EUR, or 'unknown'>",
      "context": "<what this amount refers to>"
    }
  ]
}

Rules:
- Normalize $15M to 15000000. "fifteen million dollars" → value 15000000, currency USD.
- For relative dates like "last Tuesday", set normalized to null and explain in context.
- Today's date for reference: {{today}}.`,
    placeholders: [
      { name: 'text', description: 'Source text', example: 'On 3/15/2024, we closed a $2.5M Series Seed. Next round expected Q2 2025.' },
      { name: 'today', description: 'Today\'s date in YYYY-MM-DD', example: '2024-06-15' },
    ],
    estimatedTokens: 280,
    useCase: 'Invoice parsing, financial news extraction, contract review. Normalization is what makes the output usable for downstream calculations.',
  },
  {
    id: 'ext-schema-validated',
    name: 'Schema-validated extract',
    description: 'Extract fields matching a JSON schema, with explicit null for missing values.',
    category: 'extraction',
    target: 'gpt',
    tags: ['extraction', 'schema', 'structured', 'json'],
    prompt: `# Role
Extract structured data from the input. Conform STRICTLY to the schema below.

# Schema
\`\`\`json
{{schema}}
\`\`\`

# Input
"""
{{input}}
"""

# Rules
- Output JSON that validates against the schema exactly.
- For any field not present in the input, use null (not empty string, not "N/A").
- Do not invent values. If the source is ambiguous, prefer null.
- Do not add fields that aren't in the schema.
- No prose, no markdown — JSON only.

# Output`,
    placeholders: [
      { name: 'schema', description: 'JSON Schema or example shape of expected output', example: '{\n  "type": "object",\n  "properties": {\n    "name": {"type": "string"},\n    "email": {"type": "string"},\n    "company": {"type": "string"},\n    "title": {"type": "string"}\n  },\n  "required": ["name"]\n}' },
      { name: 'input', description: 'The unstructured text to extract from', example: 'Hi, this is Sarah Chen from Acme — sarah.chen@acme.io. Looking forward to chatting.' },
    ],
    estimatedTokens: 300,
    useCase: 'Feeding data into typed systems (databases, downstream APIs). The "use null" rule is critical — it prevents hallucination of plausible-but-wrong values.',
  },
  {
    id: 'ext-resume-parser',
    name: 'Resume parser',
    description: 'Parse a resume into structured candidate data.',
    category: 'extraction',
    target: 'gpt',
    tags: ['extraction', 'resume', 'hr', 'parsing'],
    prompt: `# Role
You are a resume parser. Convert the raw resume text into a structured candidate profile.

# Resume
"""
{{resume_text}}
"""

# Output schema (JSON only, no markdown)
{
  "name": "<full name or null>",
  "email": "<email or null>",
  "phone": "<phone or null>",
  "location": "<city, state/country or null>",
  "summary": "<1-2 sentence professional summary from the resume's own words, or null>",
  "current_role": "<latest title and company, or null>",
  "years_experience": <int estimate based on work history, or null if unclear>,
  "skills": ["<skill>", ...],
  "experience": [
    {
      "title": "<role title>",
      "company": "<company name>",
      "start": "<YYYY-MM or YYYY>",
      "end": "<YYYY-MM, YYYY, or 'present'>",
      "highlights": ["<bullet>", ...]
    }
  ],
  "education": [
    {
      "degree": "<degree name>",
      "institution": "<school>",
      "year": "<YYYY or null>"
    }
  ],
  "certifications": ["<cert name>", ...]
}

# Rules
- Use null (not empty string) for missing fields.
- Preserve original phrasing in highlights; do not paraphrase.
- For "skills": only include explicitly listed skills or technologies that appear as standalone keywords, not narrative mentions.
- Empty arrays are valid for skills/certifications when nothing is present.`,
    placeholders: [
      { name: 'resume_text', description: 'Raw text of the resume (from PDF extraction, etc.)', example: 'JANE DOE\nSan Francisco, CA · jane@example.com\n\nSenior Software Engineer at Acme (2020-present)...' },
    ],
    estimatedTokens: 500,
    useCase: 'ATS ingestion, candidate database population, automated screening. Structured output enables filtering, ranking, and downstream skills-match calculations.',
  },
  {
    id: 'ext-table-from-text',
    name: 'Table from unstructured text',
    description: 'Reconstruct a tabular dataset from prose containing tabular information.',
    category: 'extraction',
    target: 'gpt',
    tags: ['extraction', 'table', 'tabular', 'csv'],
    prompt: `Extract tabular data from the prose below into a clean CSV.

Prose:
"""
{{text}}
"""

Expected columns (header row): {{columns}}

Rules:
- Output a single CSV. First row is the header, exactly matching the column names above.
- Quote any field that contains a comma, newline, or quote.
- For missing values in a row, leave the cell empty (",,").
- Do not invent rows. Only include rows clearly identifiable in the source.
- No prose before or after the CSV.

Output:`,
    placeholders: [
      { name: 'text', description: 'Prose with table-like content', example: 'In Q1, sales were $12K with 30 customers. Q2 grew to $18K and 42 customers. Q3 dipped slightly to $17K but customers grew to 50.' },
      { name: 'columns', description: 'Comma-separated column names', example: 'quarter,revenue_usd,customers' },
    ],
    estimatedTokens: 240,
    useCase: 'Converting narrative reports, web-scraped articles, or analyst notes into spreadsheets. Far cheaper than dedicated parsers when the prose is varied.',
  },

  // ============================================================
  // GENERATION (5 templates)
  // ============================================================
  {
    id: 'gen-marketing-email',
    name: 'Marketing email draft',
    description: 'Draft a marketing email with subject lines, preview, and CTA.',
    category: 'generation',
    target: 'gpt',
    tags: ['email', 'marketing', 'copy', 'cta'],
    prompt: `# Role
You are a B2B marketing copywriter specializing in {{industry}}.

# Brief
- Audience: {{audience}}
- Goal: {{goal}}
- Product/offer: {{offer}}
- Tone: {{tone}}
- Must include: {{must_include}}
- Must avoid (no exceptions): pushy language, fake urgency, "this is not spam"-style disclaimers

# Output format
Produce 3 subject-line options, then ONE full email.

## Subject lines
1. <option 1: under 50 chars, curiosity-driven>
2. <option 2: under 50 chars, benefit-driven>
3. <option 3: under 50 chars, question-style>

## Preview text
<under 90 chars, complements but doesn't repeat the subject>

## Email body
<greeting>

<2-4 short paragraphs. First paragraph hooks with relevance to the reader. No paragraph longer than 3 sentences.>

<single clear CTA in its own line, e.g. "Book a 15-min demo →">

<sign-off>

# Constraints
- Total body under 150 words.
- One CTA, not many.
- No exclamation marks in the body.`,
    placeholders: [
      { name: 'industry', description: 'Industry or vertical', example: 'developer tools / DevOps' },
      { name: 'audience', description: 'Who the email is going to', example: 'engineering managers at Series B–D startups' },
      { name: 'goal', description: 'What you want the reader to do', example: 'Book a demo of our log analytics platform' },
      { name: 'offer', description: 'What you\'re offering', example: 'Free 30-day trial + migration help' },
      { name: 'tone', description: 'Voice style', example: 'Direct, technical, no fluff' },
      { name: 'must_include', description: 'Specific points to include', example: 'Our $0 ingestion pricing model' },
    ],
    estimatedTokens: 380,
    useCase: 'Outbound campaigns, product launch announcements, lifecycle emails. The 3-subject pattern lets you A/B test out of the gate.',
  },
  {
    id: 'gen-product-description',
    name: 'Product description',
    description: 'Write SEO-friendly product descriptions with features, benefits, and use cases.',
    category: 'generation',
    target: 'gpt',
    tags: ['product', 'ecommerce', 'seo', 'copy'],
    prompt: `# Role
You are an e-commerce copywriter. Write a product description for {{product_name}}.

# Product details
{{product_details}}

# Target customer
{{target_customer}}

# Constraints
- Length: {{length}} words.
- Search keywords to weave in naturally (don't force): {{keywords}}
- Avoid superlatives without evidence ("the best", "world-class").
- Lead with the customer benefit, not the spec.

# Output structure
**One-line tagline** (max 10 words, no period at end)

**Headline paragraph** (1 paragraph, 2-3 sentences, written for the customer's problem)

**Why you'll love it**
- <benefit-led bullet 1>
- <benefit-led bullet 2>
- <benefit-led bullet 3>

**Specs**
- <spec 1>
- <spec 2>
- (only include specs explicitly listed in product details — do not invent)

**Best for**
<1-2 sentence "who this is for", to help the customer self-qualify>`,
    placeholders: [
      { name: 'product_name', description: 'Name of the product', example: 'AeroFlow Pro Headphones' },
      { name: 'product_details', description: 'Raw spec sheet or feature list', example: 'Wireless, 40hr battery, ANC, $299, ships in matte black or sand' },
      { name: 'target_customer', description: 'Who this is for', example: 'remote workers who do 4+ hours of video calls per day' },
      { name: 'length', description: 'Total word count', example: '180' },
      { name: 'keywords', description: 'SEO keywords (comma-separated)', example: 'noise-cancelling, long battery, work-from-home' },
    ],
    estimatedTokens: 380,
    useCase: 'PDP (product detail page) copy at scale, marketplace listings, catalog migrations. The "don\'t invent specs" rule is what separates this from typical AI ecommerce slop.',
  },
  {
    id: 'gen-api-doc',
    name: 'API doc generator',
    description: 'Generate API endpoint documentation from a code snippet or spec.',
    category: 'generation',
    target: 'claude',
    tags: ['api', 'documentation', 'code', 'reference'],
    prompt: `Document the API endpoint defined below. Use the exact section structure given.

<endpoint_code>
{{endpoint_code}}
</endpoint_code>

<additional_context>
{{context}}
</additional_context>

Produce documentation with these sections (omit any section that doesn't apply):

## Endpoint
\`<METHOD> <PATH>\`

## Description
<2-3 sentences: what this endpoint does, who calls it, when>

## Authentication
<auth scheme required, or "None">

## Path parameters
| Name | Type | Required | Description |

## Query parameters
| Name | Type | Required | Default | Description |

## Request body
\`\`\`json
{
  // schema
}
\`\`\`

## Response (200)
\`\`\`json
{
  // schema
}
\`\`\`

## Errors
| Status | When |

## Example
\`\`\`bash
curl ...
\`\`\`

Rules:
- Use the EXACT names and types from the code. Don't rename or guess.
- If a field's purpose isn't clear from the code, write "<TODO: clarify>" instead of inventing.
- Show realistic example values in the request/response, not placeholders like "string".`,
    placeholders: [
      { name: 'endpoint_code', description: 'The handler code (Express, FastAPI, etc.) or OpenAPI fragment', example: 'app.post(\'/users/:id/avatar\', upload.single(\'image\'), async (req, res) => { ... })' },
      { name: 'context', description: 'Extra context (related models, auth, etc.)', example: 'Authenticated via Bearer JWT. User must own the avatar being uploaded.' },
    ],
    estimatedTokens: 420,
    useCase: 'Auto-generating reference docs as part of CI for projects without OpenAPI specs. The TODO marker is intentional — it surfaces ambiguities instead of inventing.',
  },
  {
    id: 'gen-test-cases',
    name: 'Test case generator',
    description: 'Generate test cases (happy path, edge, error) from a function spec.',
    category: 'generation',
    target: 'claude',
    tags: ['testing', 'unit-tests', 'code', 'qa'],
    prompt: `Generate a test suite for the function below.

<function>
{{function_code}}
</function>

<spec>
{{spec}}
</spec>

<framework>
{{framework}}
</framework>

Produce tests organized into these categories:

## Happy path
- 1-3 tests covering the most common, valid uses.

## Edge cases
- 3-6 tests for boundaries (empty, max, min, off-by-one, unicode, whitespace, etc.) and unusual-but-valid inputs.

## Error cases
- 2-5 tests for invalid input, wrong types, null/undefined, throws.

For each test:
1. Write a clear test name in the style of the chosen framework (e.g. \`it('returns 0 for empty array')\`).
2. Show the test code.
3. State the expected behavior in one comment line.

Rules:
- Use only the framework given. Don't introduce other libraries.
- If the spec is missing info for an edge case, write a comment "// SPEC GAP: <question>" instead of guessing.
- Don't test the framework or language itself; test the function's behavior.`,
    placeholders: [
      { name: 'function_code', description: 'The function under test', example: 'function chunk<T>(arr: T[], size: number): T[][] { ... }' },
      { name: 'spec', description: 'What the function is supposed to do', example: 'Split array into chunks of given size. Last chunk may be smaller. size must be > 0.' },
      { name: 'framework', description: 'Test framework', example: 'Jest + TypeScript' },
    ],
    estimatedTokens: 420,
    useCase: 'New-code test coverage, legacy code that lacks tests, TDD scaffolding. The "SPEC GAP" marker is the high-value output — it shows where the spec is underspecified.',
  },
  {
    id: 'gen-sql-from-question',
    name: 'SQL from natural language',
    description: 'Generate a SQL query from a question, given a schema.',
    category: 'generation',
    target: 'claude',
    tags: ['sql', 'nl-to-sql', 'database', 'query'],
    prompt: `You are a SQL generator. Produce a single SQL query that answers the user's question using ONLY the tables and columns in the schema.

<schema>
{{schema}}
</schema>

<dialect>
{{dialect}}
</dialect>

<question>
{{question}}
</question>

Rules:
- Use only tables/columns from the schema above. Do not invent.
- Prefer explicit JOIN ... ON over implicit comma joins.
- Always qualify columns with their table alias when multiple tables are involved.
- For dates, use the dialect's standard functions.
- If the question cannot be answered from the schema, respond with exactly: "Cannot answer: <which info is missing from schema>" — no SQL.

Output ONLY the SQL query (or the "Cannot answer" message). No markdown fences, no commentary.`,
    placeholders: [
      { name: 'schema', description: 'Database schema (CREATE TABLE statements or equivalent)', example: 'CREATE TABLE orders (id INT, customer_id INT, total NUMERIC, created_at TIMESTAMP);\nCREATE TABLE customers (id INT, name TEXT, country TEXT);' },
      { name: 'dialect', description: 'SQL dialect', example: 'PostgreSQL 15' },
      { name: 'question', description: 'Natural-language question', example: 'Total revenue per country in the last 30 days, descending' },
    ],
    estimatedTokens: 320,
    useCase: 'BI assistants, analytics chatbots, self-serve data tools. The "Cannot answer" escape hatch prevents the model from inventing tables that don\'t exist.',
  },

  // ============================================================
  // ANALYSIS (5 templates)
  // ============================================================
  {
    id: 'ana-rca',
    name: 'Root cause analysis',
    description: 'Walk through a 5-whys analysis on an incident or observed problem.',
    category: 'analysis',
    target: 'claude',
    tags: ['analysis', 'rca', '5-whys', 'incident'],
    prompt: `You are facilitating a root cause analysis on this issue. Use the 5-whys technique, then propose contributing factors and corrective actions.

<problem_statement>
{{problem}}
</problem_statement>

<known_facts>
{{facts}}
</known_facts>

Produce this structure:

## Problem
<restate in one precise sentence>

## 5-Whys chain
Why 1: <observable effect>
  → Because: <answer based on facts>
Why 2: <follow-up>
  → Because: <answer>
Why 3: ...
Why 4: ...
Why 5: ...

(If you can't get to 5 levels with the given facts, stop and write "Need more data: <what specifically>".)

## Contributing factors
- <factor 1, e.g. process, tooling, communication>
- <factor 2>

## Likely root cause
<one or two sentences>

## Corrective actions
- <immediate fix>
- <preventive measure>
- (each action should be specific and assignable)

## What we still don't know
- <gap 1>
- <gap 2>`,
    placeholders: [
      { name: 'problem', description: 'The problem or incident to analyze', example: 'Production API latency spiked to 4 seconds for 12 minutes on Tuesday 2:14pm.' },
      { name: 'facts', description: 'Known facts, timeline, telemetry summary', example: '- Database CPU was at 95% during the window\n- Deploy went out at 2:10pm\n- Affected only 1 of 3 regions' },
    ],
    estimatedTokens: 380,
    useCase: 'Post-incident reviews, blameless postmortems, debugging sessions. The "what we still don\'t know" section drives next investigative steps.',
  },
  {
    id: 'ana-swot',
    name: 'SWOT analysis',
    description: 'Structured SWOT analysis with evidence-tied claims.',
    category: 'analysis',
    target: 'gpt',
    tags: ['swot', 'strategy', 'analysis', 'business'],
    prompt: `# Role
You are a strategy analyst. Produce a SWOT analysis for the subject below, based ONLY on the context provided.

# Subject
{{subject}}

# Context
"""
{{context}}
"""

# Output format

## Strengths (internal, positive)
- <claim>. Evidence: <fact from context>
- (3-5 entries)

## Weaknesses (internal, negative)
- <claim>. Evidence: <fact from context>
- (3-5 entries)

## Opportunities (external, positive)
- <claim>. Evidence: <fact from context, including industry/market signals>
- (3-5 entries)

## Threats (external, negative)
- <claim>. Evidence: <fact from context>
- (3-5 entries)

## Strategic implications
- 2-4 bullets linking the SWOT to concrete strategic moves.

# Rules
- Every claim must be tied to evidence from the provided context. No outside knowledge.
- If the context lacks enough data for a quadrant, write "Insufficient context to assess" for that quadrant.
- Don't put external factors in strengths/weaknesses or internal factors in opportunities/threats.`,
    placeholders: [
      { name: 'subject', description: 'What you\'re analyzing', example: 'Our company\'s position in the AI observability market, mid-2024' },
      { name: 'context', description: 'Background info, data, internal docs', example: '- We have 50 customers, growing 12%/mo\n- Strong eng team but no enterprise sales motion\n- Datadog announced a competitive product last month' },
    ],
    estimatedTokens: 400,
    useCase: 'Strategy off-sites, fundraising prep, competitive positioning. The "evidence required" constraint prevents the SWOT from becoming a wishlist.',
  },
  {
    id: 'ana-tradeoff',
    name: 'Trade-off evaluator',
    description: 'Compare options against criteria with weights and produce a recommendation.',
    category: 'analysis',
    target: 'claude',
    tags: ['decision', 'tradeoff', 'analysis', 'evaluation'],
    prompt: `You are helping evaluate a decision. Score each option against the criteria, then recommend.

<decision>
{{decision}}
</decision>

<options>
{{options}}
</options>

<criteria>
{{criteria}}
</criteria>

For each criterion-option pair, give a score from 1 (poor) to 5 (excellent) with a brief justification.

Produce:

## Scoring matrix
| Criterion | Weight | <Option A> | <Option B> | <Option C> |
|-----------|--------|------------|------------|------------|
| <name>    | <w>    | <score> · <brief reason> | <score> · <reason> | ... |

## Weighted totals
- Option A: <sum>
- Option B: <sum>
- Option C: <sum>

## Recommendation
<which option, in one sentence>

## Key risks of this choice
- <risk 1>
- <risk 2>

## What would change the recommendation
- <condition under which a different option wins>

Rules:
- Be specific in justifications. "Faster" is bad; "ships ~3 weeks earlier per timeline" is good.
- If you don't have data to score a cell, mark it as "?" and call it out under Key risks.`,
    placeholders: [
      { name: 'decision', description: 'The decision being made', example: 'Which database to use for our new analytics service' },
      { name: 'options', description: 'Options being compared, with brief descriptions', example: '- A: PostgreSQL (familiar, mature)\n- B: ClickHouse (columnar, fast for OLAP)\n- C: DuckDB (embedded, simpler ops)' },
      { name: 'criteria', description: 'Decision criteria with weights', example: '- Query latency at 1B rows (weight 5)\n- Operational complexity (weight 3)\n- Team familiarity (weight 2)' },
    ],
    estimatedTokens: 420,
    useCase: 'Architecture decisions, vendor selection, hiring panels. The weighted matrix forces tradeoffs to be explicit instead of letting "feel" dominate.',
  },
  {
    id: 'ana-risk-assessment',
    name: 'Risk assessment',
    description: 'Identify risks with likelihood, impact, and mitigation suggestions.',
    category: 'analysis',
    target: 'claude',
    tags: ['risk', 'analysis', 'mitigation', 'security'],
    prompt: `You are conducting a risk assessment.

<context>
{{context}}
</context>

<focus_area>
{{focus_area}}
</focus_area>

Identify the most material risks. For each risk, evaluate likelihood and impact independently.

## Risks

For each risk (5-10 total, in descending order of priority):

### <Risk title>
- **Description**: <1-2 sentences>
- **Likelihood**: <Low | Medium | High> — <one line of reasoning>
- **Impact**: <Low | Medium | High> — <one line of reasoning, including who/what is affected>
- **Priority**: <Likelihood × Impact, mapped to: Low / Medium / High / Critical>
- **Mitigations**:
  - <specific, actionable mitigation>
  - <another>
- **Detection**: <how you'd notice this risk materializing>

## Top 3 to address now
1. <risk> — because <reason this is most urgent>
2. <risk>
3. <risk>

Rules:
- Be specific. "Things could break" is not a risk; "Database failover takes 8+ minutes during region outage" is.
- Mitigations must be concrete (what action, by whom, ideally measurable).
- If you lack info to assess likelihood/impact, mark as "Unknown — needs <what data>".`,
    placeholders: [
      { name: 'context', description: 'Background — system, project, business situation', example: 'Migrating customer auth from session cookies to JWT, target launch next quarter, 2M MAU' },
      { name: 'focus_area', description: 'Which risks to focus on', example: 'Security and operational risks during the migration window' },
    ],
    estimatedTokens: 440,
    useCase: 'Pre-launch readiness reviews, security reviews, board risk reporting. Forcing specificity is the whole point — vague risks aren\'t actionable.',
  },
  {
    id: 'ana-data-summary',
    name: 'Data table summary',
    description: 'Analyze a small dataset and summarize trends, outliers, and recommendations.',
    category: 'analysis',
    target: 'gpt',
    tags: ['data', 'analysis', 'trends', 'tabular'],
    prompt: `# Role
You are a data analyst. Summarize the dataset and surface what matters.

# Dataset
"""
{{data}}
"""

# Context (what's this for?)
{{context}}

# Output

## Overview
<2-3 sentences: what the data shows at a glance>

## Trends
- <trend 1: directional, with magnitude. e.g. "Revenue up 18% MoM in last 3 months">
- <trend 2>

## Outliers
- <outlier 1: which data point, how far from norm, possible explanation if context supports one>
- <outlier 2>

## Anomalies (unexpected given context)
- <e.g. "Customer count grew but revenue/customer dropped 22%">

## Recommended next questions
- <question that would deepen understanding>
- <question that would unblock a decision>

# Rules
- Numbers, not adjectives. "Significantly grew" is bad; "grew 38%" is good.
- Don't extrapolate beyond the data. If 3 months are shown, don't predict year-end.
- If the dataset is too small or noisy for a section, say "Insufficient data to identify [trends/outliers/etc.]" rather than padding.`,
    placeholders: [
      { name: 'data', description: 'A small table (CSV, markdown table, or JSON array)', example: 'month,revenue,customers\n2024-01,12500,42\n2024-02,15200,48\n2024-03,18100,55' },
      { name: 'context', description: 'What you want to learn or decide', example: 'Deciding whether to increase ad spend next quarter' },
    ],
    estimatedTokens: 320,
    useCase: 'Embedded in BI dashboards, quick analyst back-of-envelope reviews, weekly metric standups. The "numbers not adjectives" rule is the difference between useful and useless.',
  },

  // ============================================================
  // CODE (5 templates)
  // ============================================================
  {
    id: 'code-review-security',
    name: 'Code review (security focus)',
    description: 'Review code with a focus on security vulnerabilities, with severity ratings.',
    category: 'code',
    target: 'claude',
    tags: ['code', 'review', 'security', 'audit'],
    prompt: `You are a security-focused code reviewer. Review the code below for security issues. Be thorough but precise — false positives cost reviewer time.

<code language="{{language}}">
{{code}}
</code>

<context>
{{context}}
</context>

For each finding, output:

### <Short title>
- **Severity**: Critical | High | Medium | Low | Info
- **Category**: <e.g. injection, auth, secrets, crypto, deserialization, ssrf, race, dos>
- **Location**: line(s) <N> (quote the relevant snippet)
- **Issue**: <2-3 sentence explanation>
- **Exploit scenario**: <how an attacker could leverage this>
- **Remediation**: <specific code-level fix or refactor>
- **Confidence**: High | Medium | Low

Order findings by severity (Critical first). If you find none, respond with:
"No security issues identified at the reviewed code path. Note: this review is bounded to the snippet provided and does not account for issues elsewhere in the system."

Rules:
- Only flag real issues. Don't flag style preferences or non-security concerns.
- Cite specific lines/snippets — vague findings are not actionable.
- If unsure about exploitability, mark Confidence: Low and explain.`,
    placeholders: [
      { name: 'language', description: 'Programming language', example: 'python' },
      { name: 'code', description: 'The code under review', example: 'def search(q): return db.execute(f"SELECT * FROM items WHERE name LIKE \'%{q}%\'")' },
      { name: 'context', description: 'Where this runs, who calls it, what data flows through', example: 'Public HTTP endpoint. q comes from a query string parameter, no auth required.' },
    ],
    estimatedTokens: 380,
    useCase: 'Pre-merge security gating, periodic audits of critical modules, security training. Severity + confidence make findings prioritizable.',
  },
  {
    id: 'code-refactor-with-tests',
    name: 'Refactor with tests',
    description: 'Refactor code for clarity and add tests to verify behavior preservation.',
    category: 'code',
    target: 'claude',
    tags: ['code', 'refactor', 'tests', 'quality'],
    prompt: `Refactor the function below for {{goal}}. Preserve its observable behavior exactly. Then write tests demonstrating the refactor doesn't change behavior.

<original_code language="{{language}}">
{{code}}
</original_code>

<refactor_goal>
{{goal}}
</refactor_goal>

Produce:

## Refactored code
\`\`\`{{language}}
<the refactored version>
\`\`\`

## What changed and why
- <change 1>: <reason tied to the goal>
- <change 2>: <reason>
- (each change as a single bullet)

## Behavior-preserving tests
\`\`\`{{language}}
<tests using {{test_framework}} that exercise:
  - 2 happy-path inputs
  - 2 edge cases (empty/null/boundary)
  - 1 case for any input that exhibits the original bug if there is one>
\`\`\`

## What I did NOT change (and why)
- <thing that might look refactor-able but I left alone>: <reason>

Rules:
- Don't change public API signatures unless the goal explicitly asks for it.
- Don't introduce new dependencies unless necessary.
- If the original code has a bug, call it out and explicitly choose whether to fix-in-place or keep behavior.`,
    placeholders: [
      { name: 'language', description: 'Programming language', example: 'typescript' },
      { name: 'code', description: 'The code to refactor', example: 'function p(x) { let r=0; for(let i=0;i<x.length;i++){ if(x[i]>0) r+=x[i]; } return r; }' },
      { name: 'goal', description: 'Refactor goal', example: 'readability and type safety; this is the hottest function on a slow page' },
      { name: 'test_framework', description: 'Test framework to use', example: 'Vitest' },
    ],
    estimatedTokens: 420,
    useCase: 'Reducing tech debt safely, preparing legacy code for new features, teaching team members refactor patterns. The "what I did NOT change" section forces deliberate scope.',
  },
  {
    id: 'code-translate-language',
    name: 'Translate language A to B',
    description: 'Port code from one programming language to another, idiomatically.',
    category: 'code',
    target: 'claude',
    tags: ['code', 'translation', 'porting', 'languages'],
    prompt: `Translate the code from {{from_language}} to {{to_language}}. The translation should be idiomatic in the target language, not a 1:1 transliteration.

<source language="{{from_language}}">
{{source_code}}
</source>

<target_constraints>
{{target_constraints}}
</target_constraints>

Produce:

## Translated code
\`\`\`{{to_language}}
<idiomatic version>
\`\`\`

## Translation notes
- **Idiomatic adaptations**: <bullets — places where a direct port would be unidiomatic, and what you did instead>
- **Standard library swaps**: <e.g. "Python's collections.Counter → Map<K, number> with manual counting in TS">
- **Concurrency model differences**: <if the source uses concurrency primitives that don't map 1:1>
- **Error handling differences**: <e.g. "Python exceptions → Result<T, E> pattern in Rust">

## Caveats
- <subtle behavioral differences the user should know about>
- <missing equivalents and how I handled them>

Rules:
- Don't blindly mirror the source structure if the target language has a clearer pattern.
- Don't introduce new library dependencies unless the target's stdlib lacks an obvious equivalent.
- Preserve variable/function names where they're semantic; rename only for case-style conformance (e.g. snake_case → camelCase).`,
    placeholders: [
      { name: 'from_language', description: 'Source language', example: 'Python' },
      { name: 'to_language', description: 'Target language', example: 'Go' },
      { name: 'source_code', description: 'Code to translate', example: 'def merge(a, b): return sorted(a + b)' },
      { name: 'target_constraints', description: 'Constraints on the target (style, stdlib only, etc.)', example: 'Standard library only. Match the existing project\'s gofmt/golint conventions.' },
    ],
    estimatedTokens: 400,
    useCase: 'Multi-language SDK ports, prototype-to-production rewrites, learning a new language by translating known code. The "idiomatic" framing avoids the common 1:1-transliteration trap.',
  },
  {
    id: 'code-bug-fix',
    name: 'Bug fix proposal',
    description: 'Diagnose a bug from a description + code and propose a minimal fix.',
    category: 'code',
    target: 'claude',
    tags: ['code', 'bug', 'debugging', 'fix'],
    prompt: `You are debugging an issue. Analyze the code and propose a minimal, targeted fix.

<bug_report>
{{bug_report}}
</bug_report>

<code language="{{language}}">
{{code}}
</code>

<observed_behavior>
{{observed}}
</observed_behavior>

<expected_behavior>
{{expected}}
</expected_behavior>

Produce:

## Diagnosis
<2-4 sentences identifying the root cause. If you have multiple hypotheses, list them in order of likelihood.>

## Confidence in diagnosis
<High | Medium | Low> — <one line of reasoning>

## Proposed fix
\`\`\`{{language}}
<minimal diff or full fixed function. Mark changed lines with comments.>
\`\`\`

## Why this fixes it
<2-3 sentences>

## Regression test
\`\`\`{{language}}
<a test that would have caught the original bug>
\`\`\`

## Other places that may have the same bug
- <file or function where the same pattern appears, if any>

Rules:
- Smallest change that fixes the issue. Don't refactor adjacent code.
- If you're not confident, suggest a diagnostic (logging, debugger) rather than guessing at a fix.
- If the bug report is ambiguous, list the assumptions you're making at the top.`,
    placeholders: [
      { name: 'bug_report', description: 'How the bug was reported', example: 'Users report that dates in the export sometimes show as the wrong day in PDT.' },
      { name: 'language', description: 'Programming language', example: 'javascript' },
      { name: 'code', description: 'The code where the bug lives', example: 'function fmt(d) { return new Date(d).toISOString().slice(0, 10); }' },
      { name: 'observed', description: 'What actually happens', example: '2024-03-15 input shows as 2024-03-14 in exports for users in PDT.' },
      { name: 'expected', description: 'What should happen', example: 'Date should always reflect the user\'s local calendar date.' },
    ],
    estimatedTokens: 420,
    useCase: 'GitHub issue triage, on-call debugging, code review with reported bugs. The "other places with same bug" line catches systemic issues.',
  },
  {
    id: 'code-explain',
    name: 'Code explainer',
    description: 'Explain what a code snippet does at a chosen depth.',
    category: 'code',
    target: 'any',
    tags: ['code', 'explain', 'documentation', 'learning'],
    prompt: `Explain the following code for {{audience}}.

Code ({{language}}):
"""
{{code}}
"""

Explanation depth: {{depth}}

Format:

## What it does (high-level)
<1-3 sentences, no jargon beyond what {{audience}} would know>

## How it works (step by step)
1. <step>
2. <step>
3. ...

## Concepts worth knowing
- <concept 1>: <1 sentence>
- (only include if the depth setting calls for it)

## Common pitfalls
- <thing that might surprise someone modifying this code>

## When you might modify it
- <reason to change> → <what to change>

Rules:
- Match your vocabulary to the audience. For "junior dev", explain idioms; for "senior dev", skip them.
- Don't translate the code back to English line-by-line. Group logically related lines.
- If a part of the code seems wrong or unidiomatic, mention it under "pitfalls".`,
    placeholders: [
      { name: 'audience', description: 'Who you\'re explaining to', example: 'a junior developer comfortable with basic JavaScript' },
      { name: 'language', description: 'Programming language', example: 'javascript' },
      { name: 'code', description: 'The code to explain', example: 'const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };' },
      { name: 'depth', description: 'How deep to go', example: 'intermediate — explain closures and timing, skip basics' },
    ],
    estimatedTokens: 280,
    useCase: 'Onboarding to a codebase, code review training, generating inline docs from legacy code. Audience-tuned explanations beat generic ones.',
  },

  // ============================================================
  // TRANSLATION (3 templates)
  // ============================================================
  {
    id: 'tr-localized',
    name: 'Localized translation',
    description: 'Translate text into a target locale, preserving meaning and adapting cultural references.',
    category: 'translation',
    target: 'gemini',
    tags: ['translation', 'localization', 'i18n'],
    prompt: `Translate the text from {{source_language}} to {{target_locale}}.

Source text:
"""
{{text}}
"""

Translation guidance:
- Target locale: {{target_locale}} (e.g. "es-MX" implies Mexican Spanish conventions, not Spain Spanish)
- Register: {{register}} (formal / informal / neutral)
- Audience: {{audience}}
- Adapt cultural references, units, and date formats to the target locale when the original meaning is preserved.
- Preserve proper nouns, brand names, and technical terms unless they have an established localized form.
- If a phrase has no equivalent and would be confusing if translated literally, translate the meaning and add a brief inline note in parentheses.

Output sections:

## Translation
<the translated text>

## Translator notes
- <any phrase where you made a judgment call>: <what and why>
- <any term left untranslated>: <reason>
- (omit this section if no notes needed)`,
    placeholders: [
      { name: 'source_language', description: 'Source language', example: 'English (US)' },
      { name: 'target_locale', description: 'BCP 47 locale code or language + region', example: 'fr-CA (Canadian French)' },
      { name: 'register', description: 'Tone register', example: 'formal' },
      { name: 'audience', description: 'Audience reading the translation', example: 'Customer support agents at a Quebec call center' },
      { name: 'text', description: 'The text to translate', example: 'We\'ll be in touch by end of business Friday.' },
    ],
    estimatedTokens: 280,
    useCase: 'Marketing copy localization, support content for multiple regions, app strings. Notes about judgment calls let translators-of-record verify quickly.',
  },
  {
    id: 'tr-tone-preserving',
    name: 'Tone-preserving translation',
    description: 'Translate while preserving voice — humor, sarcasm, formality.',
    category: 'translation',
    target: 'claude',
    tags: ['translation', 'tone', 'voice', 'style'],
    prompt: `Translate the text below from {{source}} to {{target}}, preserving the original tone and voice as faithfully as possible.

<source_text>
{{text}}
</source_text>

<original_tone>
{{tone_description}}
</original_tone>

Steps:
1. First, briefly identify the tonal markers in the original (idioms, sentence rhythm, formality cues, humor mechanism, etc.).
2. Then produce a translation that achieves the same effect in {{target}}, even if it requires rephrasing.
3. Note any unavoidable tonal shifts.

Output:

## Original tone — markers I'm preserving
- <marker 1>
- <marker 2>

## Translation
<translated text>

## Tonal compromises (if any)
- <thing I couldn't preserve>: <why, and how the translation compensates>

Rules:
- A literal but tonally flat translation is a failure. Prefer expressive equivalents.
- Don't add humor or formality not present in the original.
- Match sentence-length rhythm where it carries voice (e.g. short punchy sentences should stay short).`,
    placeholders: [
      { name: 'source', description: 'Source language', example: 'English' },
      { name: 'target', description: 'Target language', example: 'Japanese' },
      { name: 'text', description: 'Text to translate', example: 'Well, that\'s one way to do it. I mean — it works, technically.' },
      { name: 'tone_description', description: 'How the source feels', example: 'Dry, sarcastic, with mild reluctance. American workplace voice.' },
    ],
    estimatedTokens: 320,
    useCase: 'Translating creative writing, marketing voice, character dialogue. Literal translation kills voice — explicit tone preservation is the lever.',
  },
  {
    id: 'tr-technical',
    name: 'Technical translation',
    description: 'Translate technical documentation, preserving terms and code blocks.',
    category: 'translation',
    target: 'gemini',
    tags: ['translation', 'technical', 'docs', 'i18n'],
    prompt: `Translate the technical documentation from {{source}} to {{target}}.

Source:
"""
{{text}}
"""

Glossary (translate consistently):
{{glossary}}

Rules:
- Do NOT translate: code blocks, code identifiers (variable names, function names, file paths), command-line flags, error messages that are returned verbatim by software, English-only proper nouns.
- Translate code COMMENTS and prose inside code blocks (e.g. \`// comment\`).
- Apply the glossary consistently. If a term isn't in the glossary and lacks an established translation, keep the English term in parentheses on first use: e.g. "rétroaction (feedback)".
- Preserve markdown structure exactly (headers, bullets, code fences, links).
- Preserve link URLs unchanged; translate link anchor text.

Output the translated documentation only, no preamble.`,
    placeholders: [
      { name: 'source', description: 'Source language', example: 'English' },
      { name: 'target', description: 'Target language', example: 'German' },
      { name: 'text', description: 'Technical text including markdown and code', example: '## Installation\n\nRun `npm install` and then start the server.' },
      { name: 'glossary', description: 'Term mappings the translator should use', example: 'server → Server\nrequest → Anfrage\ndependency → Abhängigkeit' },
    ],
    estimatedTokens: 280,
    useCase: 'Localizing SDK docs, technical blog posts, README files. The "don\'t translate code" rule is what separates this from generic translation — saves hours of QA.',
  },

  // ============================================================
  // CONVERSATION (3 templates)
  // ============================================================
  {
    id: 'conv-support-classifier',
    name: 'Customer support classifier',
    description: 'Classify and route a support message: intent, urgency, sentiment, suggested next step.',
    category: 'conversation',
    target: 'gpt',
    tags: ['support', 'classification', 'routing', 'conversation'],
    prompt: `# Role
You are a support triage assistant for {{product_name}}.

# Categories
{{categories}}

# Urgency rubric
- urgent: customer is blocked, threatening to churn, reporting outage, security issue, or angry
- normal: standard question or non-blocking issue
- low: feedback, feature request, general inquiry

# Input
Customer message: """{{message}}"""
{{additional_context}}

# Output (JSON only)
{
  "category": "<from list above>",
  "urgency": "urgent | normal | low",
  "sentiment": "positive | neutral | frustrated | angry",
  "summary": "<one sentence — what the customer wants>",
  "suggested_action": "<concrete next step, e.g. 'Route to billing team' or 'Auto-reply with KB article about API rate limits'>",
  "kb_articles_to_check": ["<topic1>", "<topic2>"],
  "needs_human": <true | false — true if urgency is urgent OR sentiment is angry OR category is anything sensitive (billing dispute, account access, complaint)>
}`,
    placeholders: [
      { name: 'product_name', description: 'Product or service name', example: 'CloudBase, a database hosting service' },
      { name: 'categories', description: 'List of support categories with descriptions', example: '- billing: invoices, payments, plan changes\n- technical: bugs, errors, integration issues\n- account: login, password, access\n- feature_request: asking for new capability\n- feedback: praise or unstructured comments' },
      { name: 'message', description: 'The customer\'s message', example: 'Hi — I was charged twice for last month. Can you help?' },
      { name: 'additional_context', description: 'Optional context (account info, history)', example: 'Customer is on the $99/mo Pro plan, has been a customer for 14 months.' },
    ],
    estimatedTokens: 300,
    useCase: 'First-touch automation for support inboxes. The `needs_human` flag prevents urgent issues from being auto-replied. The KB hints speed up human responders.',
  },
  {
    id: 'conv-faq-fallback',
    name: 'FAQ answerer with fallback',
    description: 'Answer from a FAQ corpus with a clean fallback when no match exists.',
    category: 'conversation',
    target: 'claude',
    tags: ['faq', 'conversation', 'support', 'fallback'],
    prompt: `You are a customer-facing assistant for {{product_name}}. Answer the user's question using ONLY the FAQ entries below. If no FAQ entry covers the question, politely defer to a human.

<faq>
{{faq_entries}}
</faq>

<user_question>
{{question}}
</user_question>

Decision logic:
1. If a single FAQ entry directly answers the question → use it, paraphrase naturally, and end with: "Was that helpful?"
2. If multiple entries are relevant → combine them in a coherent answer.
3. If the FAQ partially addresses the question but key information is missing → answer the part you can, then say: "I don't have details on [the missing part]. Want me to connect you with a teammate?"
4. If no FAQ entry is relevant → respond with: "I don't have an answer to that in my reference materials. Let me connect you with a teammate who can help. Is that okay?"

Rules:
- Never invent details not in the FAQ.
- Don't quote FAQ entries verbatim unless they're already conversational. Paraphrase.
- Keep responses under 80 words unless the FAQ requires more detail.
- Tone: {{tone}}.`,
    placeholders: [
      { name: 'product_name', description: 'Product the assistant supports', example: 'ShipFast, a logistics tracking app' },
      { name: 'faq_entries', description: 'FAQ entries (Q + A pairs)', example: 'Q: How do I cancel my subscription?\nA: From Settings > Billing, click "Cancel plan".\n\nQ: What payment methods are accepted?\nA: Visa, Mastercard, Amex, and ACH for annual plans.' },
      { name: 'question', description: 'Customer\'s question', example: 'Do you accept PayPal?' },
      { name: 'tone', description: 'Voice and style', example: 'Warm, brief, professional' },
    ],
    estimatedTokens: 280,
    useCase: 'First-line chatbot for self-serve products. The explicit fallback path is what makes this safe — without it, the bot will confidently make things up.',
  },
  {
    id: 'conv-followup-questions',
    name: 'Clarifying question generator',
    description: 'Generate clarifying questions when a user request is underspecified.',
    category: 'conversation',
    target: 'any',
    tags: ['conversation', 'clarification', 'questions'],
    prompt: `A user has submitted a request that is underspecified. Generate clarifying questions to ask them before proceeding.

User request:
"""
{{request}}
"""

Context (what kind of task this is, what info would be needed):
{{context}}

For each ambiguity in the request, produce one question. Then prioritize: which question would unblock the most progress if answered?

Output:

## Ambiguities I see
- <ambiguity 1>: <what info is missing>
- <ambiguity 2>: ...

## Clarifying questions (in priority order)
1. **Most important**: <question phrased so it's easy to answer>
2. <question>
3. <question>

(Limit to {{max_questions}} questions — don't overwhelm.)

## What I'd do if you don't have time to answer all
<one-sentence: which 1-2 questions are absolutely essential vs. which I could make a reasonable assumption about>

Rules:
- Phrase questions to be answerable without research where possible.
- Don't ask about preferences when there's an obvious default; just state the default and ask only if they want to change it.
- Don't ask multiple things in one question.`,
    placeholders: [
      { name: 'request', description: 'The user\'s under-specified request', example: 'Build me a landing page for our new product.' },
      { name: 'context', description: 'What kind of task this is and what dimensions matter', example: 'Web page design — need to know audience, copy direction, brand assets, hosting, timeline' },
      { name: 'max_questions', description: 'Max number of questions to ask', example: '5' },
    ],
    estimatedTokens: 260,
    useCase: 'Onboarding flows, freelancer/agency project intake, AI agent task confirmation. The prioritization step is critical — most "clarifying questions" lists are too long.',
  },

  // ============================================================
  // PLANNING (3 templates)
  // ============================================================
  {
    id: 'plan-project-from-goal',
    name: 'Project plan from goal',
    description: 'Convert a high-level goal into a phased project plan with milestones.',
    category: 'planning',
    target: 'gpt',
    tags: ['planning', 'project', 'milestones', 'timeline'],
    prompt: `# Role
You are a project planner. Convert the goal into a phased plan.

# Goal
{{goal}}

# Constraints
- Timeline: {{timeline}}
- Team size: {{team}}
- Known constraints: {{constraints}}

# Output

## Definition of done
<2-3 bullets: how we know the project is complete>

## Phases

### Phase 1: <name> (Week <N>-<M>)
**Objective**: <1 sentence>
**Deliverables**:
- <deliverable>
**Owner**: <role or "TBD">
**Dependencies**: <prior phases or external blockers>

(Repeat for each phase. Aim for 3-5 phases for projects under 3 months, 5-8 for longer.)

## Critical path
<which sequence of phases must run sequentially, and which can parallelize>

## Top 3 risks to the timeline
- <risk>: <suggested mitigation>

## Decisions to make in the first week
- <decision 1>: <by whom>
- <decision 2>: <by whom>

# Rules
- Be concrete about deliverables. "Research solutions" is not a deliverable; "Comparison doc with 3 vendor options and recommendation" is.
- If the timeline seems unrealistic for the scope, say so explicitly in a "Reality check" section and propose a scope reduction OR timeline extension.`,
    placeholders: [
      { name: 'goal', description: 'High-level goal', example: 'Launch internal LLM observability dashboard to track API costs and latency across teams' },
      { name: 'timeline', description: 'Available timeline', example: '6 weeks' },
      { name: 'team', description: 'Team composition and size', example: '2 engineers (1 senior, 1 mid), 1 PM, 0.5 designer' },
      { name: 'constraints', description: 'Known limits, dependencies, must-haves', example: 'Must integrate with existing Datadog; cannot store prompt content (compliance)' },
    ],
    estimatedTokens: 380,
    useCase: 'Quick project scoping at kickoff, evaluating proposed timelines, sprint zero. The "reality check" clause is the most valuable output for over-ambitious goals.',
  },
  {
    id: 'plan-meeting-agenda',
    name: 'Meeting agenda from objectives',
    description: 'Build a time-boxed meeting agenda from a list of objectives.',
    category: 'planning',
    target: 'any',
    tags: ['meeting', 'agenda', 'planning'],
    prompt: `Create a time-boxed agenda for a {{duration}}-minute meeting with {{participant_count}} participants.

Meeting purpose:
"""
{{purpose}}
"""

Objectives (what must come out of this meeting):
{{objectives}}

Constraints:
- {{constraints}}

Produce:

## Pre-read (what attendees should review before)
- <doc/data they need>: <why>
- (3 items max; keep this short or they won't do it)

## Agenda
| Time | Topic | Owner | Output |
|------|-------|-------|--------|
| 0:00-0:05 | <topic> | <person/role> | <decision/discussion/info-share> |
| 0:05-... | ...   |       |        |

Build the agenda so:
- The first 5 min is context-setting, not deep work.
- High-stakes decisions are in the first half (people fade in long meetings).
- 5 min is reserved at the end for "next steps and owners".
- Time per topic reflects its importance.

## Decisions to make in this meeting
- <decision 1>
- <decision 2>

## Out of scope (parking lot)
- <thing that may come up but shouldn't derail this meeting>

# Rules
- If the objectives can't realistically fit in the time, say so and propose splitting into multiple meetings.
- Each agenda item should have a clear "output" — discussion, decision, alignment, or info-share.`,
    placeholders: [
      { name: 'duration', description: 'Meeting length in minutes', example: '45' },
      { name: 'participant_count', description: 'Number of attendees', example: '6' },
      { name: 'purpose', description: 'Why this meeting exists', example: 'Decide whether to migrate to the new auth service this quarter or next.' },
      { name: 'objectives', description: 'Concrete outcomes', example: '- Align on migration risks\n- Decide on quarter\n- Identify migration owner' },
      { name: 'constraints', description: 'Known constraints', example: 'CTO can only attend the first 20 min; eng manager is presenting data' },
    ],
    estimatedTokens: 320,
    useCase: 'Recurring meetings that drift, important decisions that need structure, cross-functional kickoffs. The "out of scope" parking lot prevents derailment.',
  },
  {
    id: 'plan-okr-from-strategy',
    name: 'OKRs from strategy',
    description: 'Translate a strategic theme into quarterly OKRs.',
    category: 'planning',
    target: 'gpt',
    tags: ['okr', 'planning', 'strategy', 'quarterly'],
    prompt: `# Role
You're a strategy operator helping turn a theme into measurable OKRs for {{quarter}}.

# Strategic theme
"""
{{theme}}
"""

# Team / function
{{team}}

# Constraints
- {{constraints}}

# Output

Produce 2-4 Objectives. For each:

## O<N>: <Objective — qualitative, ambitious, inspirational>

### Key Results
- KR<N>.1: <metric + baseline + target by end of {{quarter}}>
- KR<N>.2: <metric + baseline + target>
- KR<N>.3: <metric + baseline + target>

### Why this KR set
<2-3 sentences: how achieving these KRs proves the objective>

### Likely blockers
- <blocker>

### Out-of-scope (intentional)
- <thing this objective is deliberately NOT trying to move>

# Rules for KRs
- Every KR must have a number AND a unit (%, count, $, etc.)
- Every KR must have a baseline (current state) AND a target (end-of-quarter state).
- If you don't know the baseline, write "Baseline: TBD — to be measured by <date>" — don't invent.
- Prefer outcome metrics (revenue, conversions, retention) over output metrics (#features shipped, #docs written).
- 2-4 KRs per objective. More dilutes focus.`,
    placeholders: [
      { name: 'quarter', description: 'The target quarter', example: 'Q3 2024 (Jul-Sep)' },
      { name: 'theme', description: 'Strategic theme or area', example: 'Reduce time-to-first-value for new signups so we improve activation conversion' },
      { name: 'team', description: 'Team and its scope', example: 'Growth engineering, 4 people, owns onboarding and activation' },
      { name: 'constraints', description: 'Known constraints', example: 'Can\'t change the signup flow until legal review of new ToS clears (mid-July)' },
    ],
    estimatedTokens: 380,
    useCase: 'Quarterly planning, OKR refinement, alignment sessions. The "out-of-scope intentional" line is what prevents OKR sprawl.',
  },

  // ============================================================
  // CREATIVE (3 templates)
  // ============================================================
  {
    id: 'cre-brainstorm-constraints',
    name: 'Brainstorm with constraints',
    description: 'Generate diverse ideas under explicit constraints, with brief evaluation.',
    category: 'creative',
    target: 'any',
    tags: ['brainstorm', 'creative', 'ideation'],
    prompt: `Generate creative ideas for this brief.

Brief:
"""
{{brief}}
"""

Constraints (hard — every idea must respect these):
{{hard_constraints}}

Constraints (soft — ideas can stretch these but should note when they do):
{{soft_constraints}}

Generate {{num_ideas}} distinct ideas. They should span different "angles" — don't give 10 variations of the same idea.

For each idea:

### Idea <N>: <punchy name>
- **One-liner**: <what it is in one sentence>
- **Why it could work**: <strongest argument for>
- **Why it might not**: <strongest argument against>
- **Effort to test**: <Low | Medium | High>
- **Most similar prior art** (if any): <reference>

After all ideas:

## Recommended next step
<which idea to test first and how — typically the lowest-effort/highest-learning one>

# Rules
- No idea should be just a rephrasing of the brief.
- If the constraints make ideation hard, say so — but still produce {{num_ideas}} attempts.
- Don't pad — terse beats verbose for ideas at this stage.`,
    placeholders: [
      { name: 'brief', description: 'What you\'re ideating on', example: 'Ways to reduce churn for our $9/mo consumer photo app' },
      { name: 'hard_constraints', description: 'Non-negotiables', example: '- No changes to the pricing\n- Must work within current 3-person team\n- Must launch within 6 weeks' },
      { name: 'soft_constraints', description: 'Strong preferences but flexible', example: '- Prefer low-engineering-cost options\n- Avoid pushy retention tactics' },
      { name: 'num_ideas', description: 'How many ideas to produce', example: '8' },
    ],
    estimatedTokens: 380,
    useCase: 'Off-site ideation, sprint planning, marketing campaign kickoff. The "effort to test" rating turns brainstorms into actionable bets.',
  },
  {
    id: 'cre-persona-copy',
    name: 'Persona-driven copy',
    description: 'Write copy in the voice of a defined persona, for a specific audience.',
    category: 'creative',
    target: 'claude',
    tags: ['copy', 'creative', 'persona', 'voice'],
    prompt: `You are writing as a specific persona for a specific audience.

<persona>
{{persona}}
</persona>

<audience>
{{audience}}
</audience>

<task>
{{task}}
</task>

<reference_voice>
{{voice_examples}}
</reference_voice>

Steps:
1. First, identify 3-5 distinctive voice markers from the reference voice examples (vocabulary, sentence rhythm, recurring rhetorical moves, what they don't say).
2. Produce the copy.
3. Briefly point out where you used each marker.

Output:

## Voice markers I'm using
- <marker 1>: <example phrasing from reference>
- <marker 2>
- ...

## Copy
<the actual deliverable>

## Where I used the markers (one-line audit)
- <marker> → <where in the copy>

# Rules
- Don't break character. Even small word choices (formal/casual contractions, em-dashes vs commas) must match the persona.
- Don't quote the reference examples verbatim — emulate, don't copy.
- If the task conflicts with the persona (e.g., a sarcastic persona writing a sincere condolence), call out the tension and propose how to reconcile.`,
    placeholders: [
      { name: 'persona', description: 'Who you\'re writing as — brand voice, character, founder', example: 'Direct, technical founder voice — concise, evidence-driven, willing to be a bit snarky about competitors' },
      { name: 'audience', description: 'Who reads this', example: 'CTOs and senior engineers evaluating our product' },
      { name: 'task', description: 'What to write', example: 'A LinkedIn post announcing our 2.0 release' },
      { name: 'voice_examples', description: 'Sample writing in the target voice (1-3 short examples)', example: 'Example 1: "We shipped sub-second cold starts. The trick: ditch the JVM. Yes, it\'s as fun as it sounds."\nExample 2: ...' },
    ],
    estimatedTokens: 420,
    useCase: 'Brand voice consistency at scale, ghostwriting, character-consistent UGC. The "voice markers" audit is what makes this auditable.',
  },
  {
    id: 'cre-story-from-prompt',
    name: 'Short story from prompt',
    description: 'Write a short story with structure (setup, escalation, resolution).',
    category: 'creative',
    target: 'claude',
    tags: ['story', 'fiction', 'creative', 'narrative'],
    prompt: `Write a short story based on the prompt below.

<story_prompt>
{{prompt}}
</story_prompt>

<constraints>
- Length: {{length}} words
- Genre / tone: {{genre}}
- POV: {{pov}}
- Setting: {{setting}}
- Must include: {{must_include}}
- Must avoid: {{must_avoid}}
</constraints>

Structure your draft using these beats (don't label them in the output, just hit them):
1. Setup (introduce protagonist + ordinary world)
2. Inciting incident (something disrupts)
3. Escalation (stakes rise)
4. Climax (the choice or confrontation)
5. Resolution (the new normal)

Then write the story in flowing prose — no section headers, no labels.

After the story, add:

---

**Author notes**:
- **Theme**: <what the story is really about, in one sentence>
- **What I'd try differently**: <one alternate direction the story could have gone>

# Rules
- Show, don't tell, in the action; tell when needed for pacing.
- One protagonist viewpoint. No headhopping.
- Land the ending — don't trail off.`,
    placeholders: [
      { name: 'prompt', description: 'The seed idea or scenario', example: 'A retired postal worker who discovers a letter they never delivered, from 30 years ago.' },
      { name: 'length', description: 'Word count target', example: '600' },
      { name: 'genre', description: 'Tone or genre', example: 'Quiet, literary, bittersweet' },
      { name: 'pov', description: 'Point of view', example: 'Third-person limited, past tense' },
      { name: 'setting', description: 'Time and place', example: 'A small town in coastal Maine, present day' },
      { name: 'must_include', description: 'Specific elements to weave in', example: 'A weathered envelope, a black-and-white photograph' },
      { name: 'must_avoid', description: 'Things to steer clear of', example: 'Death of the protagonist, supernatural elements' },
    ],
    estimatedTokens: 520,
    useCase: 'Creative writing prompts, content marketing fiction, narrative game seeds. The author notes section makes the model\'s craft choices visible for iteration.',
  },
];
