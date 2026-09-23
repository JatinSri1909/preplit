import type { Request, Response } from 'express';
import { orderPracticeQueue, practiceProgress, recordReview } from '@prep-kit/core';
import { requireOwnedKit, saveKitDocument } from '../builder/builder.service.js';
import { ReviewSchema } from './practice.validation.js';

// --- the next session, least-confident first ---
export async function getPracticeQueue(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const state = doc.practice ?? {};
  res.json({
    queue: orderPracticeQueue(doc.kit!.flashcards, state),
    progress: practiceProgress(doc.kit!.flashcards, state),
    state,
  });
}

// --- record how confident they felt on one card ---
export async function recordPracticeReview(req: Request, res: Response): Promise<void> {
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
}

// --- start over ---
export async function resetPractice(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  doc.practice = {};
  doc.markModified('practice');
  if (!(await saveKitDocument(doc, res))) return;

  res.json({
    state: {},
    progress: practiceProgress(doc.kit!.flashcards, {}),
  });
}
