import type { Request, Response } from 'express';
import { CreateKitSchema, BatchSchema } from './kits.validation.js';
import { startKitGeneration, findDuplicate } from './kits.service.js';
import { isStaleGeneration } from './kits.helpers.js';
import { KitDocument } from './kits.model.js';
import { badRequest } from '../../common/helpers/validation.helper.js';

// --- create one kit ---
export async function createKit(req: Request, res: Response): Promise<void> {
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
}

// --- create several kits from an uploaded file of description/company pairs ---
export async function createBatch(req: Request, res: Response): Promise<void> {
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
}

// --- list the caller's own kits ---
export async function listKits(req: Request, res: Response): Promise<void> {
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
}

// --- read one kit (this is also the generation-progress poll target) ---
export async function getKit(req: Request, res: Response): Promise<void> {
  const doc = await KitDocument.findById(req.params.id).catch(() => null);
  // 404 rather than 403 on someone else's kit — see builder.service.ts.
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
}

// --- delete a whole kit ---
export async function deleteKit(req: Request, res: Response): Promise<void> {
  const result = await KitDocument.deleteOne({ _id: req.params.id, userId: req.userId }).catch(
    () => ({ deletedCount: 0 }),
  );
  if (result.deletedCount === 0) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found.' } });
    return;
  }
  res.status(204).end();
}
