import { describe, expect, it } from 'vitest';
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
});
