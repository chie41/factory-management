import { LaborPricingService } from './labor-pricing.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { RbacService } from '../auth/rbac.service.js';
import type {
  BomDto,
  CatalogQuery,
  ComponentDto,
  DesignDto,
  DesignGroupDto,
  UpdateDesignGroupDto,
  StatusDto,
  UpdateBomDto,
  UpdateComponentDto,
  UpdateDesignDto,
} from './catalog.dto.js';
type Row = Record<string, any>;
@Injectable()
export class CatalogService {
  constructor(private readonly rbac: RbacService, private readonly pricing: LaborPricingService) {}
  private readonly imageRoot = resolve(
    process.env.CATALOG_IMAGE_DIR || 'uploads/catalog',
  );
  private stamp<T extends Row>(row: T) {
    return { ...row, version: this.rbac.version(row) };
  }
  private async nextCode(c: PoolClient, kind: 'design_models' | 'components') {
    const sequence =
      kind === 'design_models' ? 'design_model_code_seq' : 'component_code_seq';
    const prefix = kind === 'design_models' ? 'MM' : 'CK';
    for (;;) {
      const value = (
        await c.query<{ value: string }>(
          'SELECT nextval($1::regclass)::text AS value',
          [sequence],
        )
      ).rows[0].value;
      const code = prefix + value.padStart(6, '0');
      if (
        !(await c.query(`SELECT 1 FROM ${kind} WHERE code=$1`, [code])).rowCount
      )
        return code;
    }
  }
  private async tx(
    actor: string,
    permission: string,
    action: string,
    target: string | null,
    change: (c: PoolClient) => Promise<{ data: Row; before?: Row }>,
  ) {
    const c = await this.rbac.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('factory:catalog'))",
      );
      await this.rbac.require(actor, [permission], c);
      const result = await change(c);
      await c.query(
        'INSERT INTO security_audit(actor_id,target_id,action,before_state,after_state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',
        [
          actor,
          target ?? result.data.id,
          action,
          JSON.stringify(result.before ?? null),
          JSON.stringify(result.data),
        ],
      );
      await c.query('COMMIT');
      return { data: result.data };
    } catch (e) {
      await c.query('ROLLBACK');
      const code = (e as { code?: string }).code;
      if (code === '23505')
        throw new ConflictException('Mã đã tồn tại. Vui lòng chọn mã khác.');
      if (code === '23503')
        throw new ConflictException(
          'Dữ liệu đang có BOM, đơn hàng, lịch sử quy trình hoặc tham chiếu nghiệp vụ khác. Không thể xóa; với mẫu mã, hãy ngừng sử dụng.',
        );
      if (['23514', '22003'].includes(code ?? ''))
        throw new BadRequestException('Giá trị hoặc liên kết không hợp lệ.');
      throw e;
    } finally {
      c.release();
    }
  }
  async list(kind: 'design_models' | 'components', q: CatalogQuery) {
    const design = kind === 'design_models', prefix = design ? 'd.' : '';
    const params: unknown[] = [q.q?.trim() ?? ''];
    let where = `($1='' OR strpos(lower(${prefix}code),lower($1))>0 OR strpos(lower(${prefix}name),lower($1))>0)`;
    if (q.status) { params.push(q.status); where += ` AND ${prefix}status=$${params.length}`; }
    if (design && q.group_id) { params.push(q.group_id); where += ` AND d.group_id=$${params.length}`; }
    const total = (await this.rbac.pool.query(`SELECT count(*)::int total FROM ${kind}${design?' d':''} WHERE ${where}`,params)).rows[0].total;
    params.push(q.page_size,(q.page-1)*q.page_size);
    const select = design ? `SELECT d.*,g.name group_name,g.default_labor_price_per_15g group_default_labor_price_per_15g,
      ${this.pricing.projection('d','g')} FROM design_models d LEFT JOIN design_model_groups g ON g.id=d.group_id` : `SELECT * FROM ${kind}`;
    const rows = (await this.rbac.pool.query(`${select} WHERE ${where} ORDER BY ${prefix}code,${prefix}id LIMIT $${params.length-1} OFFSET $${params.length}`,params)).rows;
    return {data:rows.map(r=>this.stamp(r)),meta:{total,page:q.page,page_size:q.page_size}};
  }
  async detail(
    kind: 'design_models' | 'components',
    id: string,
    c?: PoolClient,
  ): Promise<Row> {
    if (!c) {
      const client = await this.rbac.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const result = await this.detail(kind, id, client);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    const select = kind === 'design_models' ? `SELECT d.*,g.name group_name,
      g.default_labor_price_per_15g group_default_labor_price_per_15g,${this.pricing.projection('d','g')}
      FROM design_models d LEFT JOIN design_model_groups g ON g.id=d.group_id WHERE d.id=$1` : `SELECT * FROM ${kind} WHERE id=$1`;
    const row = (await c.query(select,[id])).rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy dữ liệu danh mục');
    if (kind === 'design_models')
      row.boms = (
        await c.query(
          'SELECT id FROM boms WHERE design_model_id=$1 ORDER BY created_at,id',
          [id],
        )
      ).rows;
    else
      row.used_by = (
        await c.query(
          'SELECT DISTINCT d.id,d.code,d.name FROM design_models d JOIN boms b ON b.design_model_id=d.id JOIN bom_items i ON i.bom_id=b.id WHERE i.component_id=$1 ORDER BY d.code',
          [id],
        )
      ).rows;
    return this.stamp(row);
  }
  private async checkImage(
    c: PoolClient,
    value: string | null | undefined,
    actor: string,
    old?: Row,
  ) {
    if (!value || value === old?.image_url) return;
    if (!/^catalog-images\/[0-9a-f-]{36}$/.test(value))
      throw new BadRequestException('Ảnh phải được tải lên hệ thống');
    if (
      !(
        await c.query(
          'SELECT id FROM catalog_images WHERE id=$1 AND created_by=$2',
          [value.split('/')[1], actor],
        )
      ).rowCount
    )
      throw new BadRequestException('Không tìm thấy ảnh vừa tải lên');
  }
  async saveDesign(
    dto: DesignDto | UpdateDesignDto,
    actor: string,
    id?: string,
  ) {
    return this.tx(
      actor,
      id ? 'design_models.update' : 'design_models.create',
      id ? 'design.update' : 'design.create',
      id ?? null,
      async (c) => {
        const before = id
          ? await this.detail('design_models', id, c)
          : undefined;
        if (before)
          this.rbac.checkVersion(
            (dto as UpdateDesignDto).version,
            before.version,
          );
        await this.checkImage(c, dto.image_url, actor, before);
        if (
          dto.default_labor_price_per_15g != null &&
          !dto.default_labor_currency
        )
          throw new BadRequestException('Chọn đơn vị tiền tệ cho giá công');
        const values = [
          before?.code ?? (await this.nextCode(c, 'design_models')),
          dto.name.trim(),
          dto.status,
          dto.default_labor_price_per_15g ?? null,
          dto.default_labor_currency ?? null,
          dto.image_url ?? null,
          dto.weight_g ?? null,
          dto.design_description ?? null,
          dto.note ?? null,
          actor,
          dto.group_id ?? null,
        ];
        const result = id
          ? (
              await c.query(
                'UPDATE design_models SET code=$1,name=$2,status=$3,default_labor_price_per_15g=$4,default_labor_currency=$5,image_url=$6,weight_g=$7,design_description=$8,note=$9,updated_by=$10,group_id=$11,updated_at=clock_timestamp() WHERE id=$12 RETURNING id',
                [...values, id],
              )
            ).rows[0]
          : (
              await c.query(
                'INSERT INTO design_models(code,name,status,default_labor_price_per_15g,default_labor_currency,image_url,weight_g,design_description,note,created_by,group_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
                values,
              )
            ).rows[0];
        if (dto.initial_bom_items?.length) {
          if (id)
            throw new BadRequestException(
              'Sửa BOM hiện có trong khu vực BOM, không tạo đè từ form thông tin',
            );
          await this.rbac.require(actor, ['boms.manage'], c);
          await this.writeBom(
            c,
            result.id,
            { items: dto.initial_bom_items },
            actor,
          );
        }
        return {
          before,
          data: await this.detail('design_models', result.id, c),
        };
      },
    );
  }
  async status(
    id: string,
    dto: StatusDto,
    actor: string,
    kind: 'design_models' | 'components' = 'design_models',
  ) {
    return this.tx(actor, kind + '.update', kind + '.status', id, async (c) => {
      const before = await this.detail(kind, id, c);
      this.rbac.checkVersion(dto.version, before.version);
      await c.query(
        `UPDATE ${kind} SET status=$2,updated_by=$3,updated_at=clock_timestamp() WHERE id=$1`,
        [id, dto.status, actor],
      );
      return { before, data: await this.detail(kind, id, c) };
    });
  }
  async saveComponent(
    dto: ComponentDto | UpdateComponentDto,
    actor: string,
    id?: string,
  ) {
    return this.tx(
      actor,
      id ? 'components.update' : 'components.create',
      id ? 'component.update' : 'component.create',
      id ?? null,
      async (c) => {
        const before = id ? await this.detail('components', id, c) : undefined;
        if (before)
          this.rbac.checkVersion(
            (dto as UpdateComponentDto).version,
            before.version,
          );
        if (JSON.stringify(dto.attributes ?? {}).length > 50000)
          throw new BadRequestException('Thuộc tính kỹ thuật quá lớn');
        await this.checkImage(c, dto.image_url, actor, before);
        const values = [
          before?.code ?? (await this.nextCode(c, 'components')),
          dto.name.trim(),
          dto.weight_g ?? null,
          dto.length_mm ?? null,
          dto.width_mm ?? null,
          dto.height_mm ?? null,
          JSON.stringify(dto.attributes ?? null),
          actor,
          dto.status,
          dto.image_url ?? null,
          dto.description ?? null,
        ];
        const result = id
          ? (
              await c.query(
                'UPDATE components SET code=$1,name=$2,weight_g=$3,length_mm=$4,width_mm=$5,height_mm=$6,attributes=$7::jsonb,updated_by=$8,status=$9,image_url=$10,description=$11,updated_at=clock_timestamp() WHERE id=$12 RETURNING id',
                [...values, id],
              )
            ).rows[0]
          : (
              await c.query(
                'INSERT INTO components(code,name,weight_g,length_mm,width_mm,height_mm,attributes,created_by,status,image_url,description) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11) RETURNING id',
                values,
              )
            ).rows[0];
        return { before, data: await this.detail('components', result.id, c) };
      },
    );
  }
  async remove(
    kind: 'design_models' | 'components',
    id: string,
    version: string,
    actor: string,
  ) {
    return this.tx(actor, kind + '.delete', kind + '.delete', id, async (c) => {
      const before = await this.detail(kind, id, c);
      this.rbac.checkVersion(version, before.version);
      if (kind === 'design_models' && before.boms.length)
        throw new ConflictException(
          'Mẫu mã có BOM. Hãy ngừng sử dụng để giữ công thức và lịch sử.',
        );
      if (kind === 'components' && before.used_by.length)
        throw new ConflictException(
          'Cấu kiện đang được BOM sử dụng, không thể xóa.',
        );
      await c.query(`DELETE FROM ${kind} WHERE id=$1`, [id]);
      return { before, data: { id, deleted: true } };
    });
  }
  async bom(id: string, c?: PoolClient): Promise<Row> {
    if (!c) {
      const client = await this.rbac.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const result = await this.bom(id, client);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    const row = (await c.query('SELECT * FROM boms WHERE id=$1', [id])).rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy BOM');
    row.items = (
      await c.query('SELECT * FROM bom_items WHERE bom_id=$1 ORDER BY id', [id])
    ).rows;
    return this.stamp(row);
  }
  async boms(designId: string) {
    await this.detail('design_models', designId);
    const ids = (
      await this.rbac.pool.query(
        'SELECT id FROM boms WHERE design_model_id=$1 ORDER BY created_at,id',
        [designId],
      )
    ).rows;
    return { data: await Promise.all(ids.map((r) => this.bom(r.id))) };
  }
  async saveBom(
    designId: string | undefined,
    dto: BomDto | UpdateBomDto,
    actor: string,
    id?: string,
  ) {
    return this.tx(
      actor,
      'boms.manage',
      id ? 'bom.update' : 'bom.create',
      id ?? null,
      (c) => this.writeBom(c, designId, dto, actor, id),
    );
  }
  private async writeBom(
    c: PoolClient,
    designId: string | undefined,
    dto: BomDto | UpdateBomDto,
    actor: string,
    id?: string,
  ) {
    const before = id ? await this.bom(id, c) : undefined;
    if (before)
      this.rbac.checkVersion((dto as UpdateBomDto).version, before.version);
    if (!id) {
      await this.detail('design_models', designId!, c);
      id = (
        await c.query(
          'INSERT INTO boms(design_model_id,created_by) VALUES($1,$2) RETURNING id',
          [designId, actor],
        )
      ).rows[0].id;
    }
    const seen = new Set<string>();
    for (const item of dto.items) {
      const old = item.id
        ? before?.items.find((i: Row) => i.id === item.id)
        : undefined;
      if (item.id && (!old || seen.has(item.id)))
        throw new BadRequestException(
          'Dòng BOM không thuộc công thức hoặc bị trùng',
        );
      if (item.id) seen.add(item.id);
      let name = item.name_snapshot?.trim() ?? null,
        component = item.component_id ?? null;
      if (item.item_type === 'COMPONENT') {
        if (!component)
          throw new BadRequestException('Chọn cấu kiện cho dòng cấu kiện');
        const ref = (
          await c.query('SELECT name,status FROM components WHERE id=$1', [
            component,
          ])
        ).rows[0];
        if (!ref) throw new BadRequestException('Cấu kiện không tồn tại');
        if (ref.status !== 'ACTIVE' && old?.component_id !== component)
          throw new BadRequestException(
            'Cấu kiện đã ngừng sử dụng, không thêm vào BOM mới',
          );
        name =
          old?.item_type === 'COMPONENT' && old.component_id === component
            ? old.name_snapshot
            : ref.name;
      } else {
        if (component)
          throw new BadRequestException(
            'Nguyên liệu phụ không liên kết cấu kiện',
          );
        if (!name) throw new BadRequestException('Nhập tên nguyên liệu phụ');
      }
      const values = [
        id,
        item.item_type,
        component,
        name,
        item.quantity ?? null,
        item.weight_g ?? null,
        item.unit ?? null,
      ];
      if (old)
        await c.query(
          'UPDATE bom_items SET item_type=$2,component_id=$3,name_snapshot=$4,quantity=$5,weight_g=$6,unit=$7 WHERE id=$8 AND bom_id=$1',
          [...values, old.id],
        );
      else
        await c.query(
          'INSERT INTO bom_items(bom_id,item_type,component_id,name_snapshot,quantity,weight_g,unit) VALUES($1,$2,$3,$4,$5,$6,$7)',
          values,
        );
    }
    for (const old of before?.items ?? [])
      if (!seen.has(old.id))
        await c.query('DELETE FROM bom_items WHERE id=$1', [old.id]);
    await c.query(
      'UPDATE boms SET updated_at=clock_timestamp(),updated_by=$2 WHERE id=$1',
      [id, actor],
    );
    return { before, data: await this.bom(id!, c) };
  }
  async group(id: string, c?: PoolClient): Promise<Row> {
    const row = (
      await (c ?? this.rbac.pool).query(
        'SELECT g.*,(SELECT count(*)::int FROM design_models d WHERE d.group_id=g.id) AS used_count FROM design_model_groups g WHERE g.id=$1',
        [id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy nhóm mẫu mã');
    return this.stamp(row);
  }
  async groups(q: CatalogQuery) {
    const search = q.q?.trim() ?? '';
    const total = (
      await this.rbac.pool.query(
        'SELECT count(*)::int AS total FROM design_model_groups WHERE strpos(lower(name),lower($1))>0',
        [search],
      )
    ).rows[0].total;
    const rows = (
      await this.rbac.pool.query(
        'SELECT g.*,(SELECT count(*)::int FROM design_models d WHERE d.group_id=g.id) AS used_count FROM design_model_groups g WHERE strpos(lower(g.name),lower($1))>0 ORDER BY g.name,g.id LIMIT $2 OFFSET $3',
        [search, q.page_size, (q.page - 1) * q.page_size],
      )
    ).rows;
    return {
      data: rows.map((r) => this.stamp(r)),
      meta: { total, page: q.page, page_size: q.page_size },
    };
  }
  async saveGroup(
    dto: DesignGroupDto | UpdateDesignGroupDto,
    actor: string,
    id?: string,
  ) {
    return this.tx(
      actor,
      'design_models.groups.manage',
      id ? 'design_group.update' : 'design_group.create',
      id ?? null,
      async (c) => {
        const before = id ? await this.group(id, c) : undefined;
        if (before)
          this.rbac.checkVersion(
            (dto as UpdateDesignGroupDto).version,
            before.version,
          );
        const result = id
          ? (
              await c.query(
                'UPDATE design_model_groups SET name=$2,updated_by=$3,default_labor_price_per_15g=$4,updated_at=clock_timestamp() WHERE id=$1 RETURNING id',
                [id, dto.name.trim(), actor, dto.default_labor_price_per_15g !== undefined ? dto.default_labor_price_per_15g : before?.default_labor_price_per_15g ?? null],
              )
            ).rows[0]
          : (
              await c.query(
                'INSERT INTO design_model_groups(name,created_by,default_labor_price_per_15g) VALUES($1,$2,$3) RETURNING id',
                [dto.name.trim(), actor, dto.default_labor_price_per_15g ?? null],
              )
            ).rows[0];
        return { before, data: await this.group(result.id, c) };
      },
    );
  }
  async removeGroup(id: string, version: string, actor: string) {
    return this.tx(
      actor,
      'design_models.groups.manage',
      'design_group.delete',
      id,
      async (c) => {
        const before = await this.group(id, c);
        this.rbac.checkVersion(version, before.version);
        if (before.used_count)
          throw new ConflictException(
            'Nhóm đang có mẫu mã sử dụng. Chuyển các mẫu sang nhóm khác trước khi xóa.',
          );
        await c.query('DELETE FROM design_model_groups WHERE id=$1', [id]);
        return { before, data: { id, deleted: true } };
      },
    );
  }
  async upload(
    file: { buffer: Buffer; size: number } | undefined,
    actor: string,
    permission: string,
  ) {
    await this.rbac.require(actor, [permission]);
    if (!file?.buffer || file.size > 5 * 1024 * 1024)
      throw new BadRequestException('Chọn ảnh tối đa 5 MB');
    const b = file.buffer;
    const mime = b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'image/png'
      : b[0] === 255 && b[1] === 216 && b[2] === 255
        ? 'image/jpeg'
        : b.subarray(0, 4).toString() === 'RIFF' &&
            b.subarray(8, 12).toString() === 'WEBP'
          ? 'image/webp'
          : null;
    if (!mime)
      throw new BadRequestException('Chỉ nhận ảnh PNG, JPEG hoặc WebP');
    const id = randomUUID();
    await mkdir(this.imageRoot, { recursive: true });
    const path = resolve(this.imageRoot, id);
    await writeFile(path, b, { flag: 'wx' });
    try {
      return await this.tx(
        actor,
        permission,
        'catalog.image.upload',
        id,
        async (c) => {
          await c.query(
            'INSERT INTO catalog_images(id,mime_type,size_bytes,created_by) VALUES($1,$2,$3,$4)',
            [id, mime, file.size, actor],
          );
          return { data: { id, image_url: 'catalog-images/' + id } };
        },
      );
    } catch (e) {
      await unlink(path);
      throw e;
    }
  }
  async image(id: string, actor: string) {
    // Images are shared by both catalogs; either read permission is sufficient.
    const codes = (await this.rbac.effective(actor)).map((p) => p.code);
    await this.rbac.require(actor, [
      codes.includes('design_models.read')
        ? 'design_models.read'
        : 'components.read',
    ]);
    const row = (
      await this.rbac.pool.query('SELECT * FROM catalog_images WHERE id=$1', [
        id,
      ])
    ).rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy ảnh');
    return new StreamableFile(createReadStream(resolve(this.imageRoot, id)), {
      type: row.mime_type,
      length: row.size_bytes,
      disposition: 'inline',
    });
  }
}
