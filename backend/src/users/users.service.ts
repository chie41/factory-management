import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { PoolClient } from 'pg';
import { RbacService } from '../auth/rbac.service.js';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  ResetUserPasswordDto,
  SetUserRolesDto,
  GroupIdDto,
  PermissionIdsDto,
  VersionDto,
} from './dto/rbac.dto.js';
import { QueryUsersDto } from './dto/query-users.dto.js';
@Injectable()
export class UsersService {
  constructor(private readonly rbac: RbacService) {}
  async findAll(q: QueryUsersDto) {
    const { rows } = await this.rbac.pool.query<{ id: string }>(
      `SELECT u.id FROM users u LEFT JOIN employees e ON e.id=u.employee_id
   WHERE u.deleted_at IS NULL AND ($1::text IS NULL OR u.status=$1)
   AND ($2='' OR u.username ILIKE '%'||$2||'%' OR e.full_name ILIKE '%'||$2||'%' OR e.employee_code ILIKE '%'||$2||'%')
   AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM user_groups WHERE user_id=u.id AND group_id=$3))
   AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role_id=$4)) ORDER BY u.created_at DESC,u.id`,
      [
        q.status ?? null,
        q.q?.trim() ?? '',
        q.group_id ?? null,
        q.role_id ?? null,
      ],
    );
    const page = q.page ?? 1,
      size = q.page_size ?? 20;
    return {
      data: await Promise.all(
        rows
          .slice((page - 1) * size, page * size)
          .map((r) => this.rbac.account(r.id)),
      ),
      meta: {
        page,
        page_size: size,
        total: rows.length,
        total_pages: Math.ceil(rows.length / size),
      },
    };
  }
  async eligibleEmployees() {
    return {
      data: (
        await this.rbac.pool.query(
          `SELECT id,employee_code,full_name FROM employees e WHERE deleted_at IS NULL AND status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM users u WHERE u.employee_id=e.id AND u.deleted_at IS NULL) ORDER BY full_name`,
        )
      ).rows,
    };
  }
  async findRoles() {
    return {
      data: (await this.rbac.pool.query('SELECT * FROM roles ORDER BY code'))
        .rows,
    };
  }
  async findOne(id: string) {
    return { data: await this.rbac.account(id) };
  }
  async employee(client: PoolClient, id: string) {
    if (
      !(
        await client.query(
          "SELECT id FROM employees WHERE id=$1 AND deleted_at IS NULL AND status='ACTIVE'",
          [id],
        )
      ).rowCount
    )
      throw new BadRequestException('Nhân viên không đủ điều kiện liên kết');
  }
  async create(dto: CreateUserDto, actorId: string) {
    const required = [
      'users.create',
      ...(dto.group_id ? ['users.groups.manage'] : []),
      ...(dto.role_ids?.length ? ['users.roles.manage'] : []),
      ...(dto.permission_ids?.length ? ['users.permissions.manage'] : []),
    ];
    const hash = await argon2.hash(dto.password);
    return this.rbac.mutate(
      actorId,
      required,
      'users.create',
      null,
      async (client) => {
        await this.employee(client, dto.employee_id);
        if (!dto.username.trim())
          throw new BadRequestException('Tên đăng nhập không được trống');
        const { rows } = await client.query<{ id: string }>(
          'INSERT INTO users(id,username,password_hash,employee_id,status,created_at,updated_at) VALUES(gen_random_uuid(),$1,$2,$3,$4,now(),now()) RETURNING id',
          [dto.username.trim(), hash, dto.employee_id, dto.status ?? 'ACTIVE'],
        );
        const id = rows[0]!.id;
        if (dto.group_id)
          await this.assignGroup(client, id, dto.group_id, actorId);
        await this.replace(client, 'roles', id, dto.role_ids ?? [], actorId);
        await this.replace(
          client,
          'permissions',
          id,
          dto.permission_ids ?? [],
          actorId,
        );
        return { data: await this.rbac.account(id, client) };
      },
    );
  }
  private async write(
    id: string,
    actorId: string,
    permission: string,
    version: string,
    change: (client: PoolClient) => Promise<void>,
  ) {
    return this.rbac.mutate(
      actorId,
      [permission],
      permission,
      id,
      async (client) => {
        this.rbac.checkVersion(
          version,
          (await this.rbac.account(id, client)).version,
        );
        await change(client);
        await client.query(
          'UPDATE users SET updated_at=clock_timestamp() WHERE id=$1',
          [id],
        );
        return { data: await this.rbac.account(id, client) };
      },
    );
  }
  async update(_id: string, _dto: UpdateUserDto, _actorId: string) {
    throw new BadRequestException(
      'Liên kết nhân viên của tài khoản là cố định, không thể thay đổi',
    );
  }
  async changeStatus(id: string, dto: UpdateUserStatusDto, actorId: string) {
    if (id === actorId && dto.status !== 'ACTIVE')
      throw new ForbiddenException('Không thể tự khóa / vô hiệu hóa tài khoản');
    return this.write(
      id,
      actorId,
      'users.status.manage',
      dto.version,
      async (c) => {
        await c.query(
          'UPDATE users SET status=$2,failed_login_attempts=0,login_blocked_until=NULL WHERE id=$1',
          [id, dto.status],
        );
      },
    );
  }
  async resetPassword(id: string, dto: ResetUserPasswordDto, actorId: string) {
    const hash = await argon2.hash(dto.new_password);
    return this.write(
      id,
      actorId,
      'users.password.reset',
      dto.version,
      async (c) => {
        await c.query(
          'UPDATE users SET password_hash=$2,password_changed_at=clock_timestamp(),failed_login_attempts=0,login_blocked_until=NULL WHERE id=$1',
          [id, hash],
        );
      },
    );
  }
  async setRoles(id: string, dto: SetUserRolesDto, actorId: string) {
    return this.write(id, actorId, 'users.roles.manage', dto.version, (c) =>
      this.replace(c, 'roles', id, dto.role_ids, actorId),
    );
  }
  async setPermissions(id: string, dto: PermissionIdsDto, actorId: string) {
    return this.write(
      id,
      actorId,
      'users.permissions.manage',
      dto.version,
      (c) => this.replace(c, 'permissions', id, dto.permission_ids, actorId),
    );
  }
  async setGroup(id: string, dto: GroupIdDto, actorId: string) {
    return this.write(id, actorId, 'users.groups.manage', dto.version, (c) =>
      this.assignGroup(c, id, dto.group_id, actorId),
    );
  }
  private async assignGroup(
    c: PoolClient,
    id: string,
    groupId: string | null,
    actor: string,
  ) {
    if (groupId && (await c.query<{employee_link_exempt:boolean}>('SELECT employee_link_exempt FROM users WHERE id=$1',[id])).rows[0]?.employee_link_exempt) {
      throw new BadRequestException('Tài khoản admin hệ thống không được tham gia nhóm quyền');
    }
    if (groupId) {
      const permissions = await c.query<{ permission_id: string }>(
        'SELECT permission_id FROM group_permissions WHERE group_id=$1',
        [groupId],
      );
      await this.rbac.assertGrant(
        actor,
        permissions.rows.map((p) => p.permission_id),
        c,
      );
    }
    if (
      groupId &&
      !(
        await c.query(
          'SELECT id FROM groups WHERE id=$1 AND deleted_at IS NULL',
          [groupId],
        )
      ).rowCount
    )
      throw new BadRequestException('Nhóm không tồn tại');
    await c.query('DELETE FROM user_groups WHERE user_id=$1', [id]);
    if (groupId)
      await c.query('INSERT INTO user_groups(user_id,group_id) VALUES($1,$2)', [
        id,
        groupId,
      ]);
  }
  private async replace(
    c: PoolClient,
    kind: 'roles' | 'permissions',
    id: string,
    ids: string[],
    actor: string,
  ) {
    const target = kind === 'roles' ? 'roles' : 'permissions',
      link = kind === 'roles' ? 'user_roles' : 'user_permissions',
      column = kind === 'roles' ? 'role_id' : 'permission_id';
    const valid = await c.query(
      `SELECT id FROM ${target} WHERE id=ANY($1::uuid[])`,
      [ids],
    );
    if (valid.rowCount !== ids.length)
      throw new BadRequestException('Danh sách chứa ID không hợp lệ');
    const old = await c.query<Record<string, string>>(
      `SELECT ${column} FROM ${link} WHERE user_id=$1`,
      [id],
    );
    const oldIds = new Set(old.rows.map((r) => r[column]));
    const additions = ids.filter((value) => !oldIds.has(value));
    const permissionIds =
      kind === 'permissions'
        ? additions
        : (
            await c.query<{ permission_id: string }>(
              'SELECT DISTINCT permission_id FROM role_permissions WHERE role_id=ANY($1::uuid[])',
              [additions],
            )
          ).rows.map((p) => p.permission_id);
    await this.rbac.assertGrant(actor, permissionIds, c);
    await c.query(`DELETE FROM ${link} WHERE user_id=$1`, [id]);
    await c.query(
      `INSERT INTO ${link}(user_id,${column}) SELECT $1, unnest($2::uuid[])`,
      [id, ids],
    );
  }
  async remove(id: string, actorId: string, dto: VersionDto) {
    if (id === actorId)
      throw new ForbiddenException('Không thể tự xóa tài khoản');
    return this.rbac.mutate(
      actorId,
      ['users.delete'],
      'users.delete',
      id,
      async (c) => {
        this.rbac.checkVersion(
          dto.version,
          (await this.rbac.account(id, c)).version,
        );
        await c.query(
          "UPDATE users SET deleted_at=clock_timestamp(),updated_at=clock_timestamp(),status='LOCKED' WHERE id=$1",
          [id],
        );
      },
    );
  }
}
