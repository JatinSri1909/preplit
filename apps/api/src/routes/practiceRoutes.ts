import { Router } from 'express';
import { z } from 'zod';
import { orderPracticeQueue, practiceProgress, recordReview } from '@prep-kit/core';
import { requireOwnedKit, saveKitDocument } from './loadKit.js';
import { asyncHandler } from './asyncHandler.js';

/**
 * Practice mode (brief Section 7). Mounted under /kits/:id, so it needs
 * mergeParams for the same reason the builder router does.
 *
 * The queue order is computed server-side rather than in the component.
 * It is the one part of practice mode with a defensible rule behind it
 * (see orderPracticeQueue), and deriving it in the client would mean the
 * rule lives somewhere untested and drifts the moment a second surface —
 * the batch CLI, a mobile view — wants the same ordering.
 */
export const practiceRouter = Router({ mergeParams: true });

const ReviewSchema = z.object({
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

// --- the next session, least-confident first ---
practiceRouter.get(
  '/practice',
  asyncHandler(async (req, res) => {
    const doc = await requireOwnedKit(req, res);
    if (!doc) return;

    const state = doc.practice ?? {};
    res.json({
      queue: orderPracticeQueue(doc.kit!.flashcards, state),
      progress: practiceProgress(doc.kit!.flashcards, state),
      state,
    });
  }),
);

// --- record how confident they felt on one card ---
practiceRouter.post(
  '/practice/:fid',
  asyncHandler(async (req, res) => {
    const doc = await requireOwnedKit(req, res);
    if (!doc) return;

    const parsed = ReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_FAILED', message: 'confidence must be 1, 2 or 3.' },
      });
      return;
    }

    const fid = String(req.params.fid);
    if (!doc.kit!.flashcards.some((f) => f.id === fid)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Flashcard not found in this kit.' } });
      return;
    }

    doc.practice = recordReview(doc.practice ?? {}, fid, parsed.data.confidence);
    doc.markModified('practice');
    if (!(await saveKitDocument(doc, res))) return;

    // No queue reorder in the response: resorting mid-session would move
    // the card under the user's cursor. The client finishes the session
    // with the order it was given and refetches for the next one.
    res.json({
      state: doc.practice,
      progress: practiceProgress(doc.kit!.flashcards, doc.practice),
    });
  }),
);

// --- start over ---
practiceRouter.delete(
  '/practice',
  asyncHandler(async (req, res) => {
    const doc = await requireOwnedKit(req, res);
    if (!doc) return;

    doc.practice = {};
    doc.markModified('practice');
    if (!(await saveKitDocument(doc, res))) return;

    res.json({
      state: {},
      progress: practiceProgress(doc.kit!.flashcards, {}),
    });
  }),
);
