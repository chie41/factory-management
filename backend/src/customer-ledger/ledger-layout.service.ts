import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { RbacService } from '../auth/rbac.service.js';
import type { PoolClient } from 'pg';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsString, IsUUID, ValidateNested } from 'class-validator';
class LayoutItemDto {
 @IsUUID() id!: string;
 @IsBoolean() is_visible_in_ledger!: boolean;
}
export class SaveLedgerLayoutDto {
 @IsString() revision!: string;
 @IsArray() @ValidateNested({ each: true }) @Type(() => LayoutItemDto) items!: LayoutItemDto[];
}
@Injectable()
export class LedgerLayoutService {
 constructor(private readonly rbac: RbacService) {}
 async read(client?: PoolClient) {
  const result = await (client ?? this.rbac.pool).query(`
   SELECT coalesce(l.revision,0)::text revision,c.id,c.name,c.customer_code,
    coalesce((j.item->>'is_visible_in_ledger')::boolean,true) is_visible_in_ledger
   FROM public.customers c LEFT JOIN public.ledger_customer_layout l ON l.id=true
   LEFT JOIN LATERAL jsonb_array_elements(coalesce(l.items,'[]'::jsonb)) WITH ORDINALITY j(item,pos)
    ON j.item->>'id'=c.id::text
   WHERE c.deleted_at IS NULL
   ORDER BY j.pos NULLS LAST,c.created_at,c.id`);
  const revision = result.rows[0]?.revision ?? (await (client ?? this.rbac.pool).query('SELECT revision::text revision FROM public.ledger_customer_layout WHERE id=true')).rows[0]?.revision ?? '0';
  return { revision: String(revision), items: result.rows.map(({ revision: _revision, ...row }) => row) };
 }
 async save(dto: SaveLedgerLayoutDto) {
  const c = await this.rbac.pool.connect();
  try {
   await c.query('BEGIN');
   // A missing singleton is valid empty configuration; schema errors still propagate.
   await c.query('INSERT INTO public.ledger_customer_layout(id) VALUES(true) ON CONFLICT DO NOTHING');
   await c.query('SELECT id FROM public.ledger_customer_layout WHERE id=true FOR UPDATE');
   const current = await this.read(c);
   if (current.revision !== dto.revision) throw new ConflictException('Cấu hình đã thay đổi. Đóng và mở lại danh sách để tải phiên bản mới.');
   const ids = new Set(dto.items.map(i => i.id));
   if (ids.size !== dto.items.length) throw new BadRequestException('Khách hàng bị trùng');
   if (current.items.length !== ids.size || current.items.some(i => !ids.has(i.id)))
    throw new ConflictException('Danh sách khách hàng đã thay đổi. Đóng và mở lại để tải danh sách mới.');
   await c.query('UPDATE public.ledger_customer_layout SET items=$1::jsonb,revision=revision+1 WHERE id=true', [JSON.stringify(dto.items)]);
   await c.query('COMMIT');
   return { success: true };
  } catch (error) { await c.query('ROLLBACK'); throw error; }
  finally { c.release(); }
 }
}
