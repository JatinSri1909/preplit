export type LlmValidationResult = { valid: true } | { valid: false; message: string };

export interface LlmJsonRequest {
  /** System-level instructions. Never includes untrusted fetched content. */
  system: string;
  /**
   * User content. Untrusted material (JD text, crawled page text) must be
   * wrapped in clearly delimited fields within this string and the system
   * prompt must explicitly instruct the model to treat it as data, never
   * as instructions — see packages/llm/src/prompts/guardrails.ts.
   */
  user: string;
  /** Rough estimate used by the rate limiter's token budget. */
  estimatedInputTokens?: number;
  maxOutputTokens?: number;
  /**
   * Optional shape check run on the parsed JSON before generateJson returns
   * it. A model can return syntactically valid JSON that still doesn't
   * match the caller's expected shape (wrong type on one field is enough) —
   * that's just as much a "bad response" as invalid JSON syntax, and gets
   * the same one-shot self-correction retry, not an immediate throw. Kept
   * schema-library-agnostic (a plain predicate) so this package doesn't
   * need to depend on zod just to type this field.
   */
  validate?: (value: unknown) => LlmValidationResult;
}

export interface LlmClient {
  /**
   * Calls the model and returns the parsed JSON response. Retries once
   * internally on invalid JSON or a `validate` failure (asking the model to
   * correct itself) before throwing LlmInvalidJsonError. Retries with
   * backoff on rate-limit / transient errors — see RateLimiter.
   */
  generateJson<T>(req: LlmJsonRequest): Promise<T>;
}

export class LlmRateLimitedError extends Error {
  constructor(message = 'LLM provider rate-limited the request after retries') {
    super(message);
    this.name = 'LlmRateLimitedError';
  }
}

export class LlmInvalidJsonError extends Error {
  constructor(
    message = 'LLM did not return valid JSON after a correction attempt',
    public raw?: string,
  ) {
    super(message);
    this.name = 'LlmInvalidJsonError';
  }
}

export class LlmProviderError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
