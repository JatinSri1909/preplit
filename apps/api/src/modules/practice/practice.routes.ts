import { Router } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler.js';
import { getPracticeQueue, recordPracticeReview, resetPractice } from './practice.controller.js';

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

practiceRouter.get('/practice', asyncHandler(getPracticeQueue));
practiceRouter.post('/practice/:fid', asyncHandler(recordPracticeReview));
practiceRouter.delete('/practice', asyncHandler(resetPractice));
