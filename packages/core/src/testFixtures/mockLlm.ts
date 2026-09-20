import type { LlmClient, LlmJsonRequest } from '@prep-kit/llm';

/**
 * A scriptable LlmClient for tests: each call to generateJson pops the next
 * response from the queue, or calls a handler function if one was given.
 * Lets us test extraction/generation/pipeline sequencing logic without a
 * real API key or network access.
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
    return this.queue.shift() as T;
  }
}
