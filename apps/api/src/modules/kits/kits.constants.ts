/**
 * A kit that has been "generating" for longer than this was almost
 * certainly orphaned by a process restart — nothing is still running that
 * will ever move it on. The GET route flips these to failed so the
 * interface shows an honest error with a retry instead of a spinner that
 * never resolves.
 */
export const STALE_GENERATION_MS = 10 * 60 * 1000;

// All three are Groq's other current free chat models alongside
// gpt-oss-120b — each gets its own 30 RPM / 8K TPM budget (see
// console.groq.com/docs/rate-limits), so pooling them multiplies
// available throughput instead of one model's cap being the app's
// ceiling. Best quality first; GroqModelPool only drops to a later one
// when the preferred one is actually busy or cooling down from a 429.
export const DEFAULT_MODEL_POOL = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
