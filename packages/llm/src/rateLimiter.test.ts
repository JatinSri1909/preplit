import { describe, expect, it } from 'vitest';
import { TokenBucketRateLimiter } from './rateLimiter.js';

describe('TokenBucketRateLimiter', () => {
  it('reports zero wait and full headroom on a fresh bucket', () => {
    const limiter = new TokenBucketRateLimiter(6000);
    expect(limiter.peekWaitMs(1000)).toBe(0);
    expect(limiter.snapshot()).toEqual({ available: 6000, capacity: 6000 });
  });

  it('peekWaitMs does not consume budget — repeated calls stay consistent', () => {
    const limiter = new TokenBucketRateLimiter(6000);
    limiter.peekWaitMs(5000);
    limiter.peekWaitMs(5000);
    expect(limiter.snapshot().available).toBe(6000);
  });

  it('reports a positive wait once a reserve() exhausts the bucket', async () => {
    const limiter = new TokenBucketRateLimiter(6000);
    await limiter.reserve(6000);
    expect(limiter.snapshot().available).toBe(0);
    expect(limiter.peekWaitMs(1)).toBeGreaterThan(0);
  });

  it('a request-count limiter (capacity 1) reports busy after one reservation', async () => {
    const limiter = new TokenBucketRateLimiter(28);
    await limiter.reserve(1);
    // 27 of 28 left — still no wait for the next single request.
    expect(limiter.peekWaitMs(1)).toBe(0);
    await limiter.reserve(27);
    // Now fully drained.
    expect(limiter.peekWaitMs(1)).toBeGreaterThan(0);
  });
});
