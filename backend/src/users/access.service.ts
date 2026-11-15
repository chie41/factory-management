import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { RbacService } from '../auth/rbac.service.js';
import {
  PERMISSION_CATALOG,
  REQUIRED_ADMIN_PERMISSIONS,
} from '../auth/permission-catalog.js';
import {
  NamedDto,
  UpdateNamedDto,
  PermissionIdsDto,
  VersionDto,
} from './dto/rbac.dto.js';
export type Kind = 'groups' | 'roles';
@Injectable()
export class AccessService {
  constructor(private readonly rbac: RbacService) {}
  async catalog() {
    const codes = PERMISSION_CATALOG.map(([code]) => code);
    return {
      data: (
        await this.rbac.pool.query(
          'SELECT id,code,name FROM permissions WHERE code=ANY($1::text[]) ORDER BY code',
          [codes],
        )
      ).rows,
    };
  }
  async list(kind: Kind) {
    const { rows } = await this.rbac.pool.query<{ id: string }>(
      `SELECT id FROM ${kind} ${kind === 'groups' ? 'WHERE deleted_at IS NULL' : ''} ORDER BY code`,
    );
    return {
      data: await Promise.all(rows.map((row) => this.detail(kind, row.id))),
    };
  }
  async detail(kind: Kind, id: string, c: Pool | PoolClient = this.rbac.pool) {
    const singular = kind === 'groups' ? 'group' : 'role';
    const { rows } = await c.query(
      `SELECT id,code,name FROM ${kind} WHERE id=$1 ${kind === 'groups' ? 'AND deleted_at IS NULL' : ''}`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Không tìm thấy nhóm / vai trò');
    const permissions = await c.query(
      `SELECT p.id,p.code,p.name FROM ${singular}_permissions a JOIN permissions p ON p.id=a.permission_id WHERE a.${singular}_id=$1 ORDER BY p.id`,
      [id],
    );
    const members = await c.query(
      `SELECT u.id,u.username,u.status,u.deleted_at FROM users u JOIN user_${kind} a ON a.user_id=u.id WHERE a.${singular}_id=$1 ORDER BY u.id`,
      [id],
    );
    const data = {
      ...rows[0],
      system: kind === 'roles' && rows[0].code === 'ADMIN',
      permissions: permissions.rows,
      members: members.rows,
      member_count: members.rows.length,
    };
    return { ...data, version: this.rbac.version(data) };
  }
  create(kind: Kind, dto: NamedDto, actor: string) {
    const required=[`${kind}.manage`,...(dto.permission_ids?.length?[`${kind}.permissions.manage`]:[])];
    return this.rbac.mutate(actor,required,`${kind}.create`,null,async c=>{
      if(!dto.name.trim()) throw new BadRequestException('Tên không được trống');
      const sequence=kind==='groups'?'public.group_code_seq':'public.role_code_seq';
      const prefix=kind==='groups'?'NQ':'VT';
      let code:string;
      do {
        const {rows}=await c.query<{value:string}>('SELECT nextval($1::regclass)::text AS value',[sequence]);
        code=prefix+rows[0]!.value.padStart(6,'0');
      } while((await c.query(`SELECT id FROM ${kind} WHERE code=$1`,[code])).rowCount);
      const {rows}=await c.query<{id:string}>(`INSERT INTO ${kind}(id,code,name) VALUES(gen_random_uuid(),$1,$2) RETURNING id`,[code,dto.name.trim()]);
      const id=rows[0]!.id;
      if(dto.permission_ids?.length) await this.setPermissions(c,kind,id,dto.permission_ids,actor);
      return {data:await this.detail(kind,id,c)};
    });
  }
  update(kind: Kind,id:string,dto:UpdateNamedDto,actor:string) {
    const required=[...(dto.name!==undefined?[`${kind}.manage`]:[]),...(dto.permission_ids!==undefined?[`${kind}.permissions.manage`]:[])];
    if(!required.length) throw new BadRequestException('Không có thay đổi để lưu');
    return this.rbac.mutate(actor,required,`${kind}.update`,id,async c=>{
      this.rbac.checkVersion(dto.version,(await this.detail(kind,id,c)).version);
      if(dto.name!==undefined) {
        if(!dto.name.trim()) throw new BadRequestException('Tên không được trống');
        await c.query(`UPDATE ${kind} SET name=$2 WHERE id=$1`,[id,dto.name.trim()]);
      }
      if(dto.permission_ids!==undefined) await this.setPermissions(c,kind,id,dto.permission_ids,actor);
      return {data:await this.detail(kind,id,c)};
    });
  }
  permissions(kind: Kind, id: string, dto: PermissionIdsDto, actor: string) {
    return this.rbac.mutate(
      actor,
      [`${kind}.permissions.manage`],
      `${kind}.permissions`,
      id,
      async (c) => {
        const original = await this.detail(kind, id, c);
        this.rbac.checkVersion(dto.version, original.version);
        await this.setPermissions(c,kind,id,dto.permission_ids,actor);
        return { data: await this.detail(kind, id, c) };
      },
    );
  }
  private async setPermissions(c:PoolClient,kind:Kind,id:string,ids:string[],actor:string) {
    const original=await this.detail(kind,id,c);
        const valid = await c.query<{ id: string; code: string }>(
          'SELECT id,code FROM permissions WHERE id=ANY($1::uuid[])',
          [ids],
        );
        if (valid.rowCount !== ids.length)
          throw new BadRequestException('Permission không tồn tại');
        const catalog = new Set<string>(
          PERMISSION_CATALOG.map(([code]) => code),
        );
        const oldIds = new Set(
          original.permissions.map((p: { id: string }) => p.id as string),
        );
        if (valid.rows.some((p) => !catalog.has(p.code) && !oldIds.has(p.id)))
          throw new BadRequestException(
            'Không được cấp mới permission ngoài catalog',
          );
        await this.rbac.assertGrant(
          actor,
          ids.filter((id) => !oldIds.has(id)),
          c,
        );
        if (
          original.system &&
          REQUIRED_ADMIN_PERMISSIONS.some(
            (code) => !valid.rows.some((p) => p.code === code),
          )
        )
          throw new ConflictException(
            'Không được gỡ quyền quản trị bắt buộc của ADMIN',
          );
        const singular = kind === 'groups' ? 'group' : 'role';
        await c.query(
          `DELETE FROM ${singular}_permissions WHERE ${singular}_id=$1`,
          [id],
        );
        await c.query(
          `INSERT INTO ${singular}_permissions(${singular}_id,permission_id) SELECT $1,unnest($2::uuid[])`,
          [id, ids],
        );

  }
  remove(kind: Kind, id: string, dto: VersionDto, actor: string) {
    return this.rbac.mutate(
      actor,
      [`${kind}.manage`],
      `${kind}.delete`,
      id,
      async (c) => {
        const original = await this.detail(kind, id, c);
        this.rbac.checkVersion(dto.version, original.version);
        if (original.system || original.member_count)
          throw new ConflictException(
            'Không thể xóa vai trò hệ thống hoặc nhóm / vai trò còn thành viên',
          );
        if (kind === 'groups')
          await c.query(
            'UPDATE groups SET deleted_at=clock_timestamp() WHERE id=$1',
            [id],
          );
        else {
          await c.query('DELETE FROM role_permissions WHERE role_id=$1', [id]);
          await c.query('DELETE FROM roles WHERE id=$1', [id]);
        }
        return { data: { id } };
      },
    );
  }
}
