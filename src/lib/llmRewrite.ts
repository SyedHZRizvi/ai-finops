// LLM-backed prompt rewriter.
//
// The heuristic optimizer in `./optimizer.ts` is a deterministic regex
// pass — it only catches a finite set of verbose English patterns. For
// prompts that are conversational, mis-structured, or just oddly phrased
// (the dominant case in real use), the heuristic correctly says "nothing
// to rewrite" and returns the input unchanged.
//
// This module fills that gap. When the operator has connected an
// Anthropic or OpenAI credential, we can ask the LLM itself to rewrite
// the prompt: clearer structure, fewer tokens, same intent. The result
// is surfaced separately in the UI so the heuristic baseline stays
// reproducible and the LLM rewrite is opt-in / clearly attributed.
//
// Design notes:
//   - `rewriteWithLLM` NEVER throws. If creds are missing, the API call
//     fails, JSON is malformed, etc., it returns `{ ok: false, reason }`.
//     The caller decides whether to surface the failure or silently fall
//     back to the heuristic.
//   - We deliberately pick the CHEAPEST/FASTEST model per provider —
//     Haiku for Anthropic, gpt-4o-mini for OpenAI. The optimizer is an
//     advisory tool; latency and per-call cost matter more than ceiling
//     quality.
//   - The rewriter prompt is constrained to "rewrite the user prompt"
//     and explicitly tells the LLM not to ANSWER the prompt. Returning
//     an answer would be a categorical UX bug.

import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/importers/crypto';

export type LlmRewriteProvider = 'anthropic' | 'openai';

export interface LlmRewriteSuccess {
  ok: true;
  /** The provider whose model produced the rewrite. */
  provider: LlmRewriteProvider;
  /** Concrete model identifier used (so the UI can show it). */
  model: string;
  /** The rewritten prompt. */
  rewrittenPrompt: string;
  /** Optional 1-2 sentence rationale from the model. May be empty. */
  rationale: string;
  /** Latency in ms (wall-clock). Useful for UI feedback. */
  latencyMs: number;
}

export interface LlmRewriteFailure {
  ok: false;
  /**
   * Machine-readable cause so the UI can render the right message.
   *   - 'no-credentials'   → nothing configured; tell user to add a key
   *   - 'encryption-key-missing' → FINOPS_ENCRYPTION_KEY isn't set
   *   - 'network'          → fetch threw / timeout
   *   - 'http'             → provider returned non-2xx
   *   - 'malformed'        → response wasn't shaped like we expected
   *   - 'empty'            → model returned an empty rewrite
   */
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

/**
 * Returns true when at least one Anthropic or OpenAI Credential row is
 * active AND FINOPS_ENCRYPTION_KEY is present. Use this to enable/disable
 * the "Use LLM rewrite" button in the UI before the user clicks.
 *
 * Cheap; touches the DB but only `select id` of the matching row.
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
        provider: { in: ['anthropic', 'openai'] },
      },
      select: { provider: true },
      distinct: ['provider'],
    });
    const providers = rows
      .map((r) => r.provider)
      .filter((p): p is LlmRewriteProvider => p === 'anthropic' || p === 'openai');
    return { available: providers.length > 0, providers };
  } catch {
    return { available: false, providers: [] };
  }
}

interface RewriteOptions {
  /** Override provider preference. If omitted, anthropic > openai. */
  preferProvider?: LlmRewriteProvider;
  /** Hard timeout for the upstream call. Defaults to 25s. */
  timeoutMs?: number;
}

/**
 * Rewrite a user prompt using whichever active credential we have.
 * Never throws. Fast-fails when no usable credential exists.
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

  // Pick a credential. Default order: anthropic first (we use Haiku, very
  // cheap and very fast), then openai (gpt-4o-mini). User override wins.
  const preferred = opts.preferProvider;
  const cred = await pickCredential(preferred);
  if (!cred) {
    return {
      ok: false,
      reason: 'no-credentials',
      message:
        'Add an Anthropic or OpenAI credential on /import to enable LLM-backed prompt rewriting.',
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
    if (cred.provider === 'anthropic') {
      return await callAnthropic(apiKey, originalPrompt, started, timeoutMs);
    }
    return await callOpenAI(apiKey, originalPrompt, started, timeoutMs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message.includes('aborted') || message.toLowerCase().includes('timeout')) {
      return { ok: false, reason: 'network', message: `Upstream timed out after ${timeoutMs}ms` };
    }
    return { ok: false, reason: 'network', message };
  }
}

/**
 * Resolve which credential to use. Looks for an active Anthropic row
 * first (cheapest fast model), falls back to OpenAI. Caller override
 * pins the choice when supplied.
 */
async function pickCredential(
  prefer: LlmRewriteProvider | undefined,
): Promise<{
  provider: LlmRewriteProvider;
  encryptedBlob: string;
  iv: string;
  authTag: string;
} | null> {
  // When a preference is supplied, ONLY try that provider — don't silently
  // fall back to the other since the user explicitly picked.
  const providerOrder: LlmRewriteProvider[] = prefer
    ? [prefer]
    : ['anthropic', 'openai'];

  for (const provider of providerOrder) {
    const row = await prisma.credential.findFirst({
      where: { provider, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: {
        provider: true,
        encryptedBlob: true,
        iv: true,
        authTag: true,
      },
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

/**
 * The system instruction we send to whichever model — kept identical
 * across providers so users get the same UX regardless of which key
 * they connected.
 *
 * Three things this MUST do:
 *   1. Rewrite, don't answer. (Categorical UX bug if it answers.)
 *   2. Preserve the user's intent exactly. (No new facts, no removed
 *      asks.)
 *   3. Return a structured JSON object so we can parse it deterministically
 *      and surface a rationale separately from the rewrite.
 */
// Token-cost-aware rewrite system prompt.
//
// Two levers that reduce AI spend per call:
//   1. INPUT tokens  — every word in the prompt costs input-token rate.
//                     Shorter, direct prompts cost less every time they're sent.
//   2. OUTPUT tokens — the prompt's *phrasing* controls how much the LLM writes
//                     back. Vague, open-ended prompts invite long discursive
//                     answers. Constrained, structured prompts elicit tight ones.
//
// The instructions below make both explicit so the rewriter actively cuts
// both sides of the bill, not just tidies prose.
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

HARD RULES:
- Preserve every distinct request and constraint from the original — nothing may be dropped
- Add NO new facts, requirements, or examples that weren't in the original
- DO NOT answer the prompt. DO NOT execute the task. ONLY rewrite the prompt.

Respond ONLY with a JSON object of this exact shape:
{"rewrittenPrompt": "<the rewritten prompt>", "rationale": "<1-2 sentences: what you cut from input AND what constraint you added to limit output>"}

No prose before or after the JSON. No markdown fences.`;

interface RewriteJson {
  rewrittenPrompt?: unknown;
  rationale?: unknown;
}

/** Extract `{rewrittenPrompt, rationale}` from a model response string. */
function parseRewriteJson(raw: string): { rewrittenPrompt: string; rationale: string } | null {
  // Models sometimes wrap JSON in markdown fences even when told not to.
  // Strip the most common variants before parsing.
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/```$/, '');
  cleaned = cleaned.trim();

  // Be generous: find the first `{` and the last `}` to handle pre/post junk.
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

async function callAnthropic(
  apiKey: string,
  originalPrompt: string,
  started: number,
  timeoutMs: number,
): Promise<LlmRewriteResult> {
  // Haiku is the right pick: tiny per-token cost, sub-2s latency for
  // prompts this small. Newer Sonnet / Opus would be overkill and would
  // slow the UX noticeably.
  //
  // Use a specific dated model identifier rather than a `-latest` alias.
  // Anthropic doesn't guarantee that every model has a `-latest` alias
  // resolved on every endpoint (the older `claude-3-5-haiku-latest` alias
  // returned 404 in production when this code first shipped). Pinning to a
  // dated version is more reliable and gives us reproducible behavior.
  // claude-haiku-4-5 is the current-generation Haiku as of 2026.
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
        messages: [
          {
            role: 'user',
            content: `Rewrite this prompt:\n\n<<<\n${originalPrompt}\n>>>`,
          },
        ],
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      reason: 'http',
      message: `Anthropic ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    };
  }

  // Anthropic Messages API returns: { content: [{type:'text', text:'...'}, ...] }
  let json: {
    content?: Array<{ type?: string; text?: string }>;
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { ok: false, reason: 'malformed', message: 'Anthropic returned non-JSON.' };
  }
  const text = (json.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n')
    .trim();
  if (!text) {
    return { ok: false, reason: 'empty', message: 'Anthropic returned an empty content array.' };
  }

  const parsed = parseRewriteJson(text);
  if (!parsed) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'Could not parse JSON {rewrittenPrompt, rationale} from Anthropic response.',
    };
  }

  return {
    ok: true,
    provider: 'anthropic',
    model,
    rewrittenPrompt: parsed.rewrittenPrompt,
    rationale: parsed.rationale,
    latencyMs: Date.now() - started,
  };
}

async function callOpenAI(
  apiKey: string,
  originalPrompt: string,
  started: number,
  timeoutMs: number,
): Promise<LlmRewriteResult> {
  // gpt-4o-mini is the price/latency analogue of Haiku. Use the
  // chat-completions JSON-mode option for deterministic parsing.
  const model = 'gpt-4o-mini';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        // Force JSON output so the parser path is robust.
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          { role: 'system', content: REWRITE_SYSTEM },
          {
            role: 'user',
            content: `Rewrite this prompt:\n\n<<<\n${originalPrompt}\n>>>`,
          },
        ],
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      reason: 'http',
      message: `OpenAI ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    };
  }

  let json: {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { ok: false, reason: 'malformed', message: 'OpenAI returned non-JSON.' };
  }
  const text = (json.choices?.[0]?.message?.content ?? '').trim();
  if (!text) {
    return { ok: false, reason: 'empty', message: 'OpenAI returned an empty choices array.' };
  }
  const parsed = parseRewriteJson(text);
  if (!parsed) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'Could not parse JSON {rewrittenPrompt, rationale} from OpenAI response.',
    };
  }

  return {
    ok: true,
    provider: 'openai',
    model,
    rewrittenPrompt: parsed.rewrittenPrompt,
    rationale: parsed.rationale,
    latencyMs: Date.now() - started,
  };
}
