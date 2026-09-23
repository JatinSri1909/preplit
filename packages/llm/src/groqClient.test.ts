import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GroqClient } from './groqClient.js';
import { LlmInvalidJsonError } from './types.js';

const create = vi.fn();

// vi.mock calls are hoisted above imports by vitest, so this applies
// before groqClient.js (and the groq-sdk it pulls in) is evaluated.
vi.mock('groq-sdk', () => ({
  default: class MockGroq {
    chat = { completions: { create } };
  },
}));

function textResult(content: string) {
  return { choices: [{ message: { content } }] };
}

beforeEach(() => {
  create.mockReset();
});

describe('GroqClient.generateJson', () => {
  it('retries once and succeeds when the first response is not valid JSON', async () => {
    create
      .mockResolvedValueOnce(textResult('not json at all'))
      .mockResolvedValueOnce(textResult(JSON.stringify({ ok: true })));

    const client = new GroqClient({ apiKey: 'test-key' });
    const result = await client.generateJson<{ ok: boolean }>({ system: 's', user: 'u' });

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('retries once and succeeds when the first response is valid JSON but fails the caller\'s shape check', async () => {
    // The exact real-world failure this fix targets: difficulty returned as
    // a string instead of the literal 1 | 2 | 3 the caller expects.
    create
      .mockResolvedValueOnce(textResult(JSON.stringify({ difficulty: '2' })))
      .mockResolvedValueOnce(textResult(JSON.stringify({ difficulty: 2 })));

    const client = new GroqClient({ apiKey: 'test-key' });
    const validate = (value: unknown) =>
      typeof (value as { difficulty?: unknown })?.difficulty === 'number'
        ? { valid: true as const }
        : { valid: false as const, message: 'difficulty must be a number' };

    const result = await client.generateJson<{ difficulty: number }>({ system: 's', user: 'u', validate });

    expect(result).toEqual({ difficulty: 2 });
    expect(create).toHaveBeenCalledTimes(2);
    // The correction prompt tells the model what was wrong, not just "not valid JSON".
    expect(create.mock.calls[1][0].messages[1].content).toContain('difficulty must be a number');
  });

  it('throws LlmInvalidJsonError when the shape check still fails after the correction attempt', async () => {
    create
      .mockResolvedValueOnce(textResult(JSON.stringify({ difficulty: '2' })))
      .mockResolvedValueOnce(textResult(JSON.stringify({ difficulty: '3' })));

    const client = new GroqClient({ apiKey: 'test-key' });
    const validate = () => ({ valid: false as const, message: 'difficulty must be a number' });

    await expect(client.generateJson({ system: 's', user: 'u', validate })).rejects.toThrow(LlmInvalidJsonError);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
