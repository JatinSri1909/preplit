import { Router } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler.js';
import {
  editBrief,
  reorderQuestions,
  addQuestion,
  editQuestion,
  deleteQuestion,
  addFlashcard,
  editFlashcard,
  deleteFlashcard,
  regenerateQuestions,
  regenerateBrief,
  regenerateSchedule,
  matchResume,
  uploadResumeMiddleware,
} from './builder.controller.js';

/**
 * The Builder (brief Section 6). `mergeParams` is required: this router is
 * mounted under /kits/:id, and without it `req.params.id` is undefined in
 * every handler below.
 *
 * Each route is deliberately narrow — "edit this question", "move this
 * question" — rather than a single "save the whole kit" endpoint. A
 * whole-kit PUT would mean the client is authoritative over content it did
 * not change, so two edits in flight at once silently overwrite each
 * other, and the provenance tracking that makes regeneration safe would be
 * client-supplied and therefore untrustworthy.
 */
export const builderRouter = Router({ mergeParams: true });

// Brief
builderRouter.patch('/brief', asyncHandler(editBrief));

// Questions
builderRouter.patch('/questions/order', asyncHandler(reorderQuestions));
builderRouter.post('/questions', asyncHandler(addQuestion));
builderRouter.patch('/questions/:qid', asyncHandler(editQuestion));
builderRouter.delete('/questions/:qid', asyncHandler(deleteQuestion));

// Flashcards
builderRouter.post('/flashcards', asyncHandler(addFlashcard));
builderRouter.patch('/flashcards/:fid', asyncHandler(editFlashcard));
builderRouter.delete('/flashcards/:fid', asyncHandler(deleteFlashcard));

// Regeneration
builderRouter.post('/regenerate/questions/:category', asyncHandler(regenerateQuestions));
builderRouter.post('/regenerate/brief', asyncHandler(regenerateBrief));
builderRouter.post('/regenerate/schedule', asyncHandler(regenerateSchedule));

// Resume match
builderRouter.post(
  '/resume',
  // Multer's own rejections (oversized file, wrong mimetype) call
  // Express's next(err) directly from callback-style middleware, before
  // asyncHandler's promise-based wrapper ever runs — left alone, that raw
  // error would reach the global handler's unconditional `message:
  // err.message` and leak internal detail. Translate it here instead.
  (req, res, next) => {
    uploadResumeMiddleware.single('resume')(req, res, (err: unknown) => {
      if (!err) return next();
      const message = err instanceof Error ? err.message : String(err);
      const code =
        message === 'INVALID_FILE_TYPE'
          ? 'INVALID_FILE_TYPE'
          : (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
            ? 'FILE_TOO_LARGE'
            : 'INVALID_FILE';
      const friendly =
        code === 'INVALID_FILE_TYPE'
          ? 'Only PDF resumes are supported.'
          : code === 'FILE_TOO_LARGE'
            ? 'That file is too large — resumes must be under 4MB.'
            : 'Could not read that upload.';
      res.status(400).json({ error: { code, message: friendly } });
    });
  },
  asyncHandler(matchResume),
);
