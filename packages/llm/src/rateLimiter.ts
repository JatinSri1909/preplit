/**
 * Free-tier LLM providers cap tokens-per-minute, not just requests-per-
 * minute (the brief calls this out explicitly as the #1 way to lose
 * points). A naive per-request rate limiter isn't enough — a single large
 * prompt can blow the TPM budget on its own.
 *
 * This is a simple token-bucket: callers reserve an estimated token cost
 * before calling the provider, and the bucket refills continuously at
 * tokensPerMinute / 60 per second. If there isn't enough budget, the
 * caller awaits until there is, rather than firing the request and hoping.
 *
 * On top of that, retryWithBackoff wraps the actual provider call so a
 * 429/"slow down" response (which can still happen — estimates are
 * approximate) triggers exponential backoff with jitter instead of an
 * immediate failure.
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly tokensPerMinute: number,
    private readonly maxBucket: number = tokensPerMinute,
  ) {
    this.tokens = maxBucket;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.lastRefill = now;
    this.tokens = Math.min(this.maxBucket, this.tokens + elapsedSec * (this.tokensPerMinute / 60));
  }

  async reserve(estimatedTokens: number): Promise<void> {
    if (estimatedTokens > this.maxBucket) {
      // refill() caps `tokens` at maxBucket, so the loop below would never
      // see enough budget and would await forever — fail fast instead.
      throw new RangeError(
        `Cannot reserve ${estimatedTokens} tokens: exceeds this limiter's bucket capacity of ${this.maxBucket}.`,
      );
    }
    for (;;) {
      this.refill();
      if (this.tokens >= estimatedTokens) {
        this.tokens -= estimatedTokens;
        return;
      }
      const deficit = estimatedTokens - this.tokens;
      const waitMs = Math.ceil((deficit / (this.tokensPerMinute / 60)) * 1000);
      await sleep(Math.min(waitMs, 5000)); // recheck at least every 5s
    }
  }

  /**
   * How long a `reserve(amount)` call would have to wait right now,
   * without actually reserving anything. Lets a caller compare several
   * limiters (e.g. one per model in a pool) and pick the least busy one
   * before committing to it.
   */
  peekWaitMs(amount: number): number {
    this.refill();
    if (this.tokens >= amount) return 0;
    const deficit = amount - this.tokens;
    return Math.ceil((deficit / (this.tokensPerMinute / 60)) * 1000);
  }

  /** Current headroom, for surfacing in status/diagnostics endpoints. */
  snapshot(): { available: number; capacity: number } {
    this.refill();
    return { available: Math.floor(this.tokens), capacity: this.maxBucket };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BackoffOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /**
   * Called with each error before falling back to the exponential formula.
   * Return a delay in ms to use it instead — e.g. to honour a provider's
   * Retry-After header, which tells you the exact wait rather than a guess.
   */
  getDelayMs?: (err: unknown, attempt: number) => number | undefined;
}

/**
 * Retries `fn` on failures that `isRetryable` accepts, with exponential
 * backoff + jitter. Re-throws the last error once maxRetries is exhausted
 * so the caller (pipeline) can record it as a structured BatchError rather
 * than crashing the whole batch run.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  isRetryable: (err: unknown) => boolean,
  opts: BackoffOptions = {},
): Promise<T> {
  const { maxRetries = 4, baseDelayMs = 1000, maxDelayMs = 20000, getDelayMs } = opts;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > maxRetries || !isRetryable(err)) throw err;
      const override = getDelayMs?.(err, attempt);
      const delay = override ?? Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.random() * delay * 0.25;
      await sleep(delay + jitter);
    }
  }
}
