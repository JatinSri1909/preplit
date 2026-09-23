import { createHash } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { runPipeline, validateKit, initialMetaFor } from '@prep-kit/core';
import { KitDocument } from './kits.model.js';
import { llmClient } from './kits.helpers.js';
import type { KitInput } from './kits.interfaces.js';

/**
 * Generation orchestration, kept out of the route handlers so that both
 * the single-kit and the batch-upload endpoints go through exactly one
 * code path (and so the routes stay readable).
 */

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

/**
 * Find an existing kit for the same posting.
 *
 * Brief Section 10 lists "the same description and company are submitted
 * twice" as an edge case. Resubmitting is treated as a request for the kit
 * the user already has, not as an error and not as a reason to spend a
 * second pipeline run: the existing kit is returned with a flag so the
 * interface can say so plainly. A previously *failed* kit is excluded —
 * resubmitting after a failure is a retry, and should genuinely retry.
 */
export async function findDuplicate(userId: string, input: KitInput) {
  return KitDocument.findOne({
    userId,
    fingerprint: fingerprint(userId, input),
    status: { $ne: 'failed' },
  })
    .select('_id status')
    .lean();
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
