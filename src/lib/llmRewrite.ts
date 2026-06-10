// LLM-backed prompt rewriter.
//
// The heuristic optimizer in `./optimizer.ts` is a deterministic regex
// pass — it only catches a finite set of verbose English patterns. For
// prompts that are conversational, mis-structured, or just oddly phrased
// (the dominant case in real use), the heuristic correctly says "nothing
// to rewrite" and returns the input unchanged.
//
// This module fills that gap. When the operator has connected any supported
// LLM credential, we ask the model to rewrite the prompt: clearer structure,
// fewer tokens, same intent.
//
// Supported providers (in fallback order):
//   1. anthropic  — Claude Haiku 4.5 (paid; very fast and cheap)
//   2. openai     — GPT-4o-mini (paid)
//   3. google     — Gemini 1.5 Flash (FREE tier: 1 500 req/day, no credit card)
//   4. groq       — Llama-3.1-8b-instant (FREE tier: 14 400 req/day, no credit card)
//
// Google and Groq are genuinely free — the operator just needs to create a
// free account once and paste the key into Connectors. The key never expires
// unless manually revoked.
//
// Design notes:
//   - `rewriteWithLLM` NEVER throws. Any failure returns { ok: false, reason }.
//   - We pick the cheapest/fastest model per provider.
//   - Groq uses the OpenAI-compatible chat-completions format; both share
//     `callOpenAICompat` to avoid duplication.

import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/importers/crypto';

export type LlmRewriteProvider = 'anthropic' | 'openai' | 'google' | 'groq';

export interface LlmRewriteSuccess {
  ok: true;
  provider: LlmRewriteProvider;
  model: string;
  rewrittenPrompt: string;
  rationale: string;
  latencyMs: number;
}

export interface LlmRewriteFailure {
  ok: false;
  reason:
    | 'no-credentials'
    | 'encryption-key-missing'
    | 'network'
    | 'http'
    | 'malformed'
    | 'empty';
  message: string;
}

export type LlmRewriteResult = LlmRewriteSuccess | LlmRewriteFailure;

// All four supported providers, in the order the picker tries them when no
// preference is given. Free-tier providers (google, groq) sit last so
// existing paid credentials keep working without any change.
const ALL_PROVIDERS: LlmRewriteProvider[] = ['anthropic', 'openai', 'google', 'groq'];

/**
 * Returns true when at least one supported credential is active AND
 * FINOPS_ENCRYPTION_KEY is present.
 */
export async function isLlmRewriteAvailable(): Promise<{
  available: boolean;
  providers: LlmRewriteProvider[];
}> {
  const key = process.env.FINOPS_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    return { available: false, providers: [] };
  }
  try {
    const rows = await prisma.credential.findMany({
      where: {
        isActive: true,
        provider: { in: ALL_PROVIDERS },
      },
      select: { provider: true },
      distinct: ['provider'],
    });
    const providers = rows
      .map((r) => r.provider)
      .filter((p): p is LlmRewriteProvider => (ALL_PROVIDERS as string[]).includes(p));
    return { available: providers.length > 0, providers };
  } catch {
    return { available: false, providers: [] };
  }
}

interface RewriteOptions {
  preferProvider?: LlmRewriteProvider;
  timeoutMs?: number;
}

/**
 * Rewrite a user prompt using whichever active credential we have.
 * Never throws.
 */
export async function rewriteWithLLM(
  originalPrompt: string,
  opts: RewriteOptions = {},
): Promise<LlmRewriteResult> {
  if (!process.env.FINOPS_ENCRYPTION_KEY || process.env.FINOPS_ENCRYPTION_KEY.length !== 64) {
    return {
      ok: false,
      reason: 'encryption-key-missing',
      message: 'FINOPS_ENCRYPTION_KEY must be set so the server can decrypt provider tokens.',
    };
  }

  const cred = await pickCredential(opts.preferProvider);
  if (!cred) {
    return {
      ok: false,
      reason: 'no-credentials',
      message:
        'Connect a free provider to enable AI rewriting. Add a Google or Groq key on /import — both are free with no credit card required.',
    };
  }

  let apiKey: string;
  try {
    apiKey = decrypt({
      encryptedBlob: cred.encryptedBlob,
      iv: cred.iv,
      authTag: cred.authTag,
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'encryption-key-missing',
      message: err instanceof Error ? err.message : 'failed to decrypt credential',
    };
  }

  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 25_000;
  try {
    switch (cred.provider) {
      case 'anthropic': return await callAnthropic(apiKey, originalPrompt, started, timeoutMs);
      case 'google':    return await callGoogle(apiKey, originalPrompt, started, timeoutMs);
      case 'groq':      return await callOpenAICompat(
        'https://api.groq.com/openai/v1/chat/completions',
        apiKey,
        'llama-3.1-8b-instant',
        'groq',
        'Groq',
        originalPrompt,
        started,
        timeoutMs,
      );
      default:          return await callOpenAICompat(
        'https://api.openai.com/v1/chat/completions',
        apiKey,
        'gpt-4o-mini',
        'openai',
        'OpenAI',
        originalPrompt,
        started,
        timeoutMs,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message.includes('aborted') || message.toLowerCase().includes('timeout')) {
      return { ok: false, reason: 'network', message: `Upstream timed out after ${timeoutMs} ms` };
    }
    return { ok: false, reason: 'network', message };
  }
}

async function pickCredential(
  prefer: LlmRewriteProvider | undefined,
): Promise<{
  provider: LlmRewriteProvider;
  encryptedBlob: string;
  iv: string;
  authTag: string;
} | null> {
  const order: LlmRewriteProvider[] = prefer ? [prefer] : ALL_PROVIDERS;

  for (const provider of order) {
    const row = await prisma.credential.findFirst({
      where: { provider, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { provider: true, encryptedBlob: true, iv: true, authTag: true },
    });
    if (row) {
      return {
        provider: row.provider as LlmRewriteProvider,
        encryptedBlob: row.encryptedBlob,
        iv: row.iv,
        authTag: row.authTag,
      };
    }
  }
  return null;
}

// ─── System prompt ────────────────────────────────────────────────────────────
// Kept identical across all providers so users get consistent UX regardless
// of which credential they connected.
const REWRITE_SYSTEM = `You are a token-cost optimization expert for enterprise AI systems. The user will give you a prompt they intend to send to an LLM. Your job is to rewrite it to minimize BOTH input and output token costs while preserving the full intent.

TWO goals — treat them equally:

GOAL 1 — Reduce INPUT tokens (shrink the prompt itself):
- Remove every word that does not add information: filler ("basically", "just", "I was wondering"), polite padding ("please could you kindly"), redundant back-references ("as mentioned", "as I said earlier")
- Replace verbose phrases with short equivalents ("in order to" → "to", "due to the fact that" → "because", "at this point in time" → "now")
- Eliminate repeated context — say each thing once
- Convert passive voice to active voice where shorter
- Use imperative/direct phrasing ("List X" not "Can you please provide a list of X")
- Remove conversational openers and sign-offs

GOAL 2 — Reduce OUTPUT tokens (make the LLM respond concisely):
- If the prompt asks multiple questions, number them explicitly — numbered lists elicit bullet answers, not prose essays
- Add an explicit length/format constraint at the end when one is missing, e.g. "Respond in bullet points." or "Be concise — max 3 sentences per point." or "Answer each numbered item in one sentence."
- If the task has a known deliverable type (code, list, table, yes/no), name it: "Return only the code." / "Return a markdown table." / "Answer yes or no with one line of reasoning."
- Replace open questions ("tell me about X") with scoped questions ("List the 3 most important aspects of X in one sentence each")

GOAL 3 — Fix spelling, grammar, and typos:
- Correct ALL spelling mistakes silently (e.g. "inforamton" → "information", "teh" → "the")
- Fix grammatical errors and awkward phrasing
- Standardize capitalization and punctuation
- Do this automatically — do not call it out in the rationale unless it was the only change made

HARD RULES:
- Preserve every distinct request and constraint from the original — nothing may be dropped
- Add NO new facts, requirements, or examples that weren't in the original
- DO NOT answer the prompt. DO NOT execute the task. ONLY rewrite the prompt.

Respond ONLY with a JSON object of this exact shape:
{"rewrittenPrompt": "<the rewritten prompt>", "rationale": "<1-2 sentences: what you cut from input AND what constraint you added to limit output — mention spelling/grammar only if that was the primary change>"}

No prose before or after the JSON. No markdown fences.`;

interface RewriteJson {
  rewrittenPrompt?: unknown;
  rationale?: unknown;
}

function parseRewriteJson(raw: string): { rewrittenPrompt: string; rationale: string } | null {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/```$/, '');
  cleaned = cleaned.trim();

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const candidate = cleaned.slice(first, last + 1);

  try {
    const parsed = JSON.parse(candidate) as RewriteJson;
    const rewrittenPrompt =
      typeof parsed.rewrittenPrompt === 'string' ? parsed.rewrittenPrompt.trim() : '';
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.trim() : '';
    if (!rewrittenPrompt) return null;
    return { rewrittenPrompt, rationale };
  } catch {
    return null;
  }
}

// ─── Provider implementations ─────────────────────────────────────────────────

async function callAnthropic(
  apiKey: string,
  originalPrompt: string,
  started: number,
  timeoutMs: number,
): Promise<LlmRewriteResult> {
  const model = 'claude-haiku-4-5';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: REWRITE_SYSTEM,
        messages: [{ role: 'user', content: `Rewrite this prompt:\n\n<<<\n${originalPrompt}\n>>>` }],
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) return { ok: false, reason: 'http', message: 'The Anthropic API key is invalid or has been revoked. Update it on the Connectors page.' };
    if (res.status === 429) return { ok: false, reason: 'http', message: 'Anthropic rate limit reached — try again in a moment.' };
    let detail = '';
    try { const e = JSON.parse(body) as { error?: { message?: string } }; if (typeof e?.error?.message === 'string') detail = e.error.message; } catch { /* ignore */ }
    return { ok: false, reason: 'http', message: detail || `Anthropic returned ${res.status} ${res.statusText || ''}`.trim() };
  }

  let json: { content?: Array<{ type?: string; text?: string }> };
  try { json = (await res.json()) as typeof json; } catch { return { ok: false, reason: 'malformed', message: 'Anthropic returned non-JSON.' }; }

  const text = (json.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string).join('\n').trim();
  if (!text) return { ok: false, reason: 'empty', message: 'Anthropic returned an empty response.' };

  const parsed = parseRewriteJson(text);
  if (!parsed) return { ok: false, reason: 'malformed', message: 'Could not parse JSON from Anthropic response.' };

  return { ok: true, provider: 'anthropic', model, rewrittenPrompt: parsed.rewrittenPrompt, rationale: parsed.rationale, latencyMs: Date.now() - started };
}

// Shared implementation for OpenAI-compatible APIs (OpenAI itself and Groq,
// which mirrors the OpenAI chat-completions endpoint exactly).
async function callOpenAICompat(
  baseUrl: string,
  apiKey: string,
  model: string,
  provider: LlmRewriteProvider,
  providerName: string,
  originalPrompt: string,
  started: number,
  timeoutMs: number,
): Promise<LlmRewriteResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(baseUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          { role: 'system', content: REWRITE_SYSTEM },
          { role: 'user', content: `Rewrite this prompt:\n\n<<<\n${originalPrompt}\n>>>` },
        ],
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) return { ok: false, reason: 'http', message: `The ${providerName} API key is invalid or has been revoked. Update it on the Connectors page.` };
    if (res.status === 429) return { ok: false, reason: 'http', message: `${providerName} rate limit reached — try again in a moment.` };
    let detail = '';
    try { const e = JSON.parse(body) as { error?: { message?: string } }; if (typeof e?.error?.message === 'string') detail = e.error.message; } catch { /* ignore */ }
    return { ok: false, reason: 'http', message: detail || `${providerName} returned ${res.status} ${res.statusText || ''}`.trim() };
  }

  let json: { choices?: Array<{ message?: { content?: string | null } }> };
  try { json = (await res.json()) as typeof json; } catch { return { ok: false, reason: 'malformed', message: `${providerName} returned non-JSON.` }; }

  const text = (json.choices?.[0]?.message?.content ?? '').trim();
  if (!text) return { ok: false, reason: 'empty', message: `${providerName} returned an empty response.` };

  const parsed = parseRewriteJson(text);
  if (!parsed) return { ok: false, reason: 'malformed', message: `Could not parse JSON from ${providerName} response.` };

  return { ok: true, provider, model, rewrittenPrompt: parsed.rewrittenPrompt, rationale: parsed.rationale, latencyMs: Date.now() - started };
}

// Google Gemini — free tier via AI Studio key.
// Free limits: 15 RPM, 1 000 000 TPM, 1 500 RPD.
// Get a free key at: https://aistudio.google.com/app/apikey
async function callGoogle(
  apiKey: string,
  originalPrompt: string,
  started: number,
  timeoutMs: number,
): Promise<LlmRewriteResult> {
  const model = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `Rewrite this prompt:\n\n<<<\n${originalPrompt}\n>>>` }] },
        ],
        systemInstruction: { parts: [{ text: REWRITE_SYSTEM }] },
        generationConfig: { maxOutputTokens: 2048, temperature: 0.2 },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, reason: 'http', message: 'The Google Gemini API key is invalid or has been revoked. Update it on the Connectors page.' };
    if (res.status === 429) return { ok: false, reason: 'http', message: 'Google Gemini rate limit reached — try again in a moment.' };
    let detail = '';
    try { const e = JSON.parse(body) as { error?: { message?: string } }; if (typeof e?.error?.message === 'string') detail = e.error.message; } catch { /* ignore */ }
    return { ok: false, reason: 'http', message: detail || `Google Gemini returned ${res.status} ${res.statusText || ''}`.trim() };
  }

  let json: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  try { json = (await res.json()) as typeof json; } catch { return { ok: false, reason: 'malformed', message: 'Google Gemini returned non-JSON.' }; }

  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '').join('\n').trim();
  if (!text) return { ok: false, reason: 'empty', message: 'Google Gemini returned an empty response.' };

  const parsed = parseRewriteJson(text);
  if (!parsed) return { ok: false, reason: 'malformed', message: 'Could not parse JSON from Google Gemini response.' };

  return { ok: true, provider: 'google', model, rewrittenPrompt: parsed.rewrittenPrompt, rationale: parsed.rationale, latencyMs: Date.now() - started };
}
