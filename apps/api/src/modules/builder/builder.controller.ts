import type { Request, Response } from 'express';
import multer from 'multer';
import { extractText, getDocumentProxy } from 'unpdf';
import {
  buildSchedule,
  removeQuestionFromSchedule,
  markEdited,
  markUserAdded,
  forgetItem,
  nextItemId,
  mergeRegeneratedQuestions,
  mergeRegeneratedBrief,
  generateQuestionsForRequirement,
  matchResumeToRequirements,
  summarizeCompany,
  crawlSite,
  type Question,
  type Flashcard,
  type QuestionCategory,
} from '@prep-kit/core';
import { requireOwnedKit, saveKitDocument, saveValidatedKit, kitPayload } from './builder.service.js';
import {
  EditBriefSchema,
  ReorderSchema,
  AddQuestionSchema,
  EditQuestionSchema,
  AddFlashcardSchema,
  EditFlashcardSchema,
  RegenerateScheduleSchema,
} from './builder.validation.js';
import { CATEGORIES, RESUME_TEXT_CHAR_CAP } from './builder.constants.js';
import { llmClient } from '../kits/kits.helpers.js';

// --- company brief: inline edit ---
export async function editBrief(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const parsed = EditBriefSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: parsed.error.message } });
    return;
  }

  const now = new Date().toISOString();
  for (const field of ['summary', 'what_they_do'] as const) {
    const value = parsed.data[field];
    if (value === undefined) continue;
    doc.kit!.company_brief[field] = value;
    // Marked per field, not for the brief as a whole: editing the
    // summary should not freeze what_they_do against regeneration.
    doc.meta!.company_brief[field] = { source: 'edited', updated_at: now };
  }

  if (await saveValidatedKit(doc, res)) res.json(kitPayload(doc));
}

// --- questions: reorder ---
export async function reorderQuestions(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const parsed = ReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: parsed.error.message } });
    return;
  }

  const current = doc.kit!.questions;
  const byId = new Map(current.map((q) => [q.id, q]));

  // The client must send a full permutation, not a partial list. A
  // partial one is ambiguous about where the omitted questions go, and
  // accepting it would let a stale client silently drop questions added
  // in another tab.
  const sameLength = parsed.data.ids.length === current.length;
  const allKnown = parsed.data.ids.every((id) => byId.has(id));
  const noDuplicates = new Set(parsed.data.ids).size === parsed.data.ids.length;
  if (!sameLength || !allKnown || !noDuplicates) {
    res.status(409).json({
      error: {
        code: 'STALE_ORDER',
        message: 'The question list changed since this order was calculated. Reload and try again.',
      },
    });
    return;
  }

  doc.kit!.questions = parsed.data.ids.map((id) => byId.get(id)!);
  if (await saveValidatedKit(doc, res)) res.json(kitPayload(doc));
}

// --- questions: add by hand ---
export async function addQuestion(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const parsed = AddQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: parsed.error.message } });
    return;
  }

  const knownRequirements = new Set(doc.kit!.role.requirements.map((r) => r.id));
  const unknown = parsed.data.requirement_ids.filter((id) => !knownRequirements.has(id));
  if (unknown.length > 0) {
    res.status(400).json({
      error: {
        code: 'UNKNOWN_REQUIREMENT',
        message: `This kit has no requirement ${unknown.join(', ')}.`,
      },
    });
    return;
  }

  const question: Question = {
    id: nextItemId('q', doc.kit!.questions.map((q) => q.id)),
    ...parsed.data,
  };
  doc.kit!.questions.push(question);
  // user_added, not generated: regenerating this category later must
  // leave a question the user wrote themselves completely alone.
  doc.meta = markUserAdded(doc.meta!, 'questions', question.id);

  if (await saveValidatedKit(doc, res)) res.status(201).json(kitPayload(doc));
}

// --- questions: inline edit (including moving it to another category) ---
export async function editQuestion(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const parsed = EditQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: parsed.error.message } });
    return;
  }

  const question = doc.kit!.questions.find((q) => q.id === req.params.qid);
  if (!question) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Question not found in this kit.' } });
    return;
  }

  Object.assign(question, parsed.data);
  doc.meta = markEdited(doc.meta!, 'questions', question.id);

  if (await saveValidatedKit(doc, res)) res.json(kitPayload(doc));
}

// --- questions: delete ---
export async function deleteQuestion(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const question = doc.kit!.questions.find((q) => q.id === req.params.qid);
  if (!question) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Question not found in this kit.' } });
    return;
  }

  doc.kit!.questions = doc.kit!.questions.filter((q) => q.id !== question.id);
  // The schedule references question ids, so a delete that ignored it
  // would write a kit that fails our own structural validation.
  doc.kit!.schedule = removeQuestionFromSchedule(
    doc.kit!.schedule,
    question.id,
    question.difficulty,
  );
  doc.meta = forgetItem(doc.meta!, 'questions', question.id);

  if (await saveValidatedKit(doc, res)) res.json(kitPayload(doc));
}

// --- flashcards: add ---
export async function addFlashcard(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const parsed = AddFlashcardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: parsed.error.message } });
    return;
  }

  const card: Flashcard = {
    id: nextItemId('f', doc.kit!.flashcards.map((f) => f.id)),
    ...parsed.data,
  };
  doc.kit!.flashcards.push(card);
  doc.meta = markUserAdded(doc.meta!, 'flashcards', card.id);

  if (await saveValidatedKit(doc, res)) res.status(201).json(kitPayload(doc));
}

// --- flashcards: edit ---
export async function editFlashcard(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const parsed = EditFlashcardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: parsed.error.message } });
    return;
  }

  const card = doc.kit!.flashcards.find((f) => f.id === req.params.fid);
  if (!card) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Flashcard not found in this kit.' } });
    return;
  }

  Object.assign(card, parsed.data);
  doc.meta = markEdited(doc.meta!, 'flashcards', card.id);

  if (await saveValidatedKit(doc, res)) res.json(kitPayload(doc));
}

// --- flashcards: delete ---
export async function deleteFlashcard(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const exists = doc.kit!.flashcards.some((f) => f.id === req.params.fid);
  if (!exists) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Flashcard not found in this kit.' } });
    return;
  }

  const fid = String(req.params.fid);
  doc.kit!.flashcards = doc.kit!.flashcards.filter((f) => f.id !== fid);
  doc.meta = forgetItem(doc.meta!, 'flashcards', fid);
  // Confidence history for a card that no longer exists is dead weight
  // and would skew the practice progress counts.
  const practice = { ...(doc.practice ?? {}) };
  delete practice[fid];
  doc.practice = practice;

  if (await saveValidatedKit(doc, res)) res.json(kitPayload(doc));
}

// --- regenerate: one question category ---
export async function regenerateQuestions(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const category = String(req.params.category) as QuestionCategory;
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    res.status(400).json({
      error: { code: 'UNKNOWN_CATEGORY', message: `Unknown question category "${category}".` },
    });
    return;
  }

  // Which requirements should this category cover? Taken from the
  // questions currently in the category, so regenerating reproduces the
  // same coverage rather than quietly narrowing or widening it.
  const requirementIds = new Set(
    doc.kit!.questions
      .filter((q) => q.category === category)
      .flatMap((q) => q.requirement_ids),
  );
  const requirements = doc.kit!.role.requirements.filter((r) => requirementIds.has(r.id));

  if (requirements.length === 0) {
    res.status(409).json({
      error: {
        code: 'NOTHING_TO_REGENERATE',
        message: `No requirements are currently covered by ${category} questions, so there is nothing to regenerate.`,
      },
    });
    return;
  }

  const llm = llmClient();
  // Regeneration reuses the stored company brief as context rather than
  // re-crawling the site: the research is already done, and a crawl per
  // regeneration would make the button slow and burn rate limit for no
  // new information.
  const context = {
    roleTitle: doc.kit!.role.title,
    companyBriefSummary: doc.kit!.company_brief.summary,
  };

  const fresh: Omit<Question, 'id'>[] = [];
  for (const requirement of requirements) {
    const generated = await generateQuestionsForRequirement(requirement, llm, context);
    // generateQuestionsForRequirement picks a category from the
    // requirement's kind; force the one the user asked to regenerate.
    fresh.push(...generated.map((q) => ({ ...q, category })));
  }

  const merged = mergeRegeneratedQuestions(doc.kit!.questions, doc.meta!, category, fresh);

  // Any replaced question that was sitting in the schedule now dangles.
  let schedule = doc.kit!.schedule;
  const survivingIds = new Set(merged.questions.map((q) => q.id));
  for (const old of doc.kit!.questions) {
    if (!survivingIds.has(old.id)) {
      schedule = removeQuestionFromSchedule(schedule, old.id, old.difficulty);
    }
  }

  doc.kit!.questions = merged.questions;
  doc.kit!.schedule = schedule;
  doc.meta = merged.meta;

  if (await saveValidatedKit(doc, res)) res.json(kitPayload(doc));
}

// --- regenerate: the company brief ---
export async function regenerateBrief(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const companyUrl = doc.kit!.source.company_url || doc.input.company_url;
  let pages: Awaited<ReturnType<typeof crawlSite>>['pagesUsed'] = [];
  try {
    const crawled = await crawlSite(companyUrl, {
      allowPrivateHosts: process.env.ALLOW_PRIVATE_HOSTS === 'true',
    });
    pages = crawled.pagesUsed;
  } catch {
    // An unreachable site is not a failed regeneration — summarizeCompany
    // turns an empty page list into the honest "nothing found" brief.
    pages = [];
  }

  const fresh = await summarizeCompany(
    { companyName: doc.kit!.source.company, pages },
    llmClient(),
  );

  const merged = mergeRegeneratedBrief(doc.kit!.company_brief, doc.meta!, fresh);
  doc.kit!.company_brief = merged.brief;
  doc.kit!.source.pages_used = pages.map((p) => p.url);
  doc.meta = merged.meta;

  if (await saveValidatedKit(doc, res)) res.json(kitPayload(doc));
}

// --- regenerate: the schedule (deterministic, no LLM, always available) ---
export async function regenerateSchedule(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  const parsed = RegenerateScheduleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: parsed.error.message } });
    return;
  }

  // Letting the user change the runway here is the point: "my interview
  // moved" is the single most likely reason to rebuild a schedule, and
  // it needs no regeneration of anything else.
  const days = parsed.data.days ?? doc.kit!.schedule.days_available;
  doc.kit!.schedule = buildSchedule(doc.kit!.role.requirements, doc.kit!.questions, days);

  if (await saveValidatedKit(doc, res)) res.json(kitPayload(doc));
}

// --- resume match (optional creativity feature) ---
//
// Not part of the graded Kit shape (see resumeMatch's own comment on
// KitDocumentData) — it never touches doc.kit, so this uses saveKitDocument
// rather than saveValidatedKit; there is nothing new to structurally
// validate.
const uploadResume = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('INVALID_FILE_TYPE'));
  },
});

/**
 * Multer middleware for resume upload — exported so the routes file can
 * wire the multer error-translation middleware inline before the handler.
 */
export const uploadResumeMiddleware = uploadResume;

export async function matchResume(req: Request, res: Response): Promise<void> {
  const doc = await requireOwnedKit(req, res);
  if (!doc) return;

  if (!req.file) {
    res.status(400).json({ error: { code: 'NO_FILE_UPLOADED', message: 'Attach a PDF resume.' } });
    return;
  }

  let text: string;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(req.file.buffer));
    text = (await extractText(pdf, { mergePages: true })).text.trim();
  } catch {
    res.status(400).json({
      error: {
        code: 'RESUME_UNREADABLE',
        message: "Couldn't read that PDF — try re-exporting it and uploading again.",
      },
    });
    return;
  }

  if (text.length < 50) {
    res.status(400).json({
      error: {
        code: 'RESUME_UNREADABLE',
        message:
          "Couldn't find readable text in that PDF — it may be a scanned image. Export from your word processor instead.",
      },
    });
    return;
  }

  // The extracted text itself is never persisted — only the match
  // verdicts below are. Truncating (rather than rejecting) a resume past
  // the cap is deliberate: a few extra pages of extraction noise from an
  // unusual template shouldn't fail an otherwise-real resume outright.
  text = text.slice(0, RESUME_TEXT_CHAR_CAP);

  let match;
  try {
    match = await matchResumeToRequirements(doc.kit!.role.requirements, text, llmClient());
  } catch (err) {
    // Same sanitization principle as kits.service.ts's runInBackground:
    // the raw error here can be a Zod schema dump or a rate-limiter
    // RangeError — log the detail server-side, never hand it to the
    // client.
    console.error(`Resume match failed for kit ${doc.id}:`, err);
    res.status(502).json({
      error: {
        code: 'RESUME_MATCH_FAILED',
        message: 'Could not analyse that resume right now — this is usually temporary; try again.',
      },
    });
    return;
  }

  doc.resumeMatch = match;
  doc.markModified('resumeMatch');
  if (await saveKitDocument(doc, res)) res.json(kitPayload(doc));
}
