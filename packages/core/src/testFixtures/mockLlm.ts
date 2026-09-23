import { LlmClient, LlmInvalidJsonError, LlmJsonRequest } from '@prep-kit/llm';

/**
 * A scriptable LlmClient for tests: each call to generateJson pops the next
 * response from the queue, or calls a handler function if one was given.
 * Lets us test extraction/generation/pipeline sequencing logic without a
 * real API key or network access.
 *
 * Runs the caller's `validate` against the popped response, same as the
 * real GroqClient does — callers no longer safeParse the result themselves
 * (see groqClient.ts's generateJson), so a test scripting a schema-invalid
 * response needs this to actually reject, not hand back the raw value.
 * Unlike GroqClient this doesn't simulate the one-shot correction retry —
 * these tests are about the caller's reaction to a final failure, not the
 * retry mechanics, which are covered where generateJson itself is tested.
 */
export class MockLlmClient implements LlmClient {
  private queue: unknown[];
  public readonly calls: LlmJsonRequest[] = [];

  constructor(responses: unknown[] = []) {
    this.queue = [...responses];
  }

  async generateJson<T>(req: LlmJsonRequest): Promise<T> {
    this.calls.push(req);
    if (this.queue.length === 0) {
      throw new Error('MockLlmClient: no more scripted responses');
    }
    const value = this.queue.shift();
    if (req.validate) {
      const outcome = req.validate(value);
      if (!outcome.valid) {
        throw new LlmInvalidJsonError(`did not match the required shape: ${outcome.message}`, JSON.stringify(value));
      }
    }
    return value as T;
  }
}
