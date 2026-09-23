import { createHash } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { runPipeline, validateKit, initialMetaFor } from '@prep-kit/core';
import { GroqModelPool, type LlmClient } from '@prep-kit/llm';
import { KitDocument } from '../db/models/KitDocument.js';

/**
 * Generation orchestration, kept out of the route handlers so that both
 * the single-kit and the batch-upload endpoints go through exactly one
 * code path (and so the routes stay readable).
 */

// All three are Groq's other current free chat models alongside
// gpt-oss-120b — each gets its own 30 RPM / 8K TPM budget (see
// console.groq.com/docs/rate-limits), so pooling them multiplies
// available throughput instead of one model's cap being the app's
// ceiling. Best quality first; GroqModelPool only drops to a later one
// when the preferred one is actually busy or cooling down from a 429.
const DEFAULT_MODEL_POOL = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

// Cached across warm invocations (see index.ts's per-request connectDb
// pattern for why that matters here too) so the rate limiters — and the
// cooldown state they track per model — persist between requests
// instead of resetting on every call.
let cachedClient: LlmClient | undefined;

export function llmClient(): LlmClient {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set. See .env.example.');
  const tokensPerMinute = process.env.GROQ_TPM_BUDGET ? Number(process.env.GROQ_TPM_BUDGET) : undefined;
  const requestsPerMinute = process.env.GROQ_RPM_BUDGET ? Number(process.env.GROQ_RPM_BUDGET) : undefined;

  // GROQ_MODEL_POOL (comma-separated) wins if set; a lone GROQ_MODEL
  // still works exactly as before (a "pool" of one, no fallback
  // possible); with neither set, default to the pool above rather than
  // a single hardcoded model.
  const models = process.env.GROQ_MODEL_POOL
    ? process.env.GROQ_MODEL_POOL.split(',').map((m) => m.trim()).filter(Boolean)
    : [process.env.GROQ_MODEL ?? DEFAULT_MODEL_POOL[0]];

  cachedClient = new GroqModelPool({
    apiKey,
    models: models.map((model) => ({ model, tokensPerMinute, requestsPerMinute })),
  });
  return cachedClient;
}

/**
 * Per-model rate-limit headroom, for the `/llm-status` route — so "is the
 * pool actually helping, or is every model cooling down right now" is a
 * request away instead of a guess from the logs.
 */
export function llmPoolStatus(): ReturnType<GroqModelPool['status']> | null {
  const client = llmClient();
  return client instanceof GroqModelPool ? client.status() : null;
}

export interface KitInput {
  jd: string;
  company_url: string;
  days: number;
}

/**
 * Identity of a posting for one user: same person, same company, same
 * description text = same kit.
 *
 * Normalising before hashing matters more than the hash does — a user who
 * re-pastes a description almost always reintroduces trailing whitespace
 * or a differently-cased URL, and a byte-exact comparison would call that
 * a new posting and burn another full pipeline run on it. `days` is
 * deliberately excluded: the same posting with a different runway is the
 * same research, and the schedule can be rebuilt without regenerating
 * anything.
 */
export function fingerprint(userId: string, input: KitInput): string {
  const url = input.company_url.trim().toLowerCase().replace(/\/+$/, '');
  const jd = input.jd.trim().replace(/\s+/g, ' ').toLowerCase();
  return createHash('sha256').update(`${userId}\u0000${url}\u0000${jd}`).digest('hex');
}

/**
 * Create the kit document and start generating in the background.
 *
 * Generation takes a crawl plus a dozen LLM calls, so holding the HTTP
 * request open for it would mean a request that routinely runs past ninety
 * seconds and dies to a proxy timeout with no record of what happened.
 * Instead the document is written immediately with status "generating" and
 * the client polls it. A crash mid-run leaves a document stuck in
 * "generating" rather than losing the request entirely — see the stale
 * sweep in the GET route.
 */
export async function startKitGeneration(userId: string, input: KitInput): Promise<string> {
  const doc = await KitDocument.create({
    userId,
    status: 'generating',
    kit: null,
    meta: null,
    practice: {},
    input,
    fingerprint: fingerprint(userId, input),
  });

  // On Vercel, a standard Node serverless invocation is frozen as soon as
  // the HTTP response is flushed — it does not wait for unrelated pending
  // promises the way a long-running process would. waitUntil() is Vercel's
  // hook for "keep this invocation alive until this promise settles too";
  // it's a no-op (falls back to plain fire-and-forget) on every other
  // deployment target, where the long-lived process makes it unnecessary.
  waitUntil(runInBackground(doc.id, input));
  return doc.id;
}

async function runInBackground(docId: string, input: KitInput): Promise<void> {
  try {
    const kit = await runPipeline(
      { jd: input.jd, companyUrl: input.company_url, days: input.days },
      {
        llm: llmClient(),
        // Fire-and-forget: a slow/failed progress write must never hold up
        // the pipeline itself, so errors are swallowed rather than awaited.
        onStep: (step) => {
          void KitDocument.findByIdAndUpdate(docId, { step }).catch(() => undefined);
        },
      },
    );

    const { valid, errors } = validateKit(kit);
    if (!valid) throw new Error(`Generated kit failed validation: ${errors.join('; ')}`);

    const meta = initialMetaFor(
      kit.questions.map((q) => q.id),
      kit.flashcards.map((f) => f.id),
    );
    await KitDocument.findByIdAndUpdate(docId, { status: 'ready', kit, meta, step: null });
  } catch (err) {
    // A failed run is recorded on the document, never thrown — the request
    // that started it has long since returned, so an unhandled rejection
    // here would take the whole API process down with it.
    //
    // The raw error (a Zod schema dump from a malformed LLM response, most
    // often) is a debugging detail, not something to hand a user — it's
    // logged here for whoever is watching the API, while the document gets
    // a message someone can actually act on.
    console.error(`Kit generation failed for ${docId}:`, err);
    await KitDocument.findByIdAndUpdate(docId, {
      status: 'failed',
      error:
        'This kit could not be generated — the AI model returned something unexpected. This is usually a temporary hiccup; try again.',
    }).catch(() => undefined);
  }
}

/**
 * A kit that has been "generating" for longer than this was almost
 * certainly orphaned by a process restart — nothing is still running that
 * will ever move it on. The GET route flips these to failed so the
 * interface shows an honest error with a retry instead of a spinner that
 * never resolves.
 */
export const STALE_GENERATION_MS = 10 * 60 * 1000;

export function isStaleGeneration(status: string, updatedAt: Date): boolean {
  return status === 'generating' && Date.now() - updatedAt.getTime() > STALE_GENERATION_MS;
}
