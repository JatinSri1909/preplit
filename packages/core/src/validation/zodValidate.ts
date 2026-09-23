import type { ZodType } from 'zod';
import type { LlmValidationResult } from '@prep-kit/llm';

/**
 * Adapts a zod schema to the shape-agnostic `validate` callback
 * LlmJsonRequest takes, so a schema mismatch gets the same one-shot
 * self-correction retry as invalid JSON syntax, instead of throwing
 * immediately (see groqClient.ts's generateJson) — a model returning
 * `difficulty: "2"` instead of `2` is exactly as recoverable as fixing
 * unparsable JSON, and previously wasn't retried at all.
 */
export function zodValidate<T>(schema: ZodType<T>): (value: unknown) => LlmValidationResult {
  return (value) => {
    const result = schema.safeParse(value);
    return result.success ? { valid: true } : { valid: false, message: result.error.message };
  };
}
