import { createHash } from 'node:crypto';
import { runPipeline, validateKit, initialMetaFor } from '@prep-kit/core';
import { GeminiClient } from '@prep-kit/llm';
import { KitDocument } from '../db/models/KitDocument.js';

/**
 * Generation orchestration, kept out of the route handlers so that both
 * the single-kit and the batch-upload endpoints go through exactly one
 * code path (and so the routes stay readable).
 */

export function llmClient(): GeminiClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set. See .env.example.');
  return new GeminiClient({ apiKey, model: process.env.GEMINI_MODEL });
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

  void runInBackground(doc.id, input);
  return doc.id;
}

async function runInBackground(docId: string, input: KitInput): Promise<void> {
  try {
    const kit = await runPipeline(
      { jd: input.jd, companyUrl: input.company_url, days: input.days },
      { llm: llmClient() },
    );

    const { valid, errors } = validateKit(kit);
    if (!valid) throw new Error(`Generated kit failed validation: ${errors.join('; ')}`);

    const meta = initialMetaFor(
      kit.questions.map((q) => q.id),
      kit.flashcards.map((f) => f.id),
    );
    await KitDocument.findByIdAndUpdate(docId, { status: 'ready', kit, meta });
  } catch (err) {
    // A failed run is recorded on the document, never thrown — the request
    // that started it has long since returned, so an unhandled rejection
    // here would take the whole API process down with it.
    await KitDocument.findByIdAndUpdate(docId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
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
