import { z } from 'zod';

export const ReviewSchema = z.object({
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
