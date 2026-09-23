import Groq from 'groq-sdk';
import { LlmClient, LlmInvalidJsonError, LlmJsonRequest, LlmProviderError, LlmRateLimitedError } from './types.js';
import { TokenBucketRateLimiter, retryWithBackoff } from './rateLimiter.js';

export interface GroqClientOptions {
  apiKey: string;
  model?: string; // default: llama-3.3-70b-versatile
  /**
   * Groq free-tier TPM budget to self-limit against. Varies a lot by model
   * and account — check https://console.groq.com/docs/rate-limits and
   * override via GROQ_TPM_BUDGET rather than trusting this default.
   */
  tokensPerMinute?: number;
  /**
   * Groq free-tier RPM budget. Small/free models are commonly capped as low
   * as 30 requests/minute — a multi-step pipeline can blow through that
   * before it ever approaches its token budget, so this is throttled
   * separately from tokensPerMinute. Override via GROQ_RPM_BUDGET.
   */
  requestsPerMinute?: number;
  /**
   * How many times a single request retries on a transient/rate-limit
   * error before giving up, and the cap on each backoff delay. Defaults
   * assume this is the only model available, so it's worth waiting out a
   * full rate-limit window. A pool of several models passes tighter
   * values here — see groqModelPool.ts — since falling over to another
   * model is faster than one model's own backoff loop.
   */
  maxRetries?: number;
  maxRetryDelayMs?: number;
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; problem: string };

/** Parses `text` as JSON and, if given, runs the caller's shape check on it. */
function parseAndValidate<T>(text: string, validate?: LlmJsonRequest['validate']): ParseResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'was not valid JSON.' };
  }
  if (validate) {
    const outcome = validate(parsed);
    if (!outcome.valid) {
      return { ok: false, problem: `did not match the required shape: ${outcome.message}` };
    }
  }
  return { ok: true, value: parsed as T };
}

function isRateLimitError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = String((err as Error)?.message ?? '');
  return status === 429 || /rate.?limit/i.test(message);
}

function isTransientError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return isRateLimitError(err) || status === 500 || status === 502 || status === 503;
}

/**
 * Groq (like OpenAI) returns a `retry-after` header in seconds on 429s —
 * an exact wait rather than a guess. When present, honour it over the
 * exponential backoff formula.
 */
function retryAfterMs(err: unknown): number | undefined {
  // groq-sdk's APIError exposes `headers` as a plain object (built via
  // Object.fromEntries over the fetch Response's Headers), not a
  // fetch-style Headers instance — it has no `.get` method.
  const headers = (err as { headers?: Record<string, string> })?.headers;
  const raw = headers?.['retry-after'];
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 250 : undefined;
}

export class GroqClient implements LlmClient {
  private readonly client: Groq;
  private readonly modelName: string;
  private readonly tokenLimiter: TokenBucketRateLimiter;
  private readonly requestLimiter: TokenBucketRateLimiter;
  private readonly maxRetries: number;
  private readonly maxRetryDelayMs: number;

  constructor(opts: GroqClientOptions) {
    // Our own rateLimiter + retryWithBackoff already handle pacing and
    // retries; disable the SDK's built-in retry-on-429 so the two don't
    // stack into unpredictable delays.
    this.client = new Groq({ apiKey: opts.apiKey, maxRetries: 0 });
    this.modelName = opts.model ?? 'llama-3.3-70b-versatile';
    this.tokenLimiter = new TokenBucketRateLimiter(opts.tokensPerMinute ?? 6000);
    this.requestLimiter = new TokenBucketRateLimiter(opts.requestsPerMinute ?? 28);
    this.maxRetries = opts.maxRetries ?? 6;
    this.maxRetryDelayMs = opts.maxRetryDelayMs ?? 30000;
  }

  /** Which model this client calls — lets a pool identify/log its members. */
  get model(): string {
    return this.modelName;
  }

  /**
   * How long `generateJson` would currently have to wait on this model's
   * self-imposed budget before it could even send the request — without
   * reserving anything. A pool uses this to route each call to whichever
   * model has headroom right now, rather than always queuing behind the
   * most-preferred one.
   */
  estimatedWaitMs(req: LlmJsonRequest): number {
    const estimate = req.estimatedInputTokens ?? Math.ceil((req.system.length + req.user.length) / 4);
    return Math.max(
      this.tokenLimiter.peekWaitMs(estimate + (req.maxOutputTokens ?? 1024)),
      this.requestLimiter.peekWaitMs(1),
    );
  }

  /** Current budget headroom, for a status/diagnostics endpoint. */
  snapshot(): { model: string; tokens: { available: number; capacity: number }; requests: { available: number; capacity: number } } {
    return {
      model: this.modelName,
      tokens: this.tokenLimiter.snapshot(),
      requests: this.requestLimiter.snapshot(),
    };
  }

  async generateJson<T>(req: LlmJsonRequest): Promise<T> {
    const text = await this.complete(req);
    const first = parseAndValidate<T>(text, req.validate);
    if (first.ok) return first.value;

    // One correction attempt: ask the model to fix its own output — same
    // path whether the problem was invalid JSON syntax or JSON that didn't
    // match the caller's expected shape (e.g. `difficulty: "2"` instead of
    // `2`). A schema mismatch is just as recoverable as a syntax error, and
    // previously wasn't retried at all — it threw immediately.
    const retryReq: LlmJsonRequest = {
      system: req.system,
      user: `Your previous response ${first.problem} Return ONLY valid JSON, no markdown fences, no commentary. Previous response:\n\n${text}`,
      maxOutputTokens: req.maxOutputTokens,
    };
    // Deliberately not wrapped in a catch-and-replace: a genuine failure of
    // this call (rate limit, provider error) must propagate as itself, not
    // be masked as LlmInvalidJsonError — the pool's rate-limit failover
    // (GroqModelPool) only triggers on the real error type.
    const fixedText = await this.complete(retryReq);
    const second = parseAndValidate<T>(fixedText, req.validate);
    if (second.ok) return second.value;
    throw new LlmInvalidJsonError(second.problem, fixedText);
  }

  private async complete(req: LlmJsonRequest): Promise<string> {
    const estimate = req.estimatedInputTokens ?? Math.ceil((req.system.length + req.user.length) / 4);
    await this.tokenLimiter.reserve(estimate + (req.maxOutputTokens ?? 1024));
    await this.requestLimiter.reserve(1);

    const call = () =>
      this.client.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        response_format: { type: 'json_object' },
        max_tokens: req.maxOutputTokens ?? 2048,
      });

    let result;
    try {
      // A retry-after-aware delay, up to maxRetries, gives enough
      // cumulative wait to ride out a full 60s rate-limit window when
      // this is the only model available. In a pool, these are tightened
      // so a stuck model fails over to the next one quickly instead of
      // camping on its own backoff loop — see groqModelPool.ts.
      result = await retryWithBackoff(call, isTransientError, {
        maxRetries: this.maxRetries,
        baseDelayMs: 1000,
        maxDelayMs: this.maxRetryDelayMs,
        getDelayMs: retryAfterMs,
      });
    } catch (err) {
      if (isRateLimitError(err)) throw new LlmRateLimitedError();
      throw new LlmProviderError('Groq request failed', err);
    }

    return result.choices[0]?.message?.content ?? '';
  }
}
