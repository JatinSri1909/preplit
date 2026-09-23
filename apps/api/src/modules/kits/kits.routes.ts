import { Router } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler.js';
import { createKit, createBatch, listKits, getKit, deleteKit } from './kits.controller.js';
import { builderRouter } from '../builder/builder.routes.js';
import { practiceRouter } from '../practice/practice.routes.js';

export const kitsRouter = Router();

kitsRouter.post('/', asyncHandler(createKit));
kitsRouter.post('/batch', asyncHandler(createBatch));
kitsRouter.get('/', asyncHandler(listKits));
kitsRouter.get('/:id', asyncHandler(getKit));
kitsRouter.delete('/:id', asyncHandler(deleteKit));

// Builder and practice routes mount under the same /kits/:id prefix so
// they inherit the auth middleware and the shared ownership guard.
kitsRouter.use('/:id', builderRouter);
kitsRouter.use('/:id', practiceRouter);
