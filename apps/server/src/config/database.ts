import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { env } from './env';

// Generous enough for managed-Postgres cold starts (Railway etc.); 1.5s was too
// aggressive and made the first connection / readiness probe flaky on deploy.
const CONNECTION_TIMEOUT_MS = 8000;

let pool: Pool | null = null;

function databasePool(): Pool | null {
  if (!env.DATABASE_URL) return null;
  pool ??= new Pool({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 10_000,
    max: 2,
  });
  return pool;
}

export function getDatabasePool(): Pool {
  const db = databasePool();
  if (!db) throw new Error('DATABASE_URL is required for persistent account storage');
  return db;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getDatabasePool().query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getDatabasePool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function databaseReady(): Promise<{ ok: boolean; skipped: boolean; error?: string }> {
  const db = databasePool();
  if (!db) {
    return {
      ok: env.NODE_ENV !== 'production',
      skipped: env.NODE_ENV !== 'production',
      error: env.NODE_ENV === 'production' ? 'DATABASE_URL is required' : undefined,
    };
  }

  try {
    const client = await db.connect();
    try {
      await client.query('select 1');
      return { ok: true, skipped: false };
    } finally {
      client.release();
    }
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
