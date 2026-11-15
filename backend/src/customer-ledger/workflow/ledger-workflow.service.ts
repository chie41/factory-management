import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { RbacService } from '../../auth/rbac.service.js';
import { units, toDecimal } from '../ledger-decimal.js';
import type {
  CreateOrderDto,
  OrderStatusDto,
  CreateTripDto,
  ReportDeliveryDto,
  ApproveDeliveryDto,
  RejectDeliveryDto,
  PaymentDto,
  ApprovePaymentDto,
  ReviseFxDto,
  CreateReturnDto,
  ApproveReturnDto,
  SplitOrderDto,
  CashPeriodDto,
  CashPeriodFxDto,
  DeliveryEventDto,
  ManualDeliveryDto,
} from './workflow.dto.js';
type Db = Pool | PoolClient;
type Row = Record<string, any>;
const roundedDivide = (n: bigint, d: bigint) => {
  if (d <= 0n) throw new BadRequestException('Tỷ giá / mẫu số phải lớn hơn 0');
  return (n + d / 2n) / d;
};
@Injectable()
export class LedgerWorkflowService {
  constructor(private readonly rbac: RbacService) {}
  private version(row: unknown) {
    return this.rbac.version(row);
  }
  private async tx(
    actor: string,
    required: string[],
    customerId: string | null,
    action: string,
    target: string | null,
    change: (c: PoolClient) => Promise<{ data: Row; before?: unknown }>,
    external?: PoolClient,
  ) {
    const c = external ?? await this.rbac.pool.connect();
    try {
      if (!external) await c.query('BEGIN');
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('factory:ledger-workflow'))",
      );
      if (customerId)
        await c.query(
          "SELECT pg_advisory_xact_lock(hashtext('factory:ledger:' || $1::text))",
          [customerId],
        );
      await this.rbac.require(actor, required, c);
      const result = await change(c);
      await c.query(
        'INSERT INTO security_audit(actor_id,target_id,action,before_state,after_state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',
        [
          actor,
          target ?? result.data.id ?? null,
          action,
          JSON.stringify(result.before ?? null),
          JSON.stringify(result.data),
        ],
      );
      const response = await this.visible(actor, result.data, c);
      if (!external) await c.query('COMMIT');
      return { data: response };
    } catch (error) {
      if (!external) await c.query('ROLLBACK');
      const code = (error as { code?: string }).code;
      if (code === '23505')
        throw new ConflictException(
          'Nghiệp vụ hoặc mã yêu cầu đã được ghi nhận; không tạo hiệu ứng trùng',
        );
      if (['23514', '23503', '22003', '22007', '22008'].includes(code ?? ''))
        throw new BadRequestException(
          'Dữ liệu, ngày, số lượng, trọng lượng hoặc liên kết không hợp lệ',
        );
      throw error;
    } finally {
      if (!external) c.release();
    }
  }
  private async snapshot<T>(read: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.rbac.pool.connect();
    try {
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await read(c);
      await c.query('COMMIT');
      return result;
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }
  async visible(actor: string, data: Row, c: Db = this.rbac.pool) {
    const codes = new Set(
      (await this.rbac.effective(actor, c)).map((p) => p.code),
    );
    if (
      [
        'customer_ledger.approve',
        'cash.approve',
        'customer_ledger.fx.manage',
        'cash.refund.approve',
        'cash.periods.manage',
      ].some((p) => codes.has(p))
    )
      return data;
    const hidden = new Set([
      'confirmed_fx_per_baht',
      'suggested_fx_per_baht',
      'fx_revisions',
      'old_fx',
      'new_fx',
      'fx_unit',
    ]);
    const strip = (value: any): any =>
      Array.isArray(value)
        ? value.map(strip)
        : value && typeof value === 'object' && !(value instanceof Date)
          ? Object.fromEntries(
              Object.entries(value)
                .filter(([key]) => !hidden.has(key))
                .map(([key, v]) => [key, strip(v)]),
            )
          : value;
    return strip(data);
  }
  async deliveryOrders(customerId: string | undefined, actor: string) {
    const employee = (
      await this.rbac.pool.query('SELECT employee_id FROM users WHERE id=$1', [
        actor,
      ])
    ).rows[0]?.employee_id;
    const manage = (await this.rbac.effective(actor)).some(
      (p) => p.code === 'delivery.manage',
    );
    const rows = (
      await this.rbac.pool.query(
        "SELECT DISTINCT o.id FROM orders o JOIN delivery_trip_orders a ON a.order_id=o.id JOIN delivery_trips t ON t.id=a.trip_id WHERE o.deleted_at IS NULL AND o.status IN ('READY','AWAITING_DELIVERY_ASSIGNMENT','DELIVERING','DELIVERED_AWAITING_CONFIRMATION') AND ($1::uuid IS NULL OR o.customer_id=$1) AND ($2::boolean OR t.employee_id=$3)",
        [customerId ?? null, manage, employee ?? null],
      )
    ).rows;
    return {
      data: await Promise.all(
        rows.map(async (r) => {
          const order = await this.order(r.id);
          const declaration = (
            await this.rbac.pool.query(
              'SELECT s.*,l.business_date,l.occurred_at,l.note FROM ledger_delivery_submissions s JOIN customers_ledger l ON l.id=s.ledger_id WHERE s.order_id=$1',
              [r.id],
            )
          ).rows[0];
          const assigned_trips = (
            await this.rbac.pool.query(
              'SELECT t.id,t.delivery_date,e.full_name FROM delivery_trips t JOIN delivery_trip_orders a ON a.trip_id=t.id JOIN employees e ON e.id=t.employee_id WHERE a.order_id=$1 AND ($2::boolean OR t.employee_id=$3) ORDER BY t.created_at DESC',
              [r.id, manage, employee ?? null],
            )
          ).rows;
          return { ...order, declaration: declaration ?? null, assigned_trips };
        }),
      ),
    };
  }
  async returnable(customerId?: string) {
    return {
      data: (
        await this.rbac.pool.query(
          "SELECT l.id,l.customer_id,coalesce(o.order_code,'Giao trực tiếp · ' || left(l.id::text,8)) order_code,c.name customer_name,l.labor_amount_due,l.labor_amount_paid FROM customers_ledger l LEFT JOIN orders o ON o.id=l.reference_id JOIN customers c ON c.id=l.customer_id WHERE (l.reference_type='ORDER_DELIVERY' OR (l.reference_type='MANUAL_DELIVERY' AND EXISTS(SELECT 1 FROM order_items i WHERE i.ledger_id=l.id))) AND l.approval_status='APPROVED' AND l.reversed_at IS NULL AND ($1::uuid IS NULL OR l.customer_id=$1) ORDER BY l.created_at DESC",
          [customerId ?? null],
        )
      ).rows,
    };
  }
  async outstanding() {
    return {
      data: (
        await this.rbac.pool.query(
          "SELECT l.id,l.customer_id,coalesce(o.order_code,'Giao trực tiếp · ' || left(l.id::text,8)) order_code,c.name customer_name,l.labor_amount_due,l.labor_amount_paid FROM customers_ledger l LEFT JOIN orders o ON o.id=l.reference_id JOIN customers c ON c.id=l.customer_id WHERE l.reference_type IN ('ORDER_DELIVERY','MANUAL_DELIVERY') AND l.approval_status='APPROVED' AND l.reversed_at IS NULL AND l.labor_amount_due>l.labor_amount_paid ORDER BY l.created_at DESC",
        )
      ).rows,
    };
  }
  async orders(customerId?: string) {
    const rows = (
      await this.rbac.pool.query(
        'SELECT * FROM orders WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR customer_id=$1) ORDER BY created_at DESC',
        [customerId ?? null],
      )
    ).rows;
    return { data: await Promise.all(rows.map((r) => this.order(r.id))) };
  }
  async order(id: string, c: Db = this.rbac.pool) {
    const row = (
      await c.query('SELECT * FROM orders WHERE id=$1 AND deleted_at IS NULL', [
        id,
      ])
    ).rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy đơn hàng');
    const items = (
      await c.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id', [
        id,
      ])
    ).rows;
    const total = items.reduce(
        (v: bigint, i: Row) => v + units(String(i.line_labor_amount)),
        0n,
      ),
      gold = items.reduce(
        (v: bigint, i: Row) =>
          v + BigInt(i.quantity) * units(String(i.unit_weight_g)),
        0n,
      );
    const data = {
      ...row,
      items,
      original_labor_baht: toDecimal(total),
      gold_weight_g: toDecimal(gold),
    };
    return { ...data, version: this.version(data) };
  }
  private async newOrder(
    c: PoolClient,
    actor: string,
    customer: string,
    items: (CreateOrderDto['items'][number] & {
      design_code_snapshot?: string;
      design_image_snapshot?: string;
    })[],
    preserveSnapshots = false,
  ) {
    if (
      !(
        await c.query(
          "SELECT id FROM customers WHERE id=$1 AND deleted_at IS NULL AND status='ACTIVE'",
          [customer],
        )
      ).rowCount
    )
      throw new BadRequestException('Khách hàng không hoạt động');
    const code =
      'DH' +
      (
        await c.query<{ v: string }>(
          "SELECT nextval('public.order_code_seq')::text v",
        )
      ).rows[0]!.v.padStart(6, '0');
    const row = (
      await c.query<{ id: string }>(
        'INSERT INTO orders(order_code,customer_id,created_by) VALUES($1,$2,$3) RETURNING id',
        [code, customer, actor],
      )
    ).rows[0]!;
    for (const item of items) {
      if (!item.item_name.trim() || units(item.unit_weight_g) <= 0n)
        throw new BadRequestException(
          'Tên / trọng lượng dòng hàng không hợp lệ',
        );
      let model: Row | undefined;
      if (item.design_model_id && !preserveSnapshots) {
        model = (
          await c.query(
            "SELECT * FROM design_models WHERE id=$1 AND status='ACTIVE' FOR SHARE",
            [item.design_model_id],
          )
        ).rows[0];
        if (!model)
          throw new BadRequestException(
            'Mẫu mã không tồn tại hoặc đã ngừng sử dụng',
          );
      }
      await c.query(
        'INSERT INTO order_items(order_id,item_name,quantity,unit_weight_g,labor_price_per_15g,design_model_id,design_code_snapshot,design_image_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          row.id,
          item.item_name.trim(),
          item.quantity,
          item.unit_weight_g,
          item.labor_price_per_15g,
          item.design_model_id ?? null,
          preserveSnapshots
            ? (item.design_code_snapshot ?? null)
            : (model?.code ?? null),
          preserveSnapshots
            ? (item.design_image_snapshot ?? null)
            : (model?.image_url ?? null),
        ],
      );
    }
    return this.order(row.id, c);
  }
  createOrder(dto: CreateOrderDto, actor: string) {
    return this.tx(
      actor,
      ['orders.create'],
      dto.customer_id,
      'orders.create',
      null,
      async (c) => ({
        data: await this.newOrder(c, actor, dto.customer_id, dto.items),
      }),
    );
  }
  async orderStatus(id: string, dto: OrderStatusDto, actor: string) {
    const source = await this.order(id);
    return this.tx(
      actor,
      ['orders.update'],
      source.customer_id,
      'orders.status',
      id,
      async (c) => {
        const order = await this.order(id, c);
        this.rbac.checkVersion(dto.version, order.version);
        if (
          (
            await c.query(
              'SELECT id FROM customers_ledger WHERE reference_type=$1 AND reference_id=$2',
              ['ORDER_DELIVERY', id],
            )
          ).rowCount
        )
          throw new ConflictException(
            'Đơn đã giao phải đi qua luồng giao / kế toán',
          );
        await c.query(
          'UPDATE orders SET status=$2,updated_at=clock_timestamp() WHERE id=$1',
          [id, dto.status],
        );
        return { before: order, data: await this.order(id, c) };
      },
    );
  }
  async splitOrder(id: string, dto: SplitOrderDto, actor: string) {
    const source = await this.order(id);
    return this.tx(
      actor,
      ['orders.split'],
      source.customer_id,
      'orders.split',
      id,
      async (c) => {
        const order = await this.order(id, c);
        this.rbac.checkVersion(dto.version, order.version);
        if (
          !['PREPARING', 'READY', 'AWAITING_DELIVERY_ASSIGNMENT'].includes(
            order.status,
          ) ||
          (
            await c.query('SELECT id FROM delivery_events WHERE order_id=$1', [
              id,
            ])
          ).rowCount ||
          (
            await c.query(
              "SELECT id FROM customers_ledger WHERE reference_type='ORDER_DELIVERY' AND reference_id=$1",
              [id],
            )
          ).rowCount
        )
          throw new ConflictException(
            'Chỉ tách đơn chưa phát sinh giao hàng / công nợ',
          );
        const totals = new Map<string, number>();
        for (const child of dto.children)
          for (const part of child.items)
            totals.set(
              part.order_item_id,
              (totals.get(part.order_item_id) ?? 0) + part.quantity,
            );
        if (
          totals.size !== order.items.length ||
          order.items.some((i: Row) => totals.get(i.id) !== i.quantity)
        )
          throw new BadRequestException(
            'Các đơn nhỏ phải phân chia đúng toàn bộ số lượng của từng dòng gốc',
          );
        const children = [];
        for (const child of dto.children) {
          const items = child.items.map((part) => {
            const original = order.items.find(
              (i: Row) => i.id === part.order_item_id,
            );
            if (!original)
              throw new BadRequestException('Dòng hàng không thuộc đơn gốc');
            return {
              item_name: original.item_name,
              quantity: part.quantity,
              unit_weight_g: original.unit_weight_g,
              labor_price_per_15g: original.labor_price_per_15g,
              design_model_id: original.design_model_id,
              design_code_snapshot: original.design_code_snapshot,
              design_image_snapshot: original.design_image_snapshot,
            };
          });
          const created = await this.newOrder(
            c,
            actor,
            order.customer_id,
            items,
            true,
          );
          await c.query(
            'INSERT INTO order_split_links(source_order_id,new_order_id,split_by) VALUES($1,$2,$3)',
            [id, created.id, actor],
          );
          children.push(created);
        }
        await c.query(
          "UPDATE orders SET status='CANCELLED',updated_at=clock_timestamp() WHERE id=$1",
          [id],
        );
        return {
          before: order,
          data: { id, children, source_status: 'CANCELLED' },
        };
      },
    );
  }
  async trips() {
    return {
      data: (
        await this.rbac.pool.query(
          'SELECT t.*,e.full_name,(SELECT jsonb_agg(d.order_id) FROM delivery_trip_orders d WHERE d.trip_id=t.id) order_ids FROM delivery_trips t JOIN employees e ON e.id=t.employee_id ORDER BY t.created_at DESC',
        )
      ).rows,
    };
  }
  createTrip(dto: CreateTripDto, actor: string) {
    return this.tx(
      actor,
      ['delivery.manage'],
      null,
      'delivery.trip.create',
      null,
      async (c) => {
        if (
          !(
            await c.query(
              "SELECT id FROM employees WHERE id=$1 AND status='ACTIVE' AND deleted_at IS NULL",
              [dto.employee_id],
            )
          ).rowCount
        )
          throw new BadRequestException('Nhân viên giao hàng không hoạt động');
        for (const id of dto.order_ids) {
          const order = await this.order(id, c);
          if (
            !['READY', 'AWAITING_DELIVERY_ASSIGNMENT', 'DELIVERING'].includes(
              order.status,
            )
          )
            throw new ConflictException('Đơn chưa sẵn sàng hoặc đã hoàn tất');
        }
        const row = (
          await c.query(
            'INSERT INTO delivery_trips(employee_id,delivery_date,created_by,note) VALUES($1,$2,$3,$4) RETURNING *',
            [dto.employee_id, dto.delivery_date, actor, dto.note ?? null],
          )
        ).rows[0];
        for (const id of dto.order_ids) {
          await c.query(
            'INSERT INTO delivery_trip_orders(trip_id,order_id) VALUES($1,$2)',
            [row.id, id],
          );
          await c.query(
            "UPDATE orders SET status='DELIVERING',updated_at=clock_timestamp() WHERE id=$1",
            [id],
          );
        }
        return { data: { ...row, order_ids: dto.order_ids } };
      },
    );
  }
  async deliveryEvent(tripId: string, dto: DeliveryEventDto, actor: string) {
    const source = await this.order(dto.order_id);
    return this.tx(
      actor,
      ['delivery.report'],
      source.customer_id,
      'delivery.event',
      dto.order_id,
      async (c) => {
        const trip = (
          await c.query(
            'SELECT t.* FROM delivery_trips t JOIN delivery_trip_orders a ON a.trip_id=t.id WHERE t.id=$1 AND a.order_id=$2',
            [tripId, dto.order_id],
          )
        ).rows[0];
        if (!trip) throw new NotFoundException('Đơn không thuộc chuyến');
        const employee = (
          await c.query('SELECT employee_id FROM users WHERE id=$1', [actor])
        ).rows[0]?.employee_id;
        const manager = (await this.rbac.effective(actor, c)).some(
          (p) => p.code === 'delivery.manage',
        );
        if (!manager && trip.employee_id !== employee)
          throw new BadRequestException(
            'Không được thao tác chuyến giao của nhân viên khác',
          );
        if (
          (
            await c.query(
              "SELECT id FROM customers_ledger WHERE reference_type='ORDER_DELIVERY' AND reference_id=$1",
              [dto.order_id],
            )
          ).rowCount
        )
          throw new ConflictException(
            'Đơn đã báo giao phải xử lý qua luồng kế toán; không dùng sự kiện thất bại để thay đổi công nợ',
          );
        const row = (
          await c.query(
            'INSERT INTO delivery_events(trip_id,order_id,event_type,occurred_at,actor_id,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
            [
              tripId,
              dto.order_id,
              dto.event_type,
              dto.occurred_at,
              actor,
              dto.note,
            ],
          )
        ).rows[0];
        return { data: row };
      },
    );
  }
  private async ledger(id: string, c: Db = this.rbac.pool) {
    const row = (
      await c.query('SELECT * FROM customers_ledger WHERE id=$1', [id])
    ).rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy giao dịch');
    return row;
  }
  private async state(ledgerId: string, c: Db = this.rbac.pool) {
    const ledger = await this.ledger(ledgerId, c);
    const submission = (
      await c.query(
        'SELECT * FROM ledger_delivery_submissions WHERE ledger_id=$1',
        [ledgerId],
      )
    ).rows[0];
    if (!submission)
      throw new ConflictException(
        'Giao dịch cũ chưa có đơn hàng nguồn; không được tự tạo thanh toán thay thế dữ liệu cũ',
      );
    const receipts = (
      await c.query(
        'SELECT * FROM ledger_payments WHERE ledger_id=$1 ORDER BY created_at,id',
        [ledgerId],
      )
    ).rows;
    const returned = (
      await c.query(
        "SELECT coalesce(sum(i.net_labor_baht),0)::text net FROM ledger_goods_return_items i JOIN ledger_goods_returns r ON r.id=i.return_id WHERE r.source_ledger_id=$1 AND r.status='APPROVED'",
        [ledgerId],
      )
    ).rows[0].net;
    const refunds = (
      await c.query(
        'SELECT coalesce(sum(f.amount_baht),0)::text amount FROM ledger_refunds f JOIN ledger_goods_returns r ON r.id=f.return_id WHERE r.source_ledger_id=$1',
        [ledgerId],
      )
    ).rows[0].amount;
    const due = units(submission.net_labor_baht) - units(returned),
      paid =
        receipts
          .filter((r: Row) => r.status === 'APPROVED')
          .reduce((v: bigint, r: Row) => v + units(r.paid_baht), 0n) -
        units(refunds);
    if (due < 0n || paid < 0n || paid > due)
      throw new ConflictException(
        'Công nợ âm hoặc thu vượt; cần quyết định nghiệp vụ, không tự tạo số dư có / cấn trừ',
      );
    return { ledger, submission, receipts, due, paid, outstanding: due - paid };
  }
  private async recalculate(ledgerId: string, c: PoolClient) {
    const state = await this.state(ledgerId, c);
    const status =
      state.due === state.paid
        ? 'PAID'
        : state.paid === 0n
          ? 'UNPAID'
          : 'PARTIALLY_PAID';
    await c.query(
      "UPDATE customers_ledger SET labor_amount_due=$2,labor_amount_paid=$3,labor_currency='THB',labor_payment_status=$4,updated_at=clock_timestamp() WHERE id=$1",
      [ledgerId, toDecimal(state.due), toDecimal(state.paid), status],
    );
    await c.query(
      'UPDATE orders SET labor_payment_status=$2,updated_at=clock_timestamp() WHERE id=$1',
      [
        state.submission.order_id,
        status === 'PARTIALLY_PAID' ? 'PARTIAL' : status,
      ],
    );
    return state;
  }
  async detail(ledgerId: string, c: Db = this.rbac.pool): Promise<Row> {
    if (c === this.rbac.pool)
      return this.snapshot((client) => this.detail(ledgerId, client));
    const state = await this.state(ledgerId, c);
    state.ledger.transaction_employee = state.ledger.transaction_employee_id ? (await c.query('SELECT id,employee_code code,full_name name FROM employees WHERE id=$1',[state.ledger.transaction_employee_id])).rows[0] : null;
    const order = state.submission.order_id
      ? await this.order(state.submission.order_id, c)
      : null;
    const claimed = (
      await c.query(
        "SELECT i.order_item_id,sum(i.quantity)::int quantity FROM ledger_goods_return_items i JOIN ledger_goods_returns r ON r.id=i.return_id WHERE r.source_ledger_id=$1 AND r.status IN ('PENDING','APPROVED') GROUP BY i.order_item_id",
        [ledgerId],
      )
    ).rows;
    const items = (order?.items ?? (await c.query('SELECT * FROM order_items WHERE ledger_id=$1 AND superseded_at IS NULL ORDER BY id',[ledgerId])).rows).map((i: Row) => ({...i, returned_quantity: claimed.find(r=>r.order_item_id===i.id)?.quantity??0}));
    if(order)order.items=items;
    const returnRows = (
      await c.query(
        'SELECT * FROM ledger_goods_returns WHERE source_ledger_id=$1 ORDER BY created_at',
        [ledgerId],
      )
    ).rows;
    const returns = await Promise.all(
      returnRows.map((r) => this.goodsReturn(r.id, c)),
    );
    const revisions = (
      await c.query(
        'SELECT x.* FROM ledger_fx_revisions x JOIN ledger_payments p ON p.id=x.payment_id WHERE p.ledger_id=$1 ORDER BY x.created_at',
        [ledgerId],
      )
    ).rows;
    const data = {
      id: ledgerId,
      ledger: state.ledger,
      submission: state.submission,
      order,
      items,
      payments: await Promise.all(
        state.receipts.map((r: Row) => this.payment(r.id, c)),
      ),
      returns,
      fx_revisions: revisions,
      outstanding_baht: toDecimal(state.outstanding),
      paid_baht: toDecimal(state.paid),
      due_baht: toDecimal(state.due),
    };
    return { ...data, version: this.version(data) };
  }
  async manualDelivery(dto: ManualDeliveryDto, actor: string) {
    return this.tx(
      actor,
      ['customer_ledger.create'],
      dto.customer_id,
      'delivery.manual_record',
      null,
      async (c) => {
        const prior = (
          await c.query('SELECT * FROM customers_ledger WHERE request_id=$1', [
            dto.request_id,
          ])
        ).rows[0];
        const intent = {
          ...dto,
          gold_weight_g: toDecimal(units(dto.gold_weight_g)),
          original_labor_baht: toDecimal(units(dto.original_labor_baht)),
          discount_value: toDecimal(units(dto.discount_value)),
          actual_received_amount: toDecimal(
            units(dto.actual_received_amount ?? '0'),
          ),
          confirmed_fx_per_baht:
            dto.received_currency === 'THB'
              ? '1.0000'
              : dto.confirmed_fx_per_baht
                ? toDecimal(units(dto.confirmed_fx_per_baht))
                : null,
          occurred_at: new Date(dto.occurred_at).toISOString(),
        };
        const intentSignature = this.version(
          Object.entries(intent)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
        );
        if (prior) {
          const audit = (
            await c.query(
              "SELECT after_state FROM security_audit WHERE target_id=$1 AND action='delivery.manual_record' LIMIT 1",
              [prior.id],
            )
          ).rows[0];
          if (
            prior.created_by !== actor ||
            prior.reference_type !== 'MANUAL_DELIVERY' ||
            audit?.after_state?.intent_signature !== intentSignature
          )
            throw new ConflictException('Mã yêu cầu đã dùng cho nội dung khác');
          return {
            data: {
              ...(await this.detail(prior.id, c)),
              intent_signature: intentSignature,
            },
          };
        }
        if (
          !(
            await c.query(
              'SELECT id FROM customers WHERE id=$1 AND deleted_at IS NULL',
              [dto.customer_id],
            )
          ).rowCount
        )
          throw new NotFoundException('Không tìm thấy khách hàng');
        const gold = units(dto.gold_weight_g),
          original = units(dto.original_labor_baht),
          value = units(dto.discount_value),
          received = units(dto.actual_received_amount ?? '0');
        if (
          gold <= 0n ||
          (dto.discount_type === 'NONE' && value !== 0n) ||
          (dto.discount_type === 'PERCENT' && value > 1000000n)
        )
          throw new BadRequestException(
            'Trọng lượng hoặc giảm giá không hợp lệ',
          );
        const discount =
          dto.discount_type === 'PERCENT'
            ? roundedDivide(original * value, 1000000n)
            : dto.discount_type === 'AMOUNT'
              ? value
              : 0n;
        if (discount > original)
          throw new BadRequestException('Giảm giá vượt tiền công gốc');
        const net = original - discount,
          id = randomUUID();
        const date = (
          await c.query(
            "SELECT ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS value",
            [dto.occurred_at],
          )
        ).rows[0].value;
        await c.query(
          "INSERT INTO customers_ledger(id,customer_id,business_date,occurred_at,transaction_type,gold_weight_g,labor_amount_due,labor_amount_paid,labor_currency,labor_payment_status,reference_type,created_by,request_id,approval_status,approved_by,approved_at,note) VALUES($1,$2,$3,$4,'DELIVERY',$5,$6,0,'THB',$7,'MANUAL_DELIVERY',$8,$9,'PENDING',NULL,NULL,$10)",
          [
            id,
            dto.customer_id,
            date,
            dto.occurred_at,
            toDecimal(gold),
            toDecimal(net),
            net === 0n ? 'PAID' : 'UNPAID',
            actor,
            dto.request_id,
            dto.note ?? null,
          ],
        );
        await c.query(
          'INSERT INTO ledger_delivery_submissions(ledger_id,original_labor_baht,discount_type,discount_value,discount_baht,net_labor_baht,actual_received_amount,received_currency,declared_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            id,
            toDecimal(original),
            dto.discount_type,
            toDecimal(value),
            toDecimal(discount),
            toDecimal(net),
            received > 0n ? toDecimal(received) : null,
            received > 0n ? dto.received_currency : null,
            actor,
          ],
        );
        if (received > 0n) {
          await this.rbac.require(actor, ['customer_ledger.collect'], c);
          if (!dto.received_currency)
            throw new BadRequestException(
              'Chọn đồng tiền và xác nhận tỷ giá thực thu',
            );
          await (
            await c.query(
              "INSERT INTO ledger_payments(ledger_id,request_id,source,amount,currency,business_date,occurred_at,collected_by) VALUES($1,$2,'DELIVERY',$3,$4,$5,$6,$7) RETURNING id",
              [
                id,
                randomUUID(),
                toDecimal(received),
                dto.received_currency,
                date,
                dto.occurred_at,
                actor,
              ],
            )
          ).rows[0];

        }
        await this.recalculate(id, c);
        await this.recordFromLedgerInTransaction(id, actor, c, dto.confirmed_fx_per_baht);
        return {
          data: {
            ...(await this.detail(id, c)),
            intent_signature: intentSignature,
          },
        };
      },
    );
  }
  async report(orderId: string, dto: ReportDeliveryDto, actor: string) {
    const source = await this.order(orderId);
    return this.tx(
      actor,
      ['delivery.report'],
      source.customer_id,
      'delivery.report',
      orderId,
      (c) => this.reportInTransaction(orderId,dto,actor,c),
    );
  }
  async recordDeliveryFromLedger(orderId:string,dto:ReportDeliveryDto,actor:string) {
    const source=await this.order(orderId);
    return this.tx(actor,['customer_ledger.create','delivery.report'],source.customer_id,'delivery.record_from_ledger',orderId,async c=>{
      const result=await this.reportInTransaction(orderId,dto,actor,c);
      await this.recordFromLedgerInTransaction(result.data.id,actor,c,dto.confirmed_fx_per_baht);
      return {before:result.before,data:await this.detail(result.data.id,c)};
    });
  }
  async reportInTransaction(orderId:string,dto:ReportDeliveryDto,actor:string,c:PoolClient) {

        const order = await this.order(orderId, c);
        this.rbac.checkVersion(dto.version, order.version);
        if (
          ![
            'READY',
            'AWAITING_DELIVERY_ASSIGNMENT',
            'DELIVERING',
            'DELIVERED_AWAITING_CONFIRMATION',
          ].includes(order.status)
        )
          throw new ConflictException(
            'Đơn không ở trạng thái cho phép báo giao',
          );
        const assigned = (
          await c.query(
            'SELECT t.* FROM delivery_trips t JOIN delivery_trip_orders a ON a.trip_id=t.id WHERE a.order_id=$1 AND ($2::uuid IS NULL OR t.id=$2) ORDER BY t.created_at DESC',
            [orderId, dto.trip_id ?? null],
          )
        ).rows;
        if (!assigned.length)
          throw new ConflictException(
            'Đơn phải được phân công vào chuyến giao thực tế trước khi báo giao',
          );
        const employee = (
          await c.query('SELECT employee_id FROM users WHERE id=$1', [actor])
        ).rows[0].employee_id;
        const canManage = (await this.rbac.effective(actor, c)).some(
          (p) => p.code === 'delivery.manage',
        );
        const trip = assigned.find(
          (t: Row) => canManage || t.employee_id === employee,
        );
        if (!trip)
          throw new BadRequestException(
            'Chỉ nhân viên phụ trách chuyến giao hoặc người quản lý giao hàng được khai',
          );
        const old = (
          await c.query(
            "SELECT * FROM customers_ledger WHERE reference_type='ORDER_DELIVERY' AND reference_id=$1 FOR UPDATE",
            [orderId],
          )
        ).rows[0];
        if (old && old.approval_status === 'APPROVED')
          throw new ConflictException(
            'Đã duyệt giao hàng; không sửa đè chứng từ',
          );
        const before = old ? await this.detail(old.id, c) : order;
        const original = units(order.original_labor_baht),
          value = units(dto.discount_value);
        if (
          (dto.discount_type === 'NONE' && value !== 0n) ||
          (dto.discount_type === 'PERCENT' && value > 1000000n)
        )
          throw new BadRequestException('Giảm giá không hợp lệ');
        const discount =
          dto.discount_type === 'PERCENT'
            ? roundedDivide(original * value, 1000000n)
            : dto.discount_type === 'AMOUNT'
              ? value
              : 0n;
        if (discount > original)
          throw new BadRequestException('Giảm giá vượt tiền công gốc');
        const net = original - discount,
          received = units(dto.actual_received_amount ?? '0');
        if (received > 0n && !dto.received_currency)
          throw new BadRequestException('Chọn loại tiền thực thu');
        const ledgerId = old?.id ?? randomUUID();
        if (old)
          await c.query(
            "UPDATE customers_ledger SET business_date=$2,occurred_at=$3,gold_weight_g=$4,labor_amount_due=$5,approval_status='PENDING',note=$6,updated_by=$7,updated_at=clock_timestamp() WHERE id=$1",
            [
              ledgerId,
              dto.business_date,
              dto.occurred_at,
              order.gold_weight_g,
              toDecimal(net),
              dto.note ?? old.note,
              actor,
            ],
          );
        else
          await c.query(
            "INSERT INTO customers_ledger(id,customer_id,business_date,occurred_at,transaction_type,gold_weight_g,labor_amount_due,labor_amount_paid,labor_currency,labor_payment_status,reference_type,reference_id,created_by,approval_status,updated_at,note) VALUES($1,$2,$3,$4,'DELIVERY',$5,$6,0,'THB',$7,'ORDER_DELIVERY',$8,$9,'PENDING',clock_timestamp(),$10)",
            [
              ledgerId,
              order.customer_id,
              dto.business_date,
              dto.occurred_at,
              order.gold_weight_g,
              toDecimal(net),
              net === 0n ? 'PAID' : 'UNPAID',
              orderId,
              actor,
              dto.note ?? null,
            ],
          );
        await c.query(
          `INSERT INTO ledger_delivery_submissions(order_id,ledger_id,trip_id,original_labor_baht,discount_type,discount_value,discount_baht,net_labor_baht,actual_received_amount,received_currency,declared_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(order_id) DO UPDATE SET trip_id=EXCLUDED.trip_id,original_labor_baht=EXCLUDED.original_labor_baht,discount_type=EXCLUDED.discount_type,discount_value=EXCLUDED.discount_value,discount_baht=EXCLUDED.discount_baht,net_labor_baht=EXCLUDED.net_labor_baht,actual_received_amount=EXCLUDED.actual_received_amount,received_currency=EXCLUDED.received_currency,declared_by=EXCLUDED.declared_by,declared_at=clock_timestamp()`,
          [
            orderId,
            ledgerId,
            trip.id,
            toDecimal(original),
            dto.discount_type,
            dto.discount_value,
            toDecimal(discount),
            toDecimal(net),
            received > 0n ? toDecimal(received) : null,
            received > 0n ? dto.received_currency : null,
            actor,
          ],
        );
        await c.query(
          "UPDATE ledger_payments SET status='VOID' WHERE order_id=$1 AND source='DELIVERY' AND status='PENDING'",
          [orderId],
        );
        if (received > 0n)
          await c.query(
            "INSERT INTO ledger_payments(ledger_id,order_id,request_id,source,amount,currency,business_date,occurred_at,collected_by) VALUES($1,$2,$3,'DELIVERY',$4,$5,$6,$7,$8)",
            [
              ledgerId,
              orderId,
              randomUUID(),
              toDecimal(received),
              dto.received_currency,
              dto.business_date,
              dto.occurred_at,
              actor,
            ],
          );
        await c.query(
          "UPDATE orders SET status='DELIVERED_AWAITING_CONFIRMATION',delivery_error=false,updated_at=clock_timestamp() WHERE id=$1",
          [orderId],
        );
        await c.query(
          "INSERT INTO delivery_events(trip_id,order_id,event_type,occurred_at,actor_id,note) VALUES($1,$2,'DELIVERED',$3,$4,$5)",
          [trip.id, orderId, dto.occurred_at, actor, dto.note ?? null],
        );
        await this.recalculate(ledgerId, c);
        return { before, data: await this.detail(ledgerId, c) };
  }
  private async assertCashDate(c: PoolClient, date: string) {
    if (
      (
        await c.query(
          'SELECT id FROM cash_report_periods WHERE closed_at IS NOT NULL AND $1::date BETWEEN from_date AND to_date',
          [date],
        )
      ).rowCount
    )
      throw new ConflictException(
        'Ngày thu/chi thuộc kỳ báo cáo đã chốt; không sửa đè hoặc ghi thêm chứng từ vào kỳ đó',
      );
  }
  private fxPaid(amount: string, currency: string, fx: string) {
    const rate = units(fx);
    if (rate <= 0n || (currency === 'THB' && rate !== 10000n))
      throw new BadRequestException('Tỷ giá phải dương; BAHT có tỷ lệ 1:1');
    const paid = roundedDivide(units(amount) * 10000n, rate);
    if (paid <= 0n)
      throw new BadRequestException(
        'Tiền quy đổi quá nhỏ để ghi numeric(20,4)',
      );
    return paid;
  }
  private async approveReceipt(
    c: PoolClient,
    id: string,
    fx: string,
    actor: string,
  ) {
    const receipt = (
      await c.query('SELECT * FROM ledger_payments WHERE id=$1 FOR UPDATE', [
        id,
      ])
    ).rows[0];
    if (!receipt) throw new NotFoundException('Không tìm thấy lần thu');
    if (receipt.status === 'APPROVED') return receipt;
    if (receipt.status !== 'PENDING')
      throw new ConflictException('Lần thu đã bị thay thế / vô hiệu');
    const state = await this.state(receipt.ledger_id, c);
    const paid = this.fxPaid(receipt.amount, receipt.currency, fx);
    if (paid > state.outstanding)
      throw new ConflictException(
        'Thu vượt số BAHT còn phải thu; không tự tạo số dư có, hoàn tiền hoặc cấn trừ',
      );
    await this.assertCashDate(
      c,
      String(
        receipt.business_date instanceof Date
          ? receipt.business_date.toISOString().slice(0, 10)
          : receipt.business_date,
      ),
    );
    await c.query(
      "UPDATE ledger_payments SET status='APPROVED',confirmed_fx_per_baht=$2,paid_baht=$3,approved_by=$4,approved_at=clock_timestamp() WHERE id=$1",
      [id, fx, toDecimal(paid), actor],
    );
    await c.query(
      "INSERT INTO cash_transactions(direction,category_id,amount,currency,customer_id,employee_id,business_date,occurred_at,created_by,payment_id,reference_type,reference_id) SELECT 'IN',cat.id,p.amount,p.currency,l.customer_id,coalesce(p.collected_employee_id,u.employee_id),p.business_date,p.occurred_at,$2,p.id,'LEDGER_PAYMENT',p.id FROM ledger_payments p JOIN customers_ledger l ON l.id=p.ledger_id JOIN users u ON u.id=p.collected_by CROSS JOIN cash_categories cat WHERE p.id=$1 AND cat.code='CUSTOMER_LABOR_IN' ON CONFLICT(payment_id) DO NOTHING",
      [id, actor],
    );
    await c.query(
      'INSERT INTO ledger_fx_revisions(payment_id,new_fx,new_paid_baht,actor_id,reason) VALUES($1,$2,$3,$4,$5)',
      [id, fx, toDecimal(paid), actor, 'Duyệt khoản thu'],
    );
    await this.recalculate(receipt.ledger_id, c);
    return (await c.query('SELECT * FROM ledger_payments WHERE id=$1', [id]))
      .rows[0];
  }
  /** Ledger entry is authoritative; standalone delivery reports still require review. */
  async recordFromLedgerInTransaction(id: string, actor: string, c: PoolClient, confirmedFx?: string) {
    await this.rbac.require(actor, ['customer_ledger.create'], c);
    const before = await this.detail(id, c);
    if (before.ledger.approval_status === 'APPROVED') return;
    if (before.ledger.approval_status !== 'PENDING' || before.ledger.reversed_at ||
        !['MANUAL_DELIVERY', 'ORDER_DELIVERY'].includes(before.ledger.reference_type)) {
      throw new ConflictException('Không thể ghi nhận phiếu giao này từ sổ');
    }
    for (const receipt of before.payments.filter((p: Row) => p.source === 'DELIVERY' && p.status === 'PENDING')) {
      await this.rbac.require(actor, ['customer_ledger.collect'], c);
      const fx = receipt.currency === 'THB' ? '1' : confirmedFx;
      if (!fx) throw new BadRequestException('Nhập tỷ giá xác nhận cho khoản thu ngoại tệ');
      await this.approveReceipt(c, receipt.id, fx, actor);
    }
    await this.finalizeDelivery(id, actor, before, c);
    await c.query(
      'INSERT INTO security_audit(actor_id,target_id,action,before_state,after_state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',
      [actor, id, 'delivery.record_from_ledger', JSON.stringify(before), JSON.stringify(await this.detail(id, c))],
    );
  }
  private async finalizeDelivery(id: string, actor: string, before: Row, c: PoolClient) {
    await c.query(
      "UPDATE customers_ledger SET approval_status='APPROVED',approved_at=clock_timestamp(),approved_by=$2,updated_at=clock_timestamp() WHERE id=$1",
      [id, actor],
    );
    await c.query(
      "UPDATE orders SET status='COMPLETED',delivery_error=false,updated_at=clock_timestamp() WHERE id=$1",
      [before.order?.id ?? null],
    );
    if (before.order) await c.query(
      "INSERT INTO delivery_events(trip_id,order_id,event_type,occurred_at,actor_id) VALUES($1,$2,'APPROVED',clock_timestamp(),$3)",
      [before.submission.trip_id, before.order.id, actor],
    );
  }
  async approveDelivery(id: string, dto: ApproveDeliveryDto, actor: string) {
    const source = await this.ledger(id);
    return this.tx(
      actor,
      ['customer_ledger.approve'],
      source.customer_id,
      'delivery.approve',
      id,
      async (c) => {
        const before = await this.detail(id, c);
        if (before.ledger.approval_status === 'APPROVED')
          return { data: before };
        this.rbac.checkVersion(dto.version, before.version);
        if (
          before.ledger.approval_status !== 'PENDING' ||
          before.ledger.reversed_at
        )
          throw new ConflictException('Chỉ duyệt giao hàng đang chờ duyệt');
        const initial = before.payments.find(
          (p: Row) => p.source === 'DELIVERY' && p.status === 'PENDING',
        );
        if (initial) {
          await this.rbac.require(actor, ['cash.approve'], c);
          const fx =
            initial.currency === 'THB' ? '1' : dto.confirmed_fx_per_baht;
          if (!fx)
            throw new BadRequestException(
              'Kế toán cần xác nhận tỷ giá; tỷ giá gợi ý không phải xác nhận đã thu đủ',
            );
          await this.approveReceipt(c, initial.id, fx, actor);
        }
        await this.finalizeDelivery(id, actor, before, c);
        return { before, data: await this.detail(id, c) };
      },
    );
  }
  async rejectDelivery(id: string, dto: RejectDeliveryDto, actor: string) {
    const source = await this.ledger(id);
    return this.tx(
      actor,
      ['customer_ledger.approve'],
      source.customer_id,
      'delivery.incorrect',
      id,
      async (c) => {
        const before = await this.detail(id, c);
        this.rbac.checkVersion(dto.version, before.version);
        if (before.ledger.approval_status !== 'PENDING')
          throw new ConflictException('Không sửa đè giao hàng đã duyệt');
        await c.query(
          "UPDATE customers_ledger SET approval_status='INCORRECT',updated_by=$2,updated_at=clock_timestamp() WHERE id=$1",
          [id, actor],
        );
        await c.query(
          'UPDATE orders SET delivery_error=true,updated_at=clock_timestamp() WHERE id=$1',
          [before.order?.id ?? null],
        );
        await c.query(
          'UPDATE ledger_delivery_submissions SET review_note=$2 WHERE ledger_id=$1',
          [id, dto.reason],
        );
        return { before, data: await this.detail(id, c) };
      },
    );
  }
  async collect(
    id: string,
    dto: PaymentDto,
    actor: string,
    source: 'LEDGER' | 'CASH',
    external?: PoolClient,
  ) {
    const root = await this.ledger(id, external ?? this.rbac.pool);
    return this.tx(
      actor,
      [source === 'CASH' ? 'cash.collect' : 'customer_ledger.collect'],
      root.customer_id,
      source === 'LEDGER' ? 'payment.record_from_ledger' : 'payment.declare',
      id,
      async (c) => {
        const before = await this.detail(id, c);
        if (
          before.ledger.approval_status !== 'APPROVED' ||
          before.ledger.reversed_at
        )
          throw new ConflictException('Chỉ thu bổ sung cho giao hàng đã duyệt');
        if (units(dto.amount) <= 0n)
          throw new BadRequestException('Số tiền thu phải dương');
        const fx=source==='LEDGER'?(dto.currency==='THB'?'1':dto.confirmed_fx_per_baht):undefined;
        if(source==='LEDGER'&&!fx)throw new BadRequestException('Nhập tỷ giá xác nhận để ghi nhận khoản thu ngoại tệ trực tiếp');
        if(dto.employee_id) {
          const accounts=(await c.query("SELECT u.id FROM users u JOIN employees e ON e.id=u.employee_id WHERE e.id=$1 AND e.deleted_at IS NULL AND u.status='ACTIVE' AND u.deleted_at IS NULL",[dto.employee_id])).rows;
          let eligible=false;
          for(const account of accounts)if((await this.rbac.effective(account.id,c)).some(p=>p.code==='delivery.report'))eligible=true;
          if(!eligible)throw new BadRequestException('Người thu phải có tài khoản hoạt động và quyền delivery.report');
        }
        const old = (
          await c.query('SELECT * FROM ledger_payments WHERE request_id=$1', [
            dto.request_id,
          ])
        ).rows[0];
        if (old) {
          if (
            old.ledger_id !== id ||
            old.source !== source ||
            (old.collected_employee_id ?? null) !== (dto.employee_id ?? null) ||
            (old.note ?? null) !== (dto.note ?? null) ||
            old.amount !== toDecimal(units(dto.amount)) ||
            old.currency !== dto.currency ||
            new Date(old.occurred_at).toISOString() !==
              new Date(dto.occurred_at).toISOString() ||
            old.business_date !== dto.business_date ||
            old.collected_by !== actor
          )
            throw new ConflictException(
              'Mã yêu cầu đã dùng cho khoản thu khác',
            );
          if(source==='LEDGER') {
            if(old.status==='APPROVED'&&units(old.confirmed_fx_per_baht)!==units(fx!))throw new ConflictException('Mã yêu cầu đã dùng với tỷ giá khác');
            await this.approveReceipt(c,old.id,fx!,actor);
          }
          return { data: await this.payment(old.id, c) };
        }
        if (units(before.outstanding_baht) <= 0n)
          throw new ConflictException('Đơn không còn tiền công phải thu');
        const receipt = (
          await c.query(
            'INSERT INTO ledger_payments(ledger_id,order_id,request_id,source,amount,currency,business_date,occurred_at,collected_by,collected_employee_id,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
            [
              id,
              before.order?.id ?? null,
              dto.request_id,
              source,
              dto.amount,
              dto.currency,
              dto.business_date,
              dto.occurred_at,
              actor,
              dto.employee_id ?? null,
              dto.note ?? null,
            ],
          )
        ).rows[0];
        if(source==='LEDGER')await this.approveReceipt(c,receipt.id,fx!,actor);
        return { before, data: await this.payment(receipt.id, c) };
      },
      external,
    );
  }
  async payment(id: string, c: Db = this.rbac.pool): Promise<Row> {
    if (c === this.rbac.pool)
      return this.snapshot((client) => this.payment(id, client));
    const row = (
      await c.query('SELECT * FROM ledger_payments WHERE id=$1', [id])
    ).rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy khoản thu');
    row.collector = row.collected_employee_id ? (await c.query('SELECT id,employee_code code,full_name name FROM employees WHERE id=$1',[row.collected_employee_id])).rows[0] : null;
    const state = await this.state(row.ledger_id, c);
    const suggested =
      state.outstanding > 0n
        ? toDecimal(
            roundedDivide(units(row.amount) * 10000n, state.outstanding),
          )
        : null;
    const data = {
      ...row,
      outstanding_before_baht: toDecimal(state.outstanding),
      suggested_fx_per_baht: row.currency === 'THB' ? '1.0000' : suggested,
      fx_unit:
        row.currency === 'LAK'
          ? 'KIP/BAHT'
          : row.currency === 'VND'
            ? 'VND/BAHT'
            : 'BAHT/BAHT',
      ledger_status: state.ledger.approval_status,
    };
    return {
      ...data,
      version: this.version({ ...data, ledger: state.ledger }),
    };
  }
  async payments() {
    const rows = (
      await this.rbac.pool.query(
        "SELECT id FROM ledger_payments WHERE status<>'VOID' ORDER BY created_at DESC",
      )
    ).rows;
    return { data: await Promise.all(rows.map((r) => this.payment(r.id))) };
  }
  async approvePayment(id: string, dto: ApprovePaymentDto, actor: string) {
    const receipt = await this.payment(id);
    const source = await this.ledger(receipt.ledger_id);
    return this.tx(
      actor,
      ['cash.approve'],
      source.customer_id,
      'payment.approve',
      id,
      async (c) => {
        const before = await this.payment(id, c);
        if (before.status === 'APPROVED') return { data: before };
        this.rbac.checkVersion(dto.version, before.version);
        if (before.ledger_status !== 'APPROVED')
          throw new ConflictException(
            'Khoản thu của giao hàng chờ duyệt phải duyệt cùng giao hàng',
          );
        await this.approveReceipt(c, id, dto.confirmed_fx_per_baht, actor);
        return { before, data: await this.payment(id, c) };
      },
    );
  }
  async voidPayment(id: string, dto: RejectDeliveryDto, actor: string) {
    const receipt = await this.payment(id);
    const root = await this.ledger(receipt.ledger_id);
    return this.tx(
      actor,
      ['cash.approve'],
      root.customer_id,
      'payment.declaration.void',
      id,
      async (c) => {
        const before = await this.payment(id, c);
        this.rbac.checkVersion(dto.version, before.version);
        if (before.status !== 'PENDING' || before.source === 'DELIVERY')
          throw new ConflictException(
            'Chỉ đánh dấu sai bản khai thu bổ sung chưa duyệt; bản khai giao hàng xử lý trên đơn gốc',
          );
        await c.query("UPDATE ledger_payments SET status='VOID' WHERE id=$1", [
          id,
        ]);
        return {
          before,
          data: { ...(await this.payment(id, c)), reason: dto.reason },
        };
      },
    );
  }
  async reviseFx(id: string, dto: ReviseFxDto, actor: string) {
    const receipt = await this.payment(id);
    const source = await this.ledger(receipt.ledger_id);
    return this.tx(
      actor,
      ['customer_ledger.fx.manage'],
      source.customer_id,
      'payment.fx.revise',
      id,
      async (c) => {
        const before = await this.payment(id, c);
        this.rbac.checkVersion(dto.version, before.version);
        if (before.status !== 'APPROVED')
          throw new ConflictException('Chỉ sửa tỷ giá khoản thu đã duyệt');
        const paid = this.fxPaid(
          before.amount,
          before.currency,
          dto.confirmed_fx_per_baht,
        );
        await c.query(
          'UPDATE ledger_payments SET confirmed_fx_per_baht=$2,paid_baht=$3 WHERE id=$1',
          [id, dto.confirmed_fx_per_baht, toDecimal(paid)],
        );
        await this.recalculate(before.ledger_id, c);
        await c.query(
          'INSERT INTO ledger_fx_revisions(payment_id,old_fx,new_fx,old_paid_baht,new_paid_baht,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            id,
            before.confirmed_fx_per_baht,
            dto.confirmed_fx_per_baht,
            before.paid_baht,
            toDecimal(paid),
            actor,
            dto.reason,
          ],
        );
        return { before, data: await this.payment(id, c) };
      },
    );
  }
  async createReturn(id: string, dto: CreateReturnDto, actor: string, fromLedger = false) {
    const source = await this.ledger(id);
    return this.tx(
      actor,
      ['customer_ledger.returns.manage'],
      source.customer_id,
      fromLedger?'goods_return.record_from_ledger':'goods_return.declare',
      id,
      async (c) => {
        const root = await this.detail(id, c);
        if (!root.items.length)
          throw new ConflictException(
            'Giao trực tiếp không có dòng hàng nguồn để lập phiếu trả hàng',
          );
        if (
          root.ledger.approval_status !== 'APPROVED' ||
          root.ledger.reversed_at
        )
          throw new ConflictException('Chỉ trả hàng đã giao và được duyệt');
        const old = (
          await c.query(
            'SELECT id FROM ledger_goods_returns WHERE request_id=$1',
            [dto.request_id],
          )
        ).rows[0];
        if (old)
          throw new ConflictException('Yêu cầu trả hàng đã được ghi nhận');
        const selectedIds = new Set(dto.items.map((i) => i.order_item_id));
        if (selectedIds.size !== dto.items.length)
          throw new BadRequestException('Không lặp dòng hàng');
        if (dto.employee_id) {
          const accounts = (await c.query("SELECT u.id FROM users u JOIN employees e ON e.id=u.employee_id AND e.deleted_at IS NULL WHERE e.id=$1 AND u.status='ACTIVE' AND u.deleted_at IS NULL", [dto.employee_id])).rows;
          let eligible = false;
          for (const account of accounts) {
            if ((await this.rbac.effective(account.id, c)).some(p => p.code === 'delivery.report')) eligible = true;
          }
          if (!eligible) throw new BadRequestException('Người giao dịch phải có tài khoản hoạt động và quyền delivery.report');
        }
        const returnId = randomUUID();
        await c.query(
          'INSERT INTO ledger_goods_returns(id,request_id,order_id,source_ledger_id,business_date,occurred_at,created_by,note,transaction_employee_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            returnId,
            dto.request_id,
            root.order?.id ?? null,
            id,
            dto.business_date,
            dto.occurred_at,
            actor,
            dto.note ?? null,
            dto.employee_id ?? null,
          ],
        );
        const sourceOriginal = units(root.submission.original_labor_baht),
          sourceNet = units(root.submission.net_labor_baht);
        // Cumulative rounding allocates the documented proportional discount exactly once,
        // including its final 0.0001 BAHT residual, without allocating received payments to lines.
        const lineNets = new Map<string, bigint>();
        let cumulativeOriginal = 0n,
          previousNet = 0n;
        for (const line of root.items) {
          cumulativeOriginal += units(line.line_labor_amount);
          const cumulativeNet =
            sourceOriginal === 0n
              ? 0n
              : roundedDivide(sourceNet * cumulativeOriginal, sourceOriginal);
          lineNets.set(line.id, cumulativeNet - previousNet);
          previousNet = cumulativeNet;
        }
        for (const input of dto.items) {
          const item = root.items.find(
            (i: Row) => i.id === input.order_item_id,
          );
          if (!item)
            throw new BadRequestException('Dòng hàng không thuộc đơn nguồn');
          const prior = (
            await c.query(
              "SELECT coalesce(sum(i.quantity),0)::int quantity,coalesce(sum(i.gold_weight_g),0)::text weight,coalesce(sum(i.net_labor_baht),0)::text net FROM ledger_goods_return_items i JOIN ledger_goods_returns r ON r.id=i.return_id WHERE i.order_item_id=$1 AND r.status IN ('PENDING','APPROVED')",
              [item.id],
            )
          ).rows[0];
          const expected = BigInt(input.quantity) * units(item.unit_weight_g),
            weight = input.gold_weight_g
              ? units(input.gold_weight_g)
              : expected;
          if (
            input.quantity + prior.quantity > item.quantity ||
            weight <= 0n ||
            weight > expected ||
            units(prior.weight) + weight >
              BigInt(item.quantity) * units(item.unit_weight_g)
          )
            throw new ConflictException(
              'Số lượng / trọng lượng trả vượt phần đã giao chưa trả',
            );
          const totalLineNet = lineNets.get(item.id)!;
          const cumulative = roundedDivide(
            totalLineNet * BigInt(prior.quantity + input.quantity),
            BigInt(item.quantity),
          );
          const net = cumulative - units(prior.net);
          if (net < 0n)
            throw new ConflictException('Phân bổ trả hàng không hợp lệ');
          await c.query(
            'INSERT INTO ledger_goods_return_items(return_id,order_item_id,quantity,gold_weight_g,net_labor_baht) VALUES($1,$2,$3,$4,$5)',
            [
              returnId,
              item.id,
              input.quantity,
              toDecimal(weight),
              toDecimal(net),
            ],
          );
        }
        if(fromLedger) {
          const current=await this.goodsReturn(returnId,c);
          if(dto.refund_amount===undefined&&units(current.min_refund_baht)>0n)throw new BadRequestException(`Phiếu này cần hoàn ít nhất ${current.min_refund_baht} THB. Nhập số tiền hoàn để ghi nhận trực tiếp.`);
          const currency=dto.refund_currency??'THB';
          const fx=currency==='THB'?'1':dto.confirmed_fx_per_baht;
          if(!fx)throw new BadRequestException('Nhập tỷ giá xác nhận cho khoản hoàn ngoại tệ');
          return this.postReturnInTransaction(returnId,{refund_amount:dto.refund_amount??'0',refund_currency:currency,confirmed_fx_per_baht:fx},actor,c);
        }
        return { before: root, data: await this.goodsReturn(returnId, c) };
      },
    );
  }
  async goodsReturn(id: string, c: Db = this.rbac.pool): Promise<Row> {
    if (c === this.rbac.pool)
      return this.snapshot((client) => this.goodsReturn(id, client));
    const row = (
      await c.query('SELECT * FROM ledger_goods_returns WHERE id=$1', [id])
    ).rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy phiếu trả hàng');
    const items = (
      await c.query(
        'SELECT i.*,o.item_name FROM ledger_goods_return_items i JOIN order_items o ON o.id=i.order_item_id WHERE i.return_id=$1 ORDER BY i.order_item_id',
        [id],
      )
    ).rows;
    const state = await this.state(row.source_ledger_id, c);
    const net = items.reduce(
      (v: bigint, i: Row) => v + units(i.net_labor_baht),
      0n,
    );
    const gold = items.reduce(
      (v: bigint, i: Row) => v + units(i.gold_weight_g),
      0n,
    );
    const min = net > state.outstanding ? net - state.outstanding : 0n,
      max = net < state.paid ? net : state.paid;
    const data = {
      ...row,
      items,
      net_labor_baht: toDecimal(net),
      gold_weight_g: toDecimal(gold),
      min_refund_baht: toDecimal(min),
      max_refund_baht: toDecimal(max),
    };
    return {
      ...data,
      version: this.version({ ...data, ledger: state.ledger }),
    };
  }
  async voidReturn(id: string, dto: RejectDeliveryDto, actor: string) {
    const record = await this.goodsReturn(id);
    const root = await this.ledger(record.source_ledger_id);
    return this.tx(
      actor,
      ['customer_ledger.returns.manage'],
      root.customer_id,
      'goods_return.declaration.void',
      id,
      async (c) => {
        const before = await this.goodsReturn(id, c);
        if (before.status === 'VOID') return { data: before };
        this.rbac.checkVersion(dto.version, before.version);
        if (before.status !== 'PENDING')
          throw new ConflictException(
            'Không hủy bản khai trả hàng đã duyệt / đã hoàn tiền',
          );
        await c.query(
          "UPDATE ledger_goods_returns SET status='VOID' WHERE id=$1",
          [id],
        );
        return {
          before,
          data: { ...(await this.goodsReturn(id, c)), reason: dto.reason },
        };
      },
    );
  }
  private async postReturnInTransaction(id:string,dto:{refund_amount:string;refund_currency:string;confirmed_fx_per_baht:string},actor:string,c:PoolClient,version?:string) {
        const before = await this.goodsReturn(id, c);
        if (before.status === 'APPROVED') return { data: before };
        if(before.status!=='PENDING')throw new ConflictException('Phiếu trả hàng không còn hiệu lực');
        if(version!==undefined)this.rbac.checkVersion(version,before.version);
        const root=await this.ledger(before.source_ledger_id,c);
        const amount = units(dto.refund_amount),
          rate = units(dto.confirmed_fx_per_baht);
        if (rate <= 0n || (dto.refund_currency === 'THB' && rate !== 10000n))
          throw new BadRequestException('Tỷ giá hoàn phải dương; BAHT là 1:1');
        const refund =
          amount === 0n
            ? 0n
            : this.fxPaid(
                dto.refund_amount,
                dto.refund_currency,
                dto.confirmed_fx_per_baht,
              );
        if (
          refund < units(before.min_refund_baht) ||
          refund > units(before.max_refund_baht)
        )
          throw new ConflictException(
            `Khoản hoàn phải từ ${before.min_refund_baht} đến ${before.max_refund_baht} BAHT; phần còn lại là hủy nợ chưa thu`,
          );
        const ledgerId = randomUUID();
        await c.query(
          "INSERT INTO customers_ledger(id,customer_id,business_date,occurred_at,transaction_type,gold_weight_g,labor_amount_due,labor_amount_paid,labor_currency,labor_payment_status,reference_type,reference_id,created_by,approval_status,approved_by,approved_at) VALUES($1,$2,$3,$4,'RETURN_GOODS',$5,0,0,'THB','PAID','GOODS_RETURN',$6,$7,'APPROVED',$8,clock_timestamp())",
          [
            ledgerId,
            root.customer_id,
            before.business_date,
            before.occurred_at,
            before.gold_weight_g,
            id,
            before.created_by,
            actor,
          ],
        );
        await c.query('UPDATE customers_ledger SET transaction_employee_id=$2 WHERE id=$1',[ledgerId,before.transaction_employee_id??null]);
        await c.query(
          "UPDATE ledger_goods_returns SET status='APPROVED',ledger_id=$2,approved_by=$3,approved_at=clock_timestamp() WHERE id=$1",
          [id, ledgerId, actor],
        );
        if (refund > 0n) {
          await this.assertCashDate(
            c,
            before.business_date instanceof Date
              ? before.business_date.toISOString().slice(0, 10)
              : before.business_date,
          );
          const record = (
            await c.query(
              'INSERT INTO ledger_refunds(return_id,amount_baht,amount,currency,confirmed_fx_per_baht,approved_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
              [
                id,
                toDecimal(refund),
                dto.refund_amount,
                dto.refund_currency,
                dto.confirmed_fx_per_baht,
                actor,
              ],
            )
          ).rows[0];
          await c.query(
            "INSERT INTO cash_transactions(direction,category_id,amount,currency,customer_id,business_date,occurred_at,created_by,refund_id,reference_type,reference_id) SELECT 'OUT',id,$1,$2,$3,$4,$5,$6,$7,'GOODS_RETURN',$8 FROM cash_categories WHERE code='CUSTOMER_LABOR_REFUND'",
            [
              dto.refund_amount,
              dto.refund_currency,
              root.customer_id,
              before.business_date,
              before.occurred_at,
              actor,
              record.id,
              id,
            ],
          );
        }
        await this.recalculate(before.source_ledger_id, c);
        return { before, data: await this.goodsReturn(id, c) };
  }
  async approveReturn(id: string, dto: ApproveReturnDto, actor: string) {
    const source = await this.goodsReturn(id);
    const root = await this.ledger(source.source_ledger_id);
    return this.tx(
      actor,
      ['customer_ledger.returns.manage', 'cash.refund.approve'],
      root.customer_id,
      'goods_return.approve',
      id,
      (c) => this.postReturnInTransaction(id,dto,actor,c,dto.version),
    );
  }
  async cash() {
    return {
      data: (
        await this.rbac.pool.query(
          'SELECT t.*,c.name category_name FROM cash_transactions t JOIN cash_categories c ON c.id=t.category_id ORDER BY t.created_at DESC',
        )
      ).rows,
    };
  }
  async periodReport(id: string, c: Db = this.rbac.pool): Promise<Row> {
    if (c === this.rbac.pool)
      return this.snapshot((client) => this.periodReport(id, client));
    const period = (
      await c.query('SELECT * FROM cash_report_periods WHERE id=$1', [id])
    ).rows[0];
    if (!period) throw new NotFoundException('Không tìm thấy kỳ báo cáo');
    const rows = (
      await c.query(
        'SELECT * FROM cash_transactions WHERE business_date BETWEEN $1 AND $2 ORDER BY occurred_at,id',
        [period.from_date, period.to_date],
      )
    ).rows;
    let incoming = 0n,
      outgoing = 0n;
    for (const row of rows) {
      const fx =
        row.currency === 'THB'
          ? '1'
          : row.currency === 'LAK'
            ? period.kip_per_baht
            : period.vnd_per_baht;
      if (!fx || units(fx) <= 0n)
        throw new ConflictException(
          'Kỳ báo cáo chưa có tỷ giá cho nguyên tệ phát sinh',
        );
      const baht = roundedDivide(units(row.amount) * 10000n, units(fx));
      if (row.direction === 'IN') incoming += baht;
      else outgoing += baht;
    }
    const data = {
      ...period,
      income_baht: toDecimal(incoming),
      expense_baht: toDecimal(outgoing),
      net_baht: toDecimal(incoming - outgoing),
      transactions: rows,
    };
    return { ...data, version: this.version(data) };
  }
  createPeriod(dto: CashPeriodDto, actor: string) {
    return this.tx(
      actor,
      ['cash.periods.manage'],
      null,
      'cash.period.create',
      null,
      async (c) => {
        if (dto.from_date > dto.to_date)
          throw new BadRequestException('Khoảng ngày không hợp lệ');
        if (
          (dto.kip_per_baht && units(dto.kip_per_baht) <= 0n) ||
          (dto.vnd_per_baht && units(dto.vnd_per_baht) <= 0n)
        )
          throw new BadRequestException('Tỷ giá kỳ phải dương');
        const row = (
          await c.query(
            'INSERT INTO cash_report_periods(name,from_date,to_date,kip_per_baht,vnd_per_baht) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [
              dto.name.trim(),
              dto.from_date,
              dto.to_date,
              dto.kip_per_baht ?? null,
              dto.vnd_per_baht ?? null,
            ],
          )
        ).rows[0];
        return { data: row };
      },
    );
  }
  async closePeriod(id: string, version: string, actor: string) {
    return this.tx(
      actor,
      ['cash.periods.manage'],
      null,
      'cash.period.close',
      id,
      async (c) => {
        const before = await this.periodReport(id, c);
        if (before.closed_at) return { data: before };
        this.rbac.checkVersion(version, before.version);
        await c.query(
          'UPDATE cash_report_periods SET closed_at=clock_timestamp(),closed_by=$2 WHERE id=$1',
          [id, actor],
        );
        return { before, data: await this.periodReport(id, c) };
      },
    );
  }
  async periods() {
    return {
      data: (
        await this.rbac.pool.query(
          'SELECT * FROM cash_report_periods ORDER BY from_date DESC',
        )
      ).rows.map((row) => ({ ...row, version: this.version(row) })),
    };
  }
  async periodFx(id: string, dto: CashPeriodFxDto, actor: string) {
    return this.tx(
      actor,
      ['cash.periods.manage'],
      null,
      'cash.period.fx',
      id,
      async (c) => {
        const before = (
          await c.query(
            'SELECT * FROM cash_report_periods WHERE id=$1 FOR UPDATE',
            [id],
          )
        ).rows[0];
        if (!before) throw new NotFoundException('Không tìm thấy kỳ');
        if (before.closed_at)
          throw new ConflictException('Không sửa tỷ giá kỳ đã chốt');
        this.rbac.checkVersion(dto.version, this.version(before));
        if (dto.kip_per_baht === undefined && dto.vnd_per_baht === undefined)
          throw new BadRequestException('Chưa nhập tỷ giá cần sửa');
        for (const value of [dto.kip_per_baht, dto.vnd_per_baht])
          if (value !== undefined && units(value) <= 0n)
            throw new BadRequestException('Tỷ giá kỳ phải dương');
        const row = (
          await c.query(
            'UPDATE cash_report_periods SET kip_per_baht=$2,vnd_per_baht=$3 WHERE id=$1 RETURNING *',
            [
              id,
              dto.kip_per_baht ?? before.kip_per_baht,
              dto.vnd_per_baht ?? before.vnd_per_baht,
            ],
          )
        ).rows[0];
        return { before, data: { ...row, version: this.version(row) } };
      },
    );
  }
}
