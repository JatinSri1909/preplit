import { GroqModelPool, type LlmClient } from '@prep-kit/llm';
import { DEFAULT_MODEL_POOL, STALE_GENERATION_MS } from './kits.constants.js';

// Cached across warm invocations (see app.ts's per-request connectDb
// pattern for why that matters here too) so the rate limiters — and the
// cooldown state they track per model — persist between requests
// instead of resetting on every call.
let cachedClient: LlmClient | undefined;

export function llmClient(): LlmClient {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set. See .env.example.');
  const tokensPerMinute = process.env.GROQ_TPM_BUDGET ? Number(process.env.GROQ_TPM_BUDGET) : undefined;
  const requestsPerMinute = process.env.GROQ_RPM_BUDGET ? Number(process.env.GROQ_RPM_BUDGET) : undefined;

  // GROQ_MODEL_POOL (comma-separated) wins if set; a lone GROQ_MODEL
  // still works exactly as before (a "pool" of one, no fallback
  // possible); with neither set, default to the pool above rather than
  // a single hardcoded model.
  const models = process.env.GROQ_MODEL_POOL
    ? process.env.GROQ_MODEL_POOL.split(',').map((m) => m.trim()).filter(Boolean)
    : [process.env.GROQ_MODEL ?? DEFAULT_MODEL_POOL[0]];

  cachedClient = new GroqModelPool({
    apiKey,
    models: models.map((model) => ({ model, tokensPerMinute, requestsPerMinute })),
  });
  return cachedClient;
}

/**
 * Per-model rate-limit headroom, for the `/llm-status` route — so "is the
 * pool actually helping, or is every model cooling down right now" is a
 * request away instead of a guess from the logs.
 */
export function llmPoolStatus(): ReturnType<GroqModelPool['status']> | null {
  const client = llmClient();
  return client instanceof GroqModelPool ? client.status() : null;
}

export function isStaleGeneration(status: string, updatedAt: Date): boolean {
  return status === 'generating' && Date.now() - updatedAt.getTime() > STALE_GENERATION_MS;
}
