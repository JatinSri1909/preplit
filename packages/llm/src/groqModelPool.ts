import { LlmClient, LlmJsonRequest, LlmRateLimitedError } from './types.js';
import { GroqClient, GroqClientOptions } from './groqClient.js';

export interface GroqModelPoolOptions {
  apiKey: string;
  /** Ordered by preference — best output quality first. */
  models: Array<Omit<GroqClientOptions, 'apiKey' | 'maxRetries' | 'maxRetryDelayMs'>>;
  /** How long a model sits out after a real 429, before it's tried again. */
  cooldownMs?: number;
}

interface PoolMember {
  client: GroqClient;
  cooldownUntil: number;
}

/**
 * Groq's free-tier rate limits are per model, not per account: qwen3.8-27b
 * and gpt-oss-20b each get their own 30 RPM / 8K TPM budget (see
 * console.groq.com/docs/rate-limits). One model's cap being the whole
 * pipeline's ceiling is a self-inflicted limit — spreading calls across
 * several models multiplies the effective throughput instead.
 *
 * Each call goes to whichever pool member currently has headroom, not
 * always the most-preferred one — GroqClient.estimatedWaitMs() answers
 * that without reserving anything, so this never makes a call wait on
 * one model's queue when another is free right now. Preference order
 * still matters for output quality on a tie: JS's stable sort keeps the
 * given order for equal wait times, which is the common case.
 *
 * A real 429 that survives a member's own (tightened) retry budget takes
 * that model out of rotation for `cooldownMs` and the call falls over to
 * the next member — this is the actual point of pooling: a rate limit on
 * one model becomes a fallback to another, not an error surfaced to the
 * user. Any other kind of failure (invalid JSON, a genuine provider
 * error) is not a pooling problem and is not retried across members.
 */
export class GroqModelPool implements LlmClient {
  private readonly members: PoolMember[];
  private readonly cooldownMs: number;

  constructor(opts: GroqModelPoolOptions) {
    if (opts.models.length === 0) throw new Error('GroqModelPool needs at least one model.');
    // A single-model "pool" behaves exactly like using GroqClient directly
    // — there's nothing to fail over to, so it keeps GroqClient's patient
    // defaults. With more than one model, each member fails fast so a
    // stuck one hands off to the next quickly rather than each camping on
    // its own ~30s backoff in turn.
    const retry =
      opts.models.length > 1 ? { maxRetries: 1, maxRetryDelayMs: 4000 } : {};
    this.members = opts.models.map((m) => ({
      client: new GroqClient({ ...m, ...retry, apiKey: opts.apiKey }),
      cooldownUntil: 0,
    }));
    this.cooldownMs = opts.cooldownMs ?? 60_000;
  }

  async generateJson<T>(req: LlmJsonRequest): Promise<T> {
    let lastErr: unknown;
    for (const member of this.pickOrder(req)) {
      try {
        const result = await member.client.generateJson<T>(req);
        member.cooldownUntil = 0; // a success clears any earlier cooldown
        return result;
      } catch (err) {
        lastErr = err;
        if (err instanceof LlmRateLimitedError) {
          member.cooldownUntil = Date.now() + this.cooldownMs;
          continue; // try the next model in the pool
        }
        throw err;
      }
    }
    throw lastErr;
  }

  private pickOrder(req: LlmJsonRequest): PoolMember[] {
    const now = Date.now();
    const notCooling = this.members.filter((m) => m.cooldownUntil <= now);
    // If every model is cooling down, try anyway in preference order —
    // that's still better than refusing outright.
    if (notCooling.length === 0) return this.members;
    return [...notCooling].sort(
      (a, b) => a.client.estimatedWaitMs(req) - b.client.estimatedWaitMs(req),
    );
  }

  /** Per-model budget and cooldown state, for a status/diagnostics endpoint. */
  status(): Array<{
    model: string;
    tokens: { available: number; capacity: number };
    requests: { available: number; capacity: number };
    coolingDown: boolean;
  }> {
    const now = Date.now();
    return this.members.map((m) => ({
      ...m.client.snapshot(),
      coolingDown: m.cooldownUntil > now,
    }));
  }
}
