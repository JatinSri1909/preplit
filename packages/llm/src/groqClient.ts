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
  const headers = (err as { headers?: { get?(name: string): string | null } })?.headers;
  const raw = headers?.get?.('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 250 : undefined;
}

export class GroqClient implements LlmClient {
  private readonly client: Groq;
  private readonly modelName: string;
  private readonly tokenLimiter: TokenBucketRateLimiter;
  private readonly requestLimiter: TokenBucketRateLimiter;

  constructor(opts: GroqClientOptions) {
    // Our own rateLimiter + retryWithBackoff already handle pacing and
    // retries; disable the SDK's built-in retry-on-429 so the two don't
    // stack into unpredictable delays.
    this.client = new Groq({ apiKey: opts.apiKey, maxRetries: 0 });
    this.modelName = opts.model ?? 'llama-3.3-70b-versatile';
    this.tokenLimiter = new TokenBucketRateLimiter(opts.tokensPerMinute ?? 6000);
    this.requestLimiter = new TokenBucketRateLimiter(opts.requestsPerMinute ?? 28);
  }

  async generateJson<T>(req: LlmJsonRequest): Promise<T> {
    const text = await this.complete(req);
    try {
      return JSON.parse(text) as T;
    } catch {
      // One correction attempt: ask the model to fix its own output.
      const retryReq: LlmJsonRequest = {
        system: req.system,
        user: `Your previous response was not valid JSON. Return ONLY valid JSON, no markdown fences, no commentary. Previous response:\n\n${text}`,
        maxOutputTokens: req.maxOutputTokens,
      };
      try {
        const fixed = await this.complete(retryReq);
        return JSON.parse(fixed) as T;
      } catch {
        throw new LlmInvalidJsonError(undefined, text);
      }
    }
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
      // maxRetries=6 + a retry-after-aware delay gives enough cumulative
      // wait to ride out a full 60s rate-limit window, not just a couple of
      // short exponential hops that give up before the window resets.
      result = await retryWithBackoff(call, isTransientError, {
        maxRetries: 6,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        getDelayMs: retryAfterMs,
      });
    } catch (err) {
      if (isRateLimitError(err)) throw new LlmRateLimitedError();
      throw new LlmProviderError('Groq request failed', err);
    }

    return result.choices[0]?.message?.content ?? '';
  }
}
