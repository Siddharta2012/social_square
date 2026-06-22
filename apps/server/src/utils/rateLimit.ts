import { redis } from '../config/redis';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  hit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (bucket.count >= limit) {
      return { allowed: false, retryAfterMs: Math.max(0, bucket.resetAt - now) };
    }

    bucket.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  clearExpired(now = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  async hitShared(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.pexpire(redisKey, windowMs);
    if (count <= limit) return { allowed: true, retryAfterMs: 0 };
    const ttl = await redis.pttl(redisKey);
    return { allowed: false, retryAfterMs: ttl > 0 ? ttl : windowMs };
  }
}

export const authRateLimiter = new RateLimiter();
export const socketRateLimiter = new RateLimiter();
