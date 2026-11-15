import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Pool, types, type PoolClient } from 'pg';
// Business dates are calendar strings, never timezone-shifted JavaScript Dates.
types.setTypeParser(1082, (value) => value);
import { createHash } from 'node:crypto';
import { PERMISSION_CATALOG, REQUIRED_ADMIN_PERMISSIONS } from './permission-catalog.js';

export const EFFECTIVE_SQL = `
 SELECT rp.permission_id, 'role' AS source, r.id AS source_id, r.name AS source_name FROM user_roles ur
 JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id WHERE ur.user_id=$1
 UNION ALL SELECT gp.permission_id, 'group', g.id, g.name FROM user_groups ug
 JOIN groups g ON g.id=ug.group_id AND g.deleted_at IS NULL JOIN group_permissions gp ON gp.group_id=g.id WHERE ug.user_id=$1
 UNION ALL SELECT up.permission_id, 'direct', up.user_id, 'Cấp riêng' FROM user_permissions up WHERE up.user_id=$1`;
export type Account = {
  id: string;
  username: string;
  employee_id: string | null;
  status: string;
  updated_at: string;
  deleted_at: string | null;
  password_changed_at: Date | null;
};
@Injectable()
export class RbacService implements OnModuleDestroy, OnModuleInit {
  readonly pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  async onModuleInit() {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT pg_advisory_xact_lock(hashtext('factory:rbac'))");
      for (const [code, name] of PERMISSION_CATALOG) {
        await c.query('INSERT INTO permissions(id,code,name) VALUES(gen_random_uuid(),$1,$2) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name', [code,name]);
      }
      const added = (await c.query("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='ADMIN' AND p.code=ANY($1::text[]) ON CONFLICT DO NOTHING RETURNING role_id,permission_id", [REQUIRED_ADMIN_PERMISSIONS])).rows;
      if (added.length) await c.query("INSERT INTO security_audit(target_id,action,before_state,after_state) VALUES($1,'rbac.admin_catalog_sync',$2::jsonb,$3::jsonb)", [added[0].role_id,JSON.stringify({added_permission_ids:[]}),JSON.stringify({added_permission_ids:added.map(row=>row.permission_id),reason:'ADMIN always has every registered permission'})]);
      await c.query('COMMIT');
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally { c.release(); }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
  async active(
    userId: string,
    issuedAt?: number,
    client: Pool | PoolClient = this.pool,
    passwordRevision?: string | null,
  ) {
    const { rows } = await client.query<Account>(
      'SELECT id,username,employee_id,status,updated_at,deleted_at,password_changed_at FROM users WHERE id=$1',
      [userId],
    );
    const user = rows[0];
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.deleted_at ||
      (issuedAt !== undefined &&
        user.password_changed_at &&
        passwordRevision !== new Date(user.password_changed_at).toISOString())
    )
      throw new UnauthorizedException(
        'Tài khoản hoặc phiên đăng nhập không khả dụng',
      );
    return user;
  }
  async effective(userId: string, client: Pool | PoolClient = this.pool) {
    const { rows } = await client.query<{
      id: string;
      code: string;
      name: string;
      source: string;
      source_id: string;
      source_name: string;
    }>(
      `SELECT p.*, s.source,s.source_id,s.source_name FROM (${EFFECTIVE_SQL}) s JOIN permissions p ON p.id=s.permission_id ORDER BY p.code,s.source,s.source_id`,
      [userId],
    );
    const result = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        sources: { type: string; id: string; name: string }[];
      }
    >();
    for (const row of rows) {
      const item = result.get(row.code) ?? {
        id: row.id,
        code: row.code,
        name: row.name,
        sources: [],
      };
      item.sources.push({
        type: row.source,
        id: row.source_id,
        name: row.source_name,
      });
      result.set(row.code, item);
    }
    return [...result.values()];
  }
  async require(
    userId: string,
    permissions: string[],
    client: Pool | PoolClient = this.pool,
    mode: 'ALL' | 'ANY' = 'ALL',
  ) {
    await this.active(userId, undefined, client);
    const codes = new Set(
      (await this.effective(userId, client)).map((p) => p.code),
    );
    if (
      !(mode === 'ALL'
        ? permissions.every((p) => codes.has(p))
        : permissions.some((p) => codes.has(p)))
    )
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
  }
  async account(id: string, client: Pool | PoolClient = this.pool) {
    const { rows } = await client.query(
      `SELECT u.id,u.username,u.employee_id,u.status,u.created_at,u.updated_at,u.deleted_at, NOT u.employee_link_exempt AS can_join_group,
      e.full_name,e.employee_code FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1 AND u.deleted_at IS NULL`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Không tìm thấy tài khoản');
    const [roles, group, direct, effective] = await Promise.all([
      client.query(
        'SELECT r.* FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1 ORDER BY r.code',
        [id],
      ),
      client.query(
        'SELECT g.id,g.code,g.name FROM groups g JOIN user_groups ug ON ug.group_id=g.id WHERE ug.user_id=$1 AND g.deleted_at IS NULL',
        [id],
      ),
      client.query(
        'SELECT permission_id FROM user_permissions WHERE user_id=$1 ORDER BY permission_id',
        [id],
      ),
      this.effective(id, client),
    ]);
    const data = {
      ...rows[0],
      roles: roles.rows,
      group: group.rows[0] ?? null,
      direct_permission_ids: direct.rows.map((r) => r.permission_id as string),
      effective_permissions: effective,
    };
    return { ...data, version: this.version(data) };
  }
  version(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
  checkVersion(expected: string, actual: string) {
    if (expected !== actual)
      throw new ConflictException(
        'Dữ liệu đã thay đổi. Tải lại trước khi lưu.',
      );
  }
  async assertGrant(
    actor: string,
    permissionIds: string[],
    client: PoolClient,
  ) {
    const owned = new Set(
      (await this.effective(actor, client)).map((p) => p.id),
    );
    if (permissionIds.some((id) => !owned.has(id)))
      throw new ForbiddenException(
        'Không được cấp quyền vượt quá quyền hiệu lực của chính mình',
      );
  }
  async ensureAdmin(client: PoolClient) {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE status='ACTIVE' AND deleted_at IS NULL",
    );
    for (const user of rows) {
      const codes = new Set(
        (await this.effective(user.id, client)).map((p) => p.code),
      );
      if (REQUIRED_ADMIN_PERMISSIONS.every((code) => codes.has(code))) return;
    }
    throw new ConflictException(
      'Phải giữ ít nhất một tài khoản ACTIVE có đầy đủ quyền quản trị bắt buộc',
    );
  }
  /** All authorization writes serialize, recheck the actor, and validate the final state before commit. */
  async mutate<T>(
    actorId: string,
    permissions: string[],
    action: string,
    targetId: string | null,
    change: (client: PoolClient) => Promise<T>,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('factory:rbac'))",
      );
      await this.require(actorId, permissions, client);
      const actorManagement = (await this.effective(actorId, client))
        .map((p) => p.code)
        .filter((code) => REQUIRED_ADMIN_PERMISSIONS.includes(code));
      const before = targetId ? await this.snapshot(client, targetId) : null;
      const result = await change(client);
      const actorAfter = new Set(
        (await this.effective(actorId, client)).map((p) => p.code),
      );
      if (actorManagement.some((code) => !actorAfter.has(code)))
        throw new ForbiddenException(
          'Không thể tự thu hồi quyền quản trị đang có của mình; hãy nhờ quản trị viên khác thực hiện',
        );
      await this.ensureAdmin(client);
      const after = targetId ? await this.snapshot(client, targetId) : result;
      const createdId = (result as { data?: { id?: string } } | undefined)?.data
        ?.id;
      await client.query(
        'INSERT INTO security_audit(actor_id,target_id,action,before_state,after_state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',
        [
          actorId,
          targetId ?? createdId ?? null,
          action,
          JSON.stringify(before),
          JSON.stringify(after),
        ],
      );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      const code = (error as { code?: string }).code;
      if (code === '23505')
        throw new ConflictException(
          'Mã, tên đăng nhập hoặc nhân viên đã được sử dụng',
        );
      if (code === '23503' || code === '23514' || code === '23502')
        throw new BadRequestException(
          'Dữ liệu liên kết hoặc trạng thái không hợp lệ',
        );
      throw error;
    } finally {
      client.release();
    }
  }
  private async snapshot(client: PoolClient, id: string) {
    // Explicit projection: never include password hashes, passwords, or tokens.
    const user = await client.query(
      'SELECT id,username,employee_id,status,deleted_at FROM users WHERE id=$1',
      [id],
    );
    if (user.rows[0])
      return {
        ...user.rows[0],
        permissions: await this.effective(id, client),
        roles: (
          await client.query(
            'SELECT role_id FROM user_roles WHERE user_id=$1',
            [id],
          )
        ).rows,
        group: (
          await client.query(
            'SELECT group_id FROM user_groups WHERE user_id=$1',
            [id],
          )
        ).rows,
      };
    return {
      role: (await client.query('SELECT * FROM roles WHERE id=$1', [id])).rows,
      group: (await client.query('SELECT * FROM groups WHERE id=$1', [id]))
        .rows,
      role_permissions: (
        await client.query(
          'SELECT permission_id FROM role_permissions WHERE role_id=$1',
          [id],
        )
      ).rows,
      group_permissions: (
        await client.query(
          'SELECT permission_id FROM group_permissions WHERE group_id=$1',
          [id],
        )
      ).rows,
    };
  }
}
