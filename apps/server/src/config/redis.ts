import Redis from 'ioredis';
import { env } from './env';

function createRedis(): Redis {
  if (env.USE_REDIS_MOCK) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RedisMock = require('ioredis-mock');
    console.log('[Redis] Using in-memory mock (REDIS_MOCK=true)');
    return new RedisMock();
  }

  const client = new Redis(env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 5) return null; // stop retrying after 5 attempts
      return Math.min(times * 500, 3000);
    },
  });

  client.on('error', (err) => {
    // Suppress repeated connection errors in dev
    if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
      console.warn('[Redis] Not reachable — run Docker or set REDIS_MOCK=true');
    }
  });

  return client;
}

export const redis = createRedis();
