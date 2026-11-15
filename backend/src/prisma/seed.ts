import 'dotenv/config';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { PERMISSION_CATALOG } from '../auth/permission-catalog.js';
async function main() {
  const password = process.env['ADMIN_PASSWORD'];
  if (!password || password.length < 12)
    throw new Error('ADMIN_PASSWORD phải có ít nhất 12 ký tự');
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const c = new Client({ connectionString: process.env['DATABASE_URL'] });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(hashtext('factory:rbac'))");
    const role = (
      await c.query<{ id: string }>(
        "INSERT INTO roles(id,code,name) VALUES(gen_random_uuid(),'ADMIN','Quản trị hệ thống') ON CONFLICT(code) DO UPDATE SET name=roles.name RETURNING id",
      )
    ).rows[0]!;
    const admin = (
      await c.query<{ id: string }>(
        "INSERT INTO users(id,username,password_hash,status,employee_link_exempt) VALUES(gen_random_uuid(),'admin',$1,'ACTIVE',true) ON CONFLICT(username) DO UPDATE SET username=users.username RETURNING id",
        [hash],
      )
    ).rows[0]!;
    for (const [code, name] of PERMISSION_CATALOG) {
      const p = (
        await c.query<{ id: string }>(
          'INSERT INTO permissions(id,code,name) VALUES(gen_random_uuid(),$1,$2) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name RETURNING id',
          [code, name],
        )
      ).rows[0]!;
      await c.query(
        'INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [role.id, p.id],
      );
    }
    await c.query(
      'INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [admin.id, role.id],
    );
    await c.query('COMMIT');
    console.log(
      'Seed ADMIN và catalog hoàn tất. Mật khẩu tài khoản đã tồn tại được giữ nguyên.',
    );
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    await c.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    'Seed thất bại:',
    error instanceof Error ? error.message : 'unknown',
  );
  process.exitCode = 1;
});
