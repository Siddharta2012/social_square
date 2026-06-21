import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
// Use mock when explicitly requested OR when no Redis URL is configured
const USE_MOCK = process.env.REDIS_MOCK === 'true' || !REDIS_URL;

function createRedis(): Redis {
  if (USE_MOCK) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RedisMock = require('ioredis-mock');
    console.log('[Redis] Using in-memory mock (REDIS_MOCK=true)');
    return new RedisMock();
  }

  const client = new Redis(REDIS_URL ?? 'redis://localhost:6379', {
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
