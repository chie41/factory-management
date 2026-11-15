import { LaborPricingService } from '../catalog/labor-pricing.service.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { RbacService } from '../auth/rbac.service.js';
import { units } from '../customer-ledger/ledger-decimal.js';
import type { CatalogQuery } from '../catalog/catalog.dto.js';
@Injectable()
export class CustomerLaborPricesService {
  constructor(private readonly rbac: RbacService, private readonly pricing: LaborPricingService) {}
  private async customer(id: string, c: Pool | PoolClient = this.rbac.pool) {
    if (!(await c.query('SELECT id FROM customers WHERE id=$1 AND deleted_at IS NULL', [id])).rowCount)
      throw new NotFoundException('Không tìm thấy khách hàng');
  }
  async list(customerId: string) {
    await this.customer(customerId);
    const base = this.pricing.sql('d','dg');
    return { data: (await this.rbac.pool.query(`SELECT p.*,d.code,d.name,d.image_url,d.status model_status,
      ${base.amount} default_labor_price_per_15g,${base.currency} default_labor_currency,'THB'::text currency
      FROM customer_model_labor_prices p JOIN design_models d ON d.id=p.design_model_id LEFT JOIN design_model_groups dg ON dg.id=d.group_id
      WHERE p.customer_id=$1 AND p.labor_price_per_15g IS NOT NULL ORDER BY d.code,d.id`, [customerId])).rows };
  }
  async models(customerId: string, q: CatalogQuery) {
    await this.customer(customerId);
    const base = this.pricing.sql('d','dg');
    const result = await this.rbac.pool.query(`SELECT d.id,d.code,d.name,d.image_url,
      ${base.amount} default_labor_price_per_15g,${base.currency} default_labor_currency,count(*) OVER()::int total
      FROM design_models d LEFT JOIN design_model_groups dg ON dg.id=d.group_id
      WHERE d.status='ACTIVE' AND ($1='' OR strpos(lower(d.code||' '||d.name),lower($1))>0)
      ORDER BY d.code,d.id LIMIT $2 OFFSET $3`, [q.q?.trim() ?? '',q.page_size,(q.page-1)*q.page_size]);
    return { data: result.rows, meta: { total: result.rows[0]?.total ?? 0, page: q.page, page_size: q.page_size } };
  }
  async listGroups(customerId: string) {
    await this.customer(customerId);
    return { data: (await this.rbac.pool.query(`SELECT p.*,g.name,
      (SELECT count(*)::int FROM design_models d WHERE d.group_id=g.id) model_count
      FROM customer_group_labor_prices p JOIN design_model_groups g ON g.id=p.design_model_group_id
      WHERE p.customer_id=$1 AND p.labor_price_per_15g IS NOT NULL ORDER BY g.name,g.id`,[customerId])).rows };
  }
  async groups(customerId: string, q: CatalogQuery) {
    await this.customer(customerId);
    const result = await this.rbac.pool.query(`SELECT g.id,g.name,
      (SELECT count(*)::int FROM design_models d WHERE d.group_id=g.id) model_count,count(*) OVER()::int total
      FROM design_model_groups g WHERE strpos(lower(g.name),lower($1))>0 ORDER BY g.name,g.id LIMIT $2 OFFSET $3`,
      [q.q?.trim() ?? '',q.page_size,(q.page-1)*q.page_size]);
    return {data:result.rows,meta:{total:result.rows[0]?.total ?? 0,page:q.page,page_size:q.page_size}};
  }
  async effective(customerId: string, modelIds: string[]) {
    await this.customer(customerId);
    const price = this.pricing.sql('d','dg','p','g');
    const rows = (await this.rbac.pool.query(`SELECT d.id design_model_id,
      ${price.amount} labor_price_per_15g,${price.source} source,${price.currency} currency
      FROM design_models d LEFT JOIN design_model_groups dg ON dg.id=d.group_id
      LEFT JOIN customer_model_labor_prices p ON p.design_model_id=d.id AND p.customer_id=$1
      LEFT JOIN customer_group_labor_prices g ON g.design_model_group_id=d.group_id AND g.customer_id=$1
      WHERE d.id=ANY($2::uuid[]) AND d.status='ACTIVE'`, [customerId,[...new Set(modelIds)]])).rows;
    if (rows.length !== new Set(modelIds).size) throw new BadRequestException('Mẫu mã không tồn tại hoặc đã ngừng hoạt động');
    return { data: rows };
  }
  async write(customerId: string, modelId: string, price: string | undefined, actor: string, operation: 'create' | 'update' | 'delete', scope: 'model' | 'group' = 'model') {
    const table = scope === 'model' ? 'customer_model_labor_prices' : 'customer_group_labor_prices';
    const foreignKey = scope === 'model' ? 'design_model_id' : 'design_model_group_id';
    const label = scope === 'model' ? 'Mẫu mã' : 'Nhóm mẫu mã';
    if (price !== undefined) units(price);
    const c = await this.rbac.pool.connect();
    try {
      await c.query('BEGIN');
      await this.rbac.require(actor, ['customers.update'], c);
      if (!(await c.query('SELECT id FROM customers WHERE id=$1 AND deleted_at IS NULL FOR SHARE',[customerId])).rowCount)
        throw new NotFoundException('Không tìm thấy khách hàng');
      const model = (await c.query(scope === 'model' ? 'SELECT id,status FROM design_models WHERE id=$1 FOR SHARE' : 'SELECT id FROM design_model_groups WHERE id=$1 FOR SHARE',[modelId])).rows[0];
      if (!model) throw new NotFoundException('Không tìm thấy ' + label.toLocaleLowerCase('vi-VN'));
      if (operation === 'create' && scope === 'model' && model.status !== 'ACTIVE') throw new BadRequestException('Mẫu mã đã ngừng hoạt động');
      let result;
      if (operation === 'delete') {
        await c.query(`DELETE FROM ${table} WHERE customer_id=$1 AND ${foreignKey}=$2`,[customerId,modelId]);
        result = { data: null };
      } else {
        const saved = operation === 'create' ? await c.query(`INSERT INTO ${table}(customer_id,${foreignKey},labor_price_per_15g)
          VALUES($1,$2,$3) ON CONFLICT(customer_id,${foreignKey}) DO UPDATE SET labor_price_per_15g=EXCLUDED.labor_price_per_15g,updated_at=clock_timestamp()
          WHERE ${table}.labor_price_per_15g IS NULL RETURNING *`,[customerId,modelId,price]) :
          await c.query(`UPDATE ${table} SET labor_price_per_15g=$3,updated_at=clock_timestamp() WHERE customer_id=$1 AND ${foreignKey}=$2 RETURNING *`,[customerId,modelId,price]);
        if (!saved.rowCount) {
          if (operation === 'create') throw new ConflictException(label + ' đã có giá riêng cho khách hàng này');
          throw new NotFoundException('Cấu hình giá riêng không còn tồn tại');
        }
        result = { data: saved.rows[0] };
      }
      await c.query('COMMIT');
      return result;
    } catch (error) { await c.query('ROLLBACK'); throw error; }
    finally { c.release(); }
  }
}
