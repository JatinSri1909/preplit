import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GroqModelPool } from './groqModelPool.js';

const create = vi.fn();

// vi.mock calls are hoisted above imports by vitest, so this applies
// before groqModelPool.js (and the groq-sdk it pulls in) is evaluated.
vi.mock('groq-sdk', () => ({
  default: class MockGroq {
    chat = { completions: { create } };
  },
}));

function jsonResult(content: unknown) {
  return { choices: [{ message: { content: JSON.stringify(content) } }] };
}

function rateLimitError() {
  return Object.assign(new Error('429 Too Many Requests'), { status: 429 });
}

beforeEach(() => {
  create.mockReset();
});

describe('GroqModelPool', () => {
  it('falls back to the next model when the preferred one is rate-limited', async () => {
    create.mockImplementation(async (req: { model: string }) => {
      if (req.model === 'model-a') throw rateLimitError();
      return jsonResult({ ok: true, via: req.model });
    });

    const pool = new GroqModelPool({
      apiKey: 'test-key',
      models: [{ model: 'model-a' }, { model: 'model-b' }],
    });

    const result = await pool.generateJson<{ ok: boolean; via: string }>({
      system: 'system prompt with json in it',
      user: 'hello',
    });

    expect(result).toEqual({ ok: true, via: 'model-b' });

    const status = pool.status();
    expect(status.find((s) => s.model === 'model-a')?.coolingDown).toBe(true);
    expect(status.find((s) => s.model === 'model-b')?.coolingDown).toBe(false);
  }, 10_000);

  it('routes a call to whichever model has budget headroom right now', async () => {
    create.mockImplementation(async (req: { model: string }) => jsonResult({ via: req.model }));

    const pool = new GroqModelPool({
      apiKey: 'test-key',
      // model-a is "preferred" but has a tiny budget that the first call
      // almost exhausts; model-b is comparatively huge.
      models: [
        { model: 'model-a', tokensPerMinute: 200, requestsPerMinute: 100 },
        { model: 'model-b', tokensPerMinute: 100_000, requestsPerMinute: 100 },
      ],
    });

    const req = { system: 'system prompt with json in it', user: 'hello', maxOutputTokens: 50 };

    const first = await pool.generateJson<{ via: string }>(req);
    expect(first.via).toBe('model-a'); // both idle — preferred order wins on a tie

    const second = await pool.generateJson<{ via: string }>({ ...req, maxOutputTokens: 150 });
    expect(second.via).toBe('model-b'); // model-a's tiny budget is now the busier one
  }, 10_000);

  it('does not fall back on a non-rate-limit failure', async () => {
    create.mockImplementation(async () => {
      throw Object.assign(new Error('500 Internal Server Error'), { status: 500 });
    });

    const pool = new GroqModelPool({
      apiKey: 'test-key',
      models: [{ model: 'model-a' }, { model: 'model-b' }],
    });

    await expect(
      pool.generateJson({ system: 'system prompt with json in it', user: 'hello' }),
    ).rejects.toThrow();
    // Both attempted at most through model-a's own retry — model-b's
    // create() should never have been called for a non-rate-limit error.
    expect(create.mock.calls.every(([req]) => req.model === 'model-a')).toBe(true);
  }, 10_000);
});
