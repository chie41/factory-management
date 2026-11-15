import 'dotenv/config';
import { Client } from 'pg';
import {
  PERMISSION_CATALOG,
  REQUIRED_ADMIN_PERMISSIONS,
} from '../src/auth/permission-catalog.ts';
const url = new URL(process.env.DATABASE_URL!);
if (
  !process.argv.includes('--local') ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  process.env.NODE_ENV === 'production'
)
  throw new Error('Use --local with a localhost development database.');
const client = new Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('factory:rbac'))");
  for (const [code, name] of PERMISSION_CATALOG)
    await client.query(
      'INSERT INTO permissions(id,code,name) VALUES(gen_random_uuid(),$1,$2) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name',
      [code, name],
    );
  // ADMIN owns the complete registered catalog; ordinary grants stay unchanged.
  const added = await client.query(
    `INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='ADMIN' AND p.code=ANY($1::text[]) ON CONFLICT DO NOTHING RETURNING role_id,permission_id`,
    [REQUIRED_ADMIN_PERMISSIONS],
  );
  if (added.rowCount) await client.query("INSERT INTO security_audit(target_id,action,before_state,after_state) VALUES($1,'rbac.admin_catalog_sync',$2::jsonb,$3::jsonb)", [added.rows[0].role_id, JSON.stringify({added_permission_ids:[]}),JSON.stringify({added_permission_ids:added.rows.map(row=>row.permission_id),reason:'ADMIN always has every registered permission'})]);
  await client.query('COMMIT');
  console.log('Permission catalog synchronized; existing grants preserved.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
