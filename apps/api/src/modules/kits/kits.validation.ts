import { z } from 'zod';

/**
 * Upper bounds on user input. A job description is text a human pasted;
 * anything past ~50k characters is not a job description, and letting it
 * through just means paying to send it to the model.
 */

// z.string().url() only checks that `new URL(value)` doesn't throw — it
// does not restrict the protocol, so "javascript:..." passes it too. That
// string is later rendered as a raw <a href> in the Builder, so the scheme
// must be restricted here, not just "is this parseable as a URL".
function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export const HttpUrlSchema = z
  .string()
  .max(2_000)
  .refine((value) => ['http:', 'https:'].includes(safeParseUrl(value)?.protocol ?? ''), {
    message: 'Must be a valid http:// or https:// URL',
  });

export const CreateKitSchema = z.object({
  jd: z.string().min(1).max(50_000),
  company_url: HttpUrlSchema,
  days: z.number().int().min(1).max(90),
});

/** The "prepare for more than one role at once" upload (brief Section 2). */
export const BatchSchema = z.object({
  cases: z.array(CreateKitSchema).min(1).max(20),
});
