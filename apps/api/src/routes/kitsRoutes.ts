import { Router } from 'express';
import { z } from 'zod';
import {
  runPipeline,
  validateKit,
  buildSchedule,
  markEdited,
  initialMetaFor,
} from '@prep-kit/core';
import { GeminiClient } from '@prep-kit/llm';
import { KitDocument } from '../db/models/KitDocument.js';
import { assertOwnsKit, ForbiddenError } from './ownership.js';
import { asyncHandler } from './asyncHandler.js';

export const kitsRouter = Router();

const CreateKitSchema = z.object({
  jd: z.string().min(1),
  company_url: z.string().url(),
  days: z.number().int().positive(),
});

function llmClient(): GeminiClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
  return new GeminiClient({ apiKey, model: process.env.GEMINI_MODEL });
}

// --- create ---
// Generation is slow/external/failure-prone (brief Section 13), so this
// stores a "generating" placeholder immediately and updates it once
// runPipeline resolves, rather than holding the HTTP request open for
// however long crawling + multiple LLM calls take. The web app polls
// GET /kits/:id for status until it flips to "ready" or "failed" — this
// covers "visible progress and clear failure states" without needing
// websockets for a minimal implementation. Swap for SSE/websockets later
// if polling proves too chatty.
kitsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = CreateKitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: parsed.error.message } });
      return;
    }
    const { jd, company_url, days } = parsed.data;

    const doc = await KitDocument.create({
      userId: req.userId,
      status: 'generating',
      kit: null,
      meta: null,
    });

    // Fire-and-forget: the response returns immediately with the doc id so
    // the client can start polling. Errors are caught and recorded on the
    // document rather than crashing the request handler (which has already
    // responded by the time this runs).
    void (async () => {
      try {
        const kit = await runPipeline({ jd, companyUrl: company_url, days }, { llm: llmClient() });
        const { valid, errors } = validateKit(kit);
        if (!valid) throw new Error(`Generated kit failed validation: ${errors.join('; ')}`);

        const meta = initialMetaFor(
          kit.questions.map((q) => q.id),
          kit.flashcards.map((f) => f.id),
        );
        await KitDocument.findByIdAndUpdate(doc.id, { status: 'ready', kit, meta });
      } catch (err) {
        await KitDocument.findByIdAndUpdate(doc.id, {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    res.status(202).json({ id: doc.id, status: 'generating' });
  }),
);

// --- list (own kits only) ---
kitsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const docs = await KitDocument.find({ userId: req.userId })
      .select('status kit.source createdAt updatedAt')
      .lean();
    res.json(docs);
  }),
);

// --- get one ---
kitsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await KitDocument.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found.' } });
      return;
    }
    try {
      assertOwnsKit(doc.userId.toString(), req.userId!);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: err.message } });
        return;
      }
      throw err;
    }
    res.json(doc);
  }),
);

// --- inline edit: question ---
const EditQuestionSchema = z.object({
  prompt: z.string().optional(),
  answer_outline: z.string().optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']).optional(),
});

kitsRouter.patch(
  '/:id/questions/:qid',
  asyncHandler(async (req, res) => {
    const doc = await requireOwnedKit(req, res);
    if (!doc) return;

    const parsed = EditQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: parsed.error.message } });
      return;
    }

    const question = doc.kit!.questions.find((q: { id: string }) => q.id === req.params.qid);
    if (!question) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Question not found in this kit.' } });
      return;
    }
    Object.assign(question, parsed.data);
    doc.meta = markEdited(doc.meta!, 'questions', String(req.params.qid));
    doc.markModified('kit');
    doc.markModified('meta');
    await doc.save();
    res.json(doc);
  }),
);

// --- regenerate a question category, preserving edits (brief Section 6) ---
kitsRouter.post(
  '/:id/regenerate/questions/:category',
  asyncHandler(async (req, res) => {
    const doc = await requireOwnedKit(req, res);
    if (!doc) return;

    // TODO: once generateQuestionsForRequirement is implemented, call it
    // here for each requirement relevant to :category, then merge with
    // mergeRegeneratedQuestions(doc.kit.questions, doc.meta, category, fresh)
    // and save. Left unimplemented until the LLM generation module is
    // wired, so this route currently returns 501 rather than silently
    // no-op-ing.
    res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Question regeneration pending LLM wiring.' } });
  }),
);

// --- regenerate the schedule (deterministic, always available) ---
kitsRouter.post(
  '/:id/regenerate/schedule',
  asyncHandler(async (req, res) => {
    const doc = await requireOwnedKit(req, res);
    if (!doc) return;

    doc.kit!.schedule = buildSchedule(
      doc.kit!.role.requirements,
      doc.kit!.questions,
      doc.kit!.schedule.days_available,
    );
    doc.markModified('kit');
    await doc.save();
    res.json(doc);
  }),
);

async function requireOwnedKit(req: import('express').Request, res: import('express').Response) {
  const doc = await KitDocument.findById(req.params.id);
  if (!doc) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found.' } });
    return null;
  }
  try {
    assertOwnsKit(doc.userId.toString(), req.userId!);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: err.message } });
      return null;
    }
    throw err;
  }
  if (doc.status !== 'ready') {
    res.status(409).json({ error: { code: 'KIT_NOT_READY', message: `Kit status is "${doc.status}".` } });
    return null;
  }
  return doc;
}
