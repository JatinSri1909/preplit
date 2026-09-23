import { z } from 'zod';
import { RegisterSchema, LoginSchema } from './auth.validation.js';

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
