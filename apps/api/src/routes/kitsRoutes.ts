import { Router } from 'express';
import { z } from 'zod';
import { KitDocument } from '../db/models/KitDocument.js';
import {
  startKitGeneration,
  fingerprint,
  isStaleGeneration,
  KitInput,
} from '../services/kitGeneration.js';
import { asyncHandler } from './asyncHandler.js';
import { builderRouter } from './builderRoutes.js';
import { practiceRouter } from './practiceRoutes.js';

export const kitsRouter = Router();

/**
 * Upper bounds on user input. A job description is text a human pasted;
 * anything past ~50k characters is not a job description, and letting it
 * through just means paying to send it to the model.
 */
// z.string().url() only checks that `new URL(value)` doesn't throw — it
// does not restrict the protocol, so "javascript:..." passes it too. That
// string is later rendered as a raw <a href> in the Builder, so the scheme
// must be restricted here, not just "is this parseable as a URL".
const HttpUrlSchema = z
  .string()
  .max(2_000)
  .refine((value) => ['http:', 'https:'].includes(safeParseUrl(value)?.protocol ?? ''), {
    message: 'Must be a valid http:// or https:// URL',
  });

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const CreateKitSchema = z.object({
  jd: z.string().min(1).max(50_000),
  company_url: HttpUrlSchema,
  days: z.number().int().min(1).max(90),
});

/** The "prepare for more than one role at once" upload (brief Section 2). */
const BatchSchema = z.object({
  cases: z.array(CreateKitSchema).min(1).max(20),
});

function badRequest(res: import('express').Response, error: z.ZodError): void {
  res.status(400).json({
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Check the job description, company URL and number of days.',
      details: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    },
  });
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
async function findDuplicate(userId: string, input: KitInput) {
  return KitDocument.findOne({
    userId,
    fingerprint: fingerprint(userId, input),
    status: { $ne: 'failed' },
  })
    .select('_id status')
    .lean();
}

// --- create one kit ---
kitsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = CreateKitSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);

    const existing = await findDuplicate(req.userId!, parsed.data);
    if (existing) {
      res.status(200).json({
        id: String(existing._id),
        status: existing.status,
        duplicate_of_existing_kit: true,
      });
      return;
    }

    const id = await startKitGeneration(req.userId!, parsed.data);
    res.status(202).json({ id, status: 'generating', duplicate_of_existing_kit: false });
  }),
);

// --- create several kits from an uploaded file of description/company pairs ---
kitsRouter.post(
  '/batch',
  asyncHandler(async (req, res) => {
    const parsed = BatchSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);

    // Each case is settled independently: one malformed or duplicate entry
    // in an uploaded file must not cost the user the other nineteen.
    const results: unknown[] = [];
    for (const [index, input] of parsed.data.cases.entries()) {
      try {
        const existing = await findDuplicate(req.userId!, input);
        if (existing) {
          results.push({
            index,
            id: String(existing._id),
            status: existing.status,
            duplicate_of_existing_kit: true,
          });
          continue;
        }
        const id = await startKitGeneration(req.userId!, input);
        results.push({ index, id, status: 'generating', duplicate_of_existing_kit: false });
      } catch (err) {
        results.push({
          index,
          id: null,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Could not start generation for this row.',
        });
      }
    }

    res.status(202).json({ results });
  }),
);

// --- list the caller's own kits ---
kitsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const docs = await KitDocument.find({ userId: req.userId })
      .select('status error kit.source kit.coverage input.days createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json(
      docs.map((doc) => ({
        id: String(doc._id),
        status: isStaleGeneration(doc.status, doc.updatedAt) ? 'failed' : doc.status,
        error: doc.error ?? null,
        company: doc.kit?.source?.company ?? null,
        role: doc.kit?.source?.role ?? null,
        company_url: doc.kit?.source?.company_url ?? null,
        days: doc.input?.days ?? null,
        uncovered_count: doc.kit?.coverage?.uncovered_requirement_ids?.length ?? 0,
        created_at: doc.createdAt,
        updated_at: doc.updatedAt,
      })),
    );
  }),
);

// --- read one kit (this is also the generation-progress poll target) ---
kitsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await KitDocument.findById(req.params.id).catch(() => null);
    // 404 rather than 403 on someone else's kit — see loadKit.ts.
    if (!doc || doc.userId.toString() !== req.userId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found.' } });
      return;
    }

    // Nothing is still working on a run this old; report it honestly
    // instead of leaving the interface polling a spinner forever.
    if (isStaleGeneration(doc.status, doc.updatedAt)) {
      doc.status = 'failed';
      doc.error =
        'Generation stopped unexpectedly and did not finish. Create the kit again to retry.';
      await doc.save();
    }

    res.json({
      id: doc.id,
      status: doc.status,
      step: doc.step ?? null,
      error: doc.error ?? null,
      kit: doc.kit,
      meta: doc.meta,
      practice: doc.practice ?? {},
      resume_match: doc.resumeMatch ?? null,
      input: doc.input,
      created_at: doc.createdAt,
      updated_at: doc.updatedAt,
    });
  }),
);

// --- delete a whole kit ---
kitsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await KitDocument.deleteOne({ _id: req.params.id, userId: req.userId }).catch(
      () => ({ deletedCount: 0 }),
    );
    if (result.deletedCount === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found.' } });
      return;
    }
    res.status(204).end();
  }),
);

// Builder and practice routes mount under the same /kits/:id prefix so
// they inherit the auth middleware and the shared ownership guard.
kitsRouter.use('/:id', builderRouter);
kitsRouter.use('/:id', practiceRouter);
