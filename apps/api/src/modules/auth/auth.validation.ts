import { z } from 'zod';

/**
 * Brief Section 1: "Keep this layer minimal" — no email verification,
 * password reset, or role hierarchy. Just registration, login, logout,
 * and session handling that rejects a signed-out visitor.
 */

export const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Minimal but real: length floor only, no email-verification flow.
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
