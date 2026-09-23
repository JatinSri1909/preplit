import { z } from 'zod';
import { CATEGORIES } from './builder.constants.js';

export const DifficultySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

// --- company brief: inline edit ---
export const EditBriefSchema = z
  .object({
    summary: z.string().max(5_000).optional(),
    what_they_do: z.string().max(5_000).optional(),
  })
  .refine((v) => v.summary !== undefined || v.what_they_do !== undefined, {
    message: 'Provide summary, what_they_do, or both.',
  });

// --- questions: reorder ---
export const ReorderSchema = z.object({ ids: z.array(z.string()).min(1) });

// --- questions: add by hand ---
export const AddQuestionSchema = z.object({
  prompt: z.string().min(1).max(2_000),
  answer_outline: z.string().max(5_000).default(''),
  category: z.enum(CATEGORIES),
  difficulty: DifficultySchema.default(2),
  requirement_ids: z.array(z.string()).default([]),
});

// --- questions: inline edit (including moving it to another category) ---
export const EditQuestionSchema = z
  .object({
    prompt: z.string().min(1).max(2_000).optional(),
    answer_outline: z.string().max(5_000).optional(),
    difficulty: DifficultySchema.optional(),
    category: z.enum(CATEGORIES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update.' });

// --- flashcards: add ---
export const AddFlashcardSchema = z.object({
  front: z.string().min(1).max(2_000),
  back: z.string().max(5_000).default(''),
  requirement_ids: z.array(z.string()).default([]),
});

// --- flashcards: edit ---
export const EditFlashcardSchema = z
  .object({
    front: z.string().min(1).max(2_000).optional(),
    back: z.string().max(5_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update.' });

// --- regenerate: the schedule ---
export const RegenerateScheduleSchema = z.object({
  days: z.number().int().min(1).max(90).optional(),
});
