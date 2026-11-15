import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Client } from 'pg';

const url = new URL(process.env.DATABASE_URL);
if (!process.argv.includes('--local') || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || process.env.NODE_ENV === 'production') {
  throw new Error('This runner only accepts --local with a localhost database outside production. Use your deployment migration process for other environments.');
}
const name = '20261015_component_prototype_fields';
const sql = await readFile(new URL('../migrations/sql/20261015_component_prototype_fields.sql', import.meta.url), 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');
const client = new Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('factory:sql-migrations'))");
  await client.query('CREATE TABLE IF NOT EXISTS public.factory_sql_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const existing = await client.query('SELECT checksum FROM public.factory_sql_migrations WHERE name = $1', [name]);
  if (existing.rowCount) {
    if (existing.rows[0].checksum !== checksum) throw new Error('Applied migration checksum differs; do not modify an applied migration.');
    console.log('Component prototype fields migration already applied.');
  } else {
    await client.query(sql.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''));
    await client.query('INSERT INTO public.factory_sql_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
    console.log('Applied Component prototype fields migration to localhost. Existing accounts preserved.');
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { await client.end(); }


