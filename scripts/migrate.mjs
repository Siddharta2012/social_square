import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');
const requireFromServer = createRequire(path.join(__dirname, '../apps/server/package.json'));
const pg = requireFromServer('pg');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('[migrate] DATABASE_URL is not set — cannot run migrations and the app cannot start.');
  console.error('[migrate] Fix it on the SERVER service in Railway → Variables → New Variable:');
  console.error('[migrate]     DATABASE_URL = ${{Postgres.DATABASE_URL}}');
  console.error('[migrate] (replace "Postgres" with your database service name). Then redeploy.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const existing = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [version]);
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`[migrate] skip ${version}`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      console.log(`[migrate] applied ${version}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  console.log('[migrate] done');
} finally {
  await client.end().catch(() => undefined);
}
