import { describe, expect, it } from 'vitest';
import { redis } from '../config/redis';
import { RateLimiter } from './rateLimit';

describe('RateLimiter', () => {
  it('blocks after the configured limit and recovers after the window', () => {
    const limiter = new RateLimiter();

    expect(limiter.hit('chat:user-1', 2, 1000, 100).allowed).toBe(true);
    expect(limiter.hit('chat:user-1', 2, 1000, 200).allowed).toBe(true);

    const blocked = limiter.hit('chat:user-1', 2, 1000, 300);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(800);

    expect(limiter.hit('chat:user-1', 2, 1000, 1200).allowed).toBe(true);
  });

  it('shares limits through Redis-compatible counters', async () => {
    const limiter = new RateLimiter();
    const key = `test:${Date.now()}:${Math.random()}`;
    await redis.del(`ratelimit:${key}`);

    await expect(limiter.hitShared(key, 1, 1000)).resolves.toMatchObject({ allowed: true });
    await expect(limiter.hitShared(key, 1, 1000)).resolves.toMatchObject({ allowed: false });
  });
});
