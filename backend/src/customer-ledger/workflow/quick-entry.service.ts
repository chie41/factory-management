import { LaborPricingService } from '../../catalog/labor-pricing.service.js';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient, Pool } from 'pg';
import { RbacService } from '../../auth/rbac.service.js';
import { recoveredGold, toDecimal, units } from '../ledger-decimal.js';
import type { QuickBatchDto, QuickEntryDto } from './quick-entry.dto.js';
import { LedgerWorkflowService } from './ledger-workflow.service.js';

export const foldSearch = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
export function deliveryTotals(entry: QuickEntryDto) {
  if (!entry.items?.length)
    throw new BadRequestException('Cần ít nhất một dòng mẫu mã');
  let gold = 0n,
    gross = 0n;
  for (const line of entry.items) {
    const weight = units(line.unit_weight_g),
      price = units(line.labor_price_per_15g);
    if (weight <= 0n)
      throw new BadRequestException('Trọng lượng một sản phẩm phải lớn hơn 0');
    gold += BigInt(line.quantity) * weight;
    gross += (BigInt(line.quantity) * weight * price + 75000n) / 150000n;
  }
  const value = units(entry.discount_value ?? '0'),
    type = entry.discount_type ?? 'NONE';
  if (
    (type === 'NONE' && value !== 0n) ||
    (type === 'PERCENT' && value > 1000000n)
  )
    throw new BadRequestException('Giá trị giảm không hợp lệ');
  const discount =
    type === 'PERCENT'
      ? (gross * value + 500000n) / 1000000n
      : type === 'AMOUNT'
        ? value
        : 0n;
  if (discount > gross)
    throw new BadRequestException('Giảm giá vượt tổng tiền công');
  for (const n of [gold, gross, discount])
    if (n > 99999999999999999999n)
      throw new BadRequestException('Tổng vượt numeric(20,4)');
  return { gold, gross, discount, net: gross - discount };
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
@Injectable()
export class QuickEntryService {
  constructor(
    private readonly rbac: RbacService,
    private readonly workflow: LedgerWorkflowService,
    private readonly pricing: LaborPricingService,
  ) {}
  async eligibleEmployees(client: PoolClient | Pool = this.rbac.pool) {
    const accounts = (await client.query(
      "SELECT u.id user_id,e.id,e.employee_code code,e.full_name name FROM users u JOIN employees e ON e.id=u.employee_id AND e.deleted_at IS NULL WHERE u.status='ACTIVE' AND u.deleted_at IS NULL",
    )).rows;
    const eligible = [];
    for (const account of accounts) {
      if ((await this.rbac.effective(account.user_id, client)).some(p => p.code === 'delivery.report')) {
        const { user_id, ...employee } = account;
        eligible.push(employee);
      }
    }
    return eligible;
  }
  async options(actor: string, kind: string, search = '') {
    await this.rbac.require(actor, ['customer_ledger.create']);
    const query =
      kind === 'customers'
        ? 'SELECT id,customer_code code,name FROM customers WHERE deleted_at IS NULL'
        : kind === 'employees'
          ? 'SELECT id,employee_code code,full_name name FROM employees WHERE deleted_at IS NULL'
          : kind === 'models'
            ? `SELECT d.id,d.code,d.name,d.weight_g,d.default_labor_price_per_15g,d.default_labor_currency,d.image_url,${this.pricing.projection('d','g')} FROM design_models d LEFT JOIN design_model_groups g ON g.id=d.group_id WHERE d.status='ACTIVE'`
            : null;
    if (!query) throw new BadRequestException('Danh mục không hợp lệ');
    const rows = kind === 'employees' ? await this.eligibleEmployees() : (await this.rbac.pool.query(query)).rows;
    return {
      data: rows
        .filter((r) =>
          foldSearch(`${r.code} ${r.name}`).includes(foldSearch(search.trim())),
        )
        .slice(0, 100),
    };
  }
  async save(
    dto: QuickBatchDto,
    actor: string,
    editId?: string,
    version?: string,
    external?: PoolClient,
  ) {
    const hash = createHash('sha256')
      .update(JSON.stringify(stable({ entries: dto.entries, editId, version })))
      .digest('hex');
    const c = external ?? await this.rbac.pool.connect();
    try {
      if (!external) await c.query('BEGIN');
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('factory:ledger-workflow'))",
      );
      await c.query("SELECT pg_advisory_xact_lock(hashtext('factory:rbac'))");
      await this.rbac.require(actor, ['customer_ledger.create'], c);
      const prior = (
        await c.query(
          'SELECT * FROM ledger_entry_batches WHERE request_id=$1',
          [dto.request_id],
        )
      ).rows[0];
      if (prior) {
        if (prior.actor_id !== actor || prior.intent_hash !== hash)
          throw new ConflictException('Mã lô đã dùng cho nội dung khác');
        if (!external) await c.query('COMMIT');
        return { data: prior.result };
      }
      if (
        new Set(dto.entries.map((e) => e.request_id)).size !==
        dto.entries.length
      )
        throw new BadRequestException('Trùng mã yêu cầu trong lô');
      for (const id of [
        ...new Set(dto.entries.map((e) => e.customer_id)),
      ].sort())
        await c.query(
          "SELECT pg_advisory_xact_lock(hashtext('factory:ledger:' || $1::text))",
          [id],
        );
      let before;
      if (editId) {
        await this.rbac.require(actor, ['customer_ledger.update'], c);
        before = await this.workflow.detail(editId, c);
        this.rbac.checkVersion(version ?? '', before.version);
        if (
          dto.entries.length !== 1 ||
          dto.entries[0]!.transaction_type !== 'DELIVERY' ||
          dto.entries[0]!.order_id ||
          before.ledger.reference_type !== 'MANUAL_DELIVERY' ||
          !['PENDING', 'INCORRECT'].includes(before.ledger.approval_status) ||
          before.ledger.reversed_at ||
          before.ledger.customer_id !== dto.entries[0]!.customer_id
        )
          throw new ConflictException(
            'Chỉ sửa phiếu giao trực tiếp chưa duyệt của cùng khách hàng',
          );
        if (
          before.payments.some(
            (p: Record<string, any>) => p.status === 'APPROVED',
          ) ||
          before.returns.length
        )
          throw new ConflictException('Phiếu đã có nghiệp vụ được duyệt');
      }
      const entries = [];
      for (let index = 0; index < dto.entries.length; index++) {
        try {
          entries.push(
            await this.insert(c, dto.entries[index]!, actor, editId),
          );
        } catch (error) {
          const e = error as {
            message?: string;
            code?: string;
            getStatus?: () => number;
          };
          const message =
            e.code === '23505'
              ? 'Mã phiếu hoặc khoản thu đã được sử dụng'
              : e.code &&
                  ['23514', '23503', '22003', '22007', '22008'].includes(e.code)
                ? 'Số liệu, ngày hoặc tham chiếu không hợp lệ'
                : e.getStatus
                  ? (e.message ?? 'Dữ liệu không hợp lệ')
                  : 'Không lưu được giao dịch. Toàn bộ lô đã được hoàn tác.';
          const field = /khách hàng/i.test(message)
            ? 'customer_id'
            : /nhân viên/i.test(message)
              ? 'employee_id'
              : /thu|tiền/i.test(message)
                ? 'receipt'
                : /giảm/i.test(message)
                  ? 'discount_value'
                  : /mẫu|dòng|trọng lượng/i.test(message)
                    ? 'items'
                    : 'transaction';
          throw new HttpException(
            {
              message: `Giao dịch ${index + 1}: ${message}`,
              errors: [{ block: index, field, message }],
            },
            e.getStatus?.() ?? (e.code ? 400 : 500),
          );
        }
      }
      const result = { entries };
      if (editId)
        await c.query(
          'INSERT INTO security_audit(actor_id,target_id,action,before_state,after_state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',
          [
            actor,
            editId,
            'delivery.manual_resubmit',
            JSON.stringify(before),
            JSON.stringify(await this.workflow.detail(editId, c)),
          ],
        );
      await c.query(
        'INSERT INTO ledger_entry_batches(request_id,actor_id,intent_hash,result) VALUES($1,$2,$3,$4::jsonb)',
        [dto.request_id, actor, hash, JSON.stringify(result)],
      );
      await c.query(
        'INSERT INTO security_audit(actor_id,action,after_state) VALUES($1,$2,$3::jsonb)',
        [
          actor,
          'ledger.batch_create',
          JSON.stringify({ request_id: dto.request_id, ...result }),
        ],
      );
      if (!external) await c.query('COMMIT');
      return { data: result };
    } catch (error) {
      if (!external) await c.query('ROLLBACK');
      throw error;
    } finally {
      if (!external) c.release();
    }
  }
  private async insert(
    c: PoolClient,
    e: QuickEntryDto,
    actor: string,
    editId?: string,
  ) {
    if (
      !(
        await c.query(
          'SELECT id FROM customers WHERE id=$1 AND deleted_at IS NULL',
          [e.customer_id],
        )
      ).rowCount
    )
      throw new BadRequestException('Khách hàng không tồn tại');
    const eligible = new Set((await this.eligibleEmployees(c)).map(e => e.id));
    for (const id of [e.employee_id, ...(e.receipt ? [e.receipt.employee_id] : [])])
      if (!eligible.has(id))
        throw new BadRequestException('Nhân viên phải có tài khoản hoạt động và quyền delivery.report');
    if (
      (
        await c.query('SELECT id FROM customers_ledger WHERE request_id=$1', [
          e.request_id,
        ])
      ).rowCount
    )
      throw new ConflictException('Mã phiếu đã được ghi nhận ở lô khác');
    if (
      e.transaction_type !== 'DELIVERY' &&
      (e.items ||
        e.receipt ||
        e.discount_type ||
        e.discount_value ||
        e.order_id ||
        e.order_version ||
        e.trip_id)
    )
      throw new BadRequestException(
        'Giao dịch vàng không có dòng hàng, giảm giá hoặc thu công',
      );
    const calc = e.transaction_type === 'DELIVERY' ? deliveryTotals(e) : null;
    if (
      calc &&
      e.receipt &&
      (units(e.receipt.amount) <= 0n ||
        (e.receipt.currency === 'THB' && units(e.receipt.amount) > calc.net))
    )
      throw new BadRequestException(
        'Số tiền thu phải dương và không vượt tiền công phải thu',
      );
    if (e.order_id) {
      await this.rbac.require(actor, ['delivery.report'], c);
      if (e.receipt)
        await this.rbac.require(actor, ['customer_ledger.collect'], c);
      const order = await this.workflow.order(e.order_id, c);
      if (order.customer_id !== e.customer_id)
        throw new BadRequestException('Đơn nguồn thuộc khách hàng khác');
      if (
        (
          await c.query(
            "SELECT id FROM customers_ledger WHERE reference_type='ORDER_DELIVERY' AND reference_id=$1",
            [e.order_id],
          )
        ).rowCount
      )
        throw new ConflictException(
          'Đơn nguồn đã có phiếu giao; sửa phiếu hiện có',
        );
      if (
        order.items.length !== e.items!.length ||
        order.items.some((i: Record<string, any>, n: number) => {
          const l = e.items![n]!;
          return (
            i.design_model_id !== l.design_model_id ||
            i.quantity !== l.quantity ||
            units(i.unit_weight_g) !== units(l.unit_weight_g) ||
            units(i.labor_price_per_15g) !== units(l.labor_price_per_15g)
          );
        })
      )
        throw new BadRequestException('Dòng hàng phải khớp đơn nguồn hiện tại');
      const date = (
        await c.query(
          "SELECT ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date value",
          [e.occurred_at],
        )
      ).rows[0].value;
      const result = await this.workflow.reportInTransaction(
        e.order_id,
        {
          version: e.order_version ?? '',
          trip_id: e.trip_id,
          business_date: date,
          occurred_at: e.occurred_at,
          discount_type: e.discount_type ?? 'NONE',
          discount_value: e.discount_value ?? '0',
          actual_received_amount: e.receipt?.amount,
          received_currency: e.receipt?.currency,
          note: e.note,
        },
        actor,
        c,
      );
      await c.query(
        'UPDATE customers_ledger SET request_id=$2,transaction_employee_id=$3 WHERE id=$1',
        [result.data.id, e.request_id, e.employee_id],
      );
      if (e.receipt) {
        const r = e.receipt;
        if (units(r.amount) <= 0n)
          throw new BadRequestException('Số tiền thu phải dương');
        await c.query(
          "UPDATE ledger_payments SET request_id=$2,business_date=($3::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,occurred_at=$3,collected_employee_id=$4,note=$5 WHERE ledger_id=$1 AND source='DELIVERY' AND status='PENDING'",
          [
            result.data.id,
            r.request_id,
            r.received_at,
            r.employee_id,
            r.note ?? null,
          ],
        );
      }
      await c.query(
        'INSERT INTO security_audit(actor_id,target_id,action,before_state,after_state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',
        [
          actor,
          result.data.id,
          'delivery.report',
          JSON.stringify(result.before),
          JSON.stringify(e),
        ],
      );
      await this.workflow.recordFromLedgerInTransaction(result.data.id, actor, c, e.receipt?.confirmed_fx_per_baht);
      return {
        id: result.data.id,
        request_id: e.request_id,
        approval_status: 'APPROVED',
      };
    }
    const recovery =
      e.transaction_type === 'RETURN_RECOVERED_GOLD'
        ? recoveredGold(e.actual_weight_g ?? '', e.purity_percent ?? '')
        : null;
    const gold = calc?.gold ?? units(recovery?.gold ?? e.gold_weight_g ?? '');
    if (gold <= 0n)
      throw new BadRequestException('Trọng lượng vàng phải lớn hơn 0');
    if (
      !recovery &&
      (e.actual_weight_g !== undefined || e.purity_percent !== undefined)
    )
      throw new BadRequestException('Tuổi vàng chỉ dùng cho vàng thu hồi');
    const id = editId ?? randomUUID(),
      date = (
        await c.query(
          "SELECT ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date value",
          [e.occurred_at],
        )
      ).rows[0].value;
    const previousItems = editId
      ? (
          await c.query(
            'SELECT * FROM order_items WHERE ledger_id=$1 AND superseded_at IS NULL',
            [editId],
          )
        ).rows
      : [];
    if (editId) {
      await c.query(
        "UPDATE customers_ledger SET business_date=$2,occurred_at=$3,gold_weight_g=$4,labor_amount_due=$5,labor_payment_status=$6,approval_status='PENDING',note=$7,transaction_employee_id=$8,updated_by=$9,updated_at=clock_timestamp() WHERE id=$1",
        [
          id,
          date,
          e.occurred_at,
          toDecimal(gold),
          toDecimal(calc!.net),
          calc!.net ? 'UNPAID' : 'PAID',
          e.note ?? null,
          e.employee_id,
          actor,
        ],
      );
      await c.query(
        'UPDATE order_items SET superseded_at=clock_timestamp() WHERE ledger_id=$1 AND superseded_at IS NULL',
        [id],
      );
      await c.query(
        "UPDATE ledger_payments SET status='VOID' WHERE ledger_id=$1 AND status='PENDING' AND source='DELIVERY'",
        [id],
      );
    } else
      await c.query(
        "INSERT INTO customers_ledger(id,customer_id,business_date,occurred_at,transaction_type,gold_weight_g,labor_amount_due,labor_amount_paid,labor_currency,labor_payment_status,reference_type,created_by,request_id,approval_status,note,transaction_employee_id,actual_weight_g,purity_percent,recovered_exact_gold_g) VALUES($1,$2,$3,$4,$5,$6,$7,0,'THB',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
        [
          id,
          e.customer_id,
          date,
          e.occurred_at,
          e.transaction_type,
          toDecimal(gold),
          toDecimal(calc?.net ?? 0n),
          calc?.net ? 'UNPAID' : 'PAID',
          calc ? 'MANUAL_DELIVERY' : 'MANUAL',
          actor,
          e.request_id,
          calc ? 'PENDING' : 'RECORDED',
          e.note ?? null,
          e.employee_id,
          recovery ? e.actual_weight_g : null,
          recovery ? e.purity_percent : null,
          recovery?.exact ?? null,
        ],
      );
    if (calc) {
      for (const line of e.items!) {
        const previous = line.source_item_id
          ? previousItems.find(
              (i) =>
                i.id === line.source_item_id &&
                i.design_model_id === line.design_model_id,
            )
          : undefined;
        if (line.source_item_id && !previous)
          throw new BadRequestException(
            'Dòng lịch sử không thuộc phiếu đang sửa',
          );
        const model = previous
          ? {
              id: previous.design_model_id,
              name: previous.item_name,
              code: previous.design_code_snapshot,
              image_url: previous.design_image_snapshot,
            }
          : (
              await c.query(
                "SELECT * FROM design_models WHERE id=$1 AND status='ACTIVE' FOR SHARE",
                [line.design_model_id],
              )
            ).rows[0];
        if (!model)
          throw new BadRequestException(
            'Mẫu mã không tồn tại hoặc đã ngừng hoạt động',
          );
        await c.query(
          'INSERT INTO order_items(ledger_id,item_name,quantity,unit_weight_g,labor_price_per_15g,design_model_id,design_code_snapshot,design_image_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            id,
            model.name,
            line.quantity,
            line.unit_weight_g,
            line.labor_price_per_15g,
            model.id,
            model.code,
            model.image_url,
          ],
        );
      }
      const amount = e.receipt ? units(e.receipt.amount) : 0n;
      if (e.receipt && amount <= 0n)
        throw new BadRequestException('Số tiền đã thu phải lớn hơn 0');
      if (e.receipt?.currency === 'THB' && amount > calc.net)
        throw new BadRequestException('Số tiền thu vượt tiền công phải thu');
      if (e.receipt)
        await this.rbac.require(actor, ['customer_ledger.collect'], c);
      await c.query(
        'INSERT INTO ledger_delivery_submissions(ledger_id,original_labor_baht,discount_type,discount_value,discount_baht,net_labor_baht,actual_received_amount,received_currency,declared_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(ledger_id) DO UPDATE SET original_labor_baht=EXCLUDED.original_labor_baht,discount_type=EXCLUDED.discount_type,discount_value=EXCLUDED.discount_value,discount_baht=EXCLUDED.discount_baht,net_labor_baht=EXCLUDED.net_labor_baht,actual_received_amount=EXCLUDED.actual_received_amount,received_currency=EXCLUDED.received_currency,declared_by=EXCLUDED.declared_by,declared_at=clock_timestamp(),review_note=NULL',
        [
          id,
          toDecimal(calc.gross),
          e.discount_type ?? 'NONE',
          e.discount_value ?? '0',
          toDecimal(calc.discount),
          toDecimal(calc.net),
          e.receipt?.amount ?? null,
          e.receipt?.currency ?? null,
          actor,
        ],
      );
      if (e.receipt) {
        const r = e.receipt;
        await c.query(
          "INSERT INTO ledger_payments(ledger_id,request_id,source,amount,currency,business_date,occurred_at,collected_by,collected_employee_id,note) VALUES($1,$2,'DELIVERY',$3,$4,($5::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,$5,$6,$7,$8)",
          [
            id,
            r.request_id,
            r.amount,
            r.currency,
            r.received_at,
            actor,
            r.employee_id,
            r.note ?? null,
          ],
        );
      }
    }
    if (calc) await this.workflow.recordFromLedgerInTransaction(id, actor, c, e.receipt?.confirmed_fx_per_baht);
    await c.query(
      'INSERT INTO security_audit(actor_id,target_id,action,after_state) VALUES($1,$2,$3,$4::jsonb)',
      [actor, id, 'ledger.quick_create', JSON.stringify(e)],
    );
    return {
      id,
      request_id: e.request_id,
      approval_status: calc ? 'APPROVED' : 'RECORDED',
    };
  }
}
