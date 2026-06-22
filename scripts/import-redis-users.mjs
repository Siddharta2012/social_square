import process from 'node:process';
import Redis from 'ioredis';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

if (!databaseUrl) {
  console.error('[import-redis-users] DATABASE_URL is required');
  process.exit(1);
}

const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});
const pgClient = new pg.Client({ connectionString: databaseUrl });

function json(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function normalizeUser(raw) {
  const now = Date.now();
  const userId = typeof raw.userId === 'string' ? raw.userId : `import_${now}`;
  return {
    id: userId,
    username: typeof raw.username === 'string' && raw.username.trim() ? raw.username.trim() : userId,
    provider: raw.provider === 'google' ? 'google' : 'password',
    passwordHash: typeof raw.passwordHash === 'string' ? raw.passwordHash : null,
    googleSub: typeof raw.googleSub === 'string' ? raw.googleSub : null,
    email: typeof raw.email === 'string' ? raw.email : null,
    displayName: typeof raw.displayName === 'string' ? raw.displayName : null,
    picture: typeof raw.picture === 'string' ? raw.picture : null,
    avatarConfig: raw.avatarConfig ?? null,
    position: raw.position ?? null,
    unlockedItems: Array.isArray(raw.unlockedItems) ? raw.unlockedItems.filter((item) => typeof item === 'string') : [],
    petals: Number.isFinite(raw.petals) ? Math.max(0, Math.trunc(raw.petals)) : 0,
    stats: raw.stats ?? {},
    migratedFromUserId: typeof raw.migratedFromUserId === 'string' ? raw.migratedFromUserId : null,
    createdAt: Number.isFinite(raw.createdAt) ? new Date(raw.createdAt) : new Date(),
    updatedAt: Number.isFinite(raw.updatedAt) ? new Date(raw.updatedAt) : new Date(),
  };
}

async function importUser(user) {
  await pgClient.query('BEGIN');
  try {
    await pgClient.query(
      `
        INSERT INTO users (
          id, username, provider, password_hash, google_sub, email, display_name,
          picture, avatar_config, position, unlocked_items, petals, stats,
          migrated_from_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13::jsonb, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          provider = EXCLUDED.provider,
          password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
          google_sub = COALESCE(EXCLUDED.google_sub, users.google_sub),
          email = COALESCE(EXCLUDED.email, users.email),
          display_name = COALESCE(EXCLUDED.display_name, users.display_name),
          picture = COALESCE(EXCLUDED.picture, users.picture),
          avatar_config = COALESCE(EXCLUDED.avatar_config, users.avatar_config),
          position = COALESCE(EXCLUDED.position, users.position),
          unlocked_items = EXCLUDED.unlocked_items,
          petals = GREATEST(users.petals, EXCLUDED.petals),
          stats = EXCLUDED.stats,
          migrated_from_user_id = COALESCE(EXCLUDED.migrated_from_user_id, users.migrated_from_user_id),
          updated_at = NOW()
      `,
      [
        user.id,
        user.username,
        user.provider,
        user.passwordHash,
        user.googleSub,
        user.email,
        user.displayName,
        user.picture,
        user.avatarConfig ? json(user.avatarConfig, null) : null,
        user.position ? json(user.position, null) : null,
        json(user.unlockedItems, []),
        user.petals,
        json(user.stats, {}),
        user.migratedFromUserId,
        user.createdAt,
        user.updatedAt,
      ],
    );

    if (user.petals > 0) {
      await pgClient.query(
        `
          INSERT INTO petal_ledger (user_id, delta, reason, ref_id, balance_after)
          VALUES ($1, $2, 'redis-import', $3, $2)
          ON CONFLICT (user_id, ref_id) WHERE ref_id IS NOT NULL DO NOTHING
        `,
        [user.id, user.petals, `redis-import:${user.id}`],
      );
    }

    await pgClient.query('COMMIT');
  } catch (err) {
    await pgClient.query('ROLLBACK');
    throw err;
  }
}

try {
  await redis.connect();
  await pgClient.connect();

  let cursor = '0';
  let imported = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'user:id:*', 'COUNT', 100);
    cursor = nextCursor;
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      await importUser(normalizeUser(parsed));
      imported += 1;
    }
  } while (cursor !== '0');

  console.log(`[import-redis-users] imported ${imported} users`);
} finally {
  await redis.quit().catch(() => undefined);
  await pgClient.end().catch(() => undefined);
}
