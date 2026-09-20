import { GoogleGenerativeAI } from '@google/generative-ai';
import { LlmClient, LlmInvalidJsonError, LlmJsonRequest, LlmProviderError, LlmRateLimitedError } from './types.js';
import { TokenBucketRateLimiter, retryWithBackoff } from './rateLimiter.js';

export interface GeminiClientOptions {
  apiKey: string;
  model?: string; // default: gemini-2.0-flash
  /** Gemini free-tier TPM budget to self-limit against. Tune per model/tier. */
  tokensPerMinute?: number;
}

function isRateLimitError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = String((err as Error)?.message ?? '');
  return status === 429 || /rate.?limit|quota|RESOURCE_EXHAUSTED/i.test(message);
}

function isTransientError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return isRateLimitError(err) || status === 503 || status === 500;
}

export class GeminiClient implements LlmClient {
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelName: string;
  private readonly limiter: TokenBucketRateLimiter;

  constructor(opts: GeminiClientOptions) {
    this.genAI = new GoogleGenerativeAI(opts.apiKey);
    this.modelName = opts.model ?? 'gemini-2.0-flash';
    // Conservative default; override via GEMINI_TPM_BUDGET once you've
    // checked the actual free-tier limit for the chosen model.
    this.limiter = new TokenBucketRateLimiter(opts.tokensPerMinute ?? 30000);
  }

  async generateJson<T>(req: LlmJsonRequest): Promise<T> {
    const estimate = req.estimatedInputTokens ?? Math.ceil((req.system.length + req.user.length) / 4);
    await this.limiter.reserve(estimate + (req.maxOutputTokens ?? 1024));

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: req.system,
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: req.maxOutputTokens ?? 2048,
      },
    });

    const call = () =>
      retryWithBackoff(
        () => model.generateContent(req.user),
        isTransientError,
        { maxRetries: 4, baseDelayMs: 1000 },
      );

    let result;
    try {
      result = await call();
    } catch (err) {
      if (isRateLimitError(err)) throw new LlmRateLimitedError();
      throw new LlmProviderError('Gemini request failed', err);
    }

    const text = result.response.text();
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
        const fixed = await this.generateJsonOnce(retryReq);
        return JSON.parse(fixed) as T;
      } catch {
        throw new LlmInvalidJsonError(undefined, text);
      }
    }
  }

  private async generateJsonOnce(req: LlmJsonRequest): Promise<string> {
    const estimate = req.estimatedInputTokens ?? Math.ceil((req.system.length + req.user.length) / 4);
    await this.limiter.reserve(estimate + (req.maxOutputTokens ?? 1024));
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: req.system,
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: req.maxOutputTokens ?? 2048 },
    });
    const result = await retryWithBackoff(() => model.generateContent(req.user), isTransientError);
    return result.response.text();
  }
}
