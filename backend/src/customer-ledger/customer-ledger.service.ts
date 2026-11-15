import { LedgerLayoutService } from './ledger-layout.service.js';
import { signedGoldUnits } from './gold-debt-rules.js';
import type { PoolClient } from 'pg';
import { RbacService } from '../auth/rbac.service.js';
import { units, toDecimal, recoveredGold } from './ledger-decimal.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateLedgerEntryDto } from './dto/create-ledger-entry.dto.js';

import { UpdateLedgerEntryDto } from './dto/update-ledger-entry.dto.js';

import { QueryLedgerDto } from './dto/query-ledger.dto.js';

import { ReverseLedgerEntryDto } from './dto/reverse-ledger-entry.dto.js';

function checkedDate(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(
      'business_date phải là ngày hợp lệ YYYY-MM-DD',
    );
  }

  return value;
}

function checkedTimestamp(value: string): string {
  // Require timezone to avoid the server silently interpreting local time.

  if (
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new BadRequestException('occurred_at phải là ISO 8601 có múi giờ');
  }

  return new Date(value).toISOString();
}

@Injectable()
export class CustomerLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly layout: LedgerLayoutService,
  ) {}

  private async customerOrFail(customerId: string) {
    const customer = await this.prisma.db.orm.public.Customer.where({
      id: customerId,
    })
      .where((c) => c.deletedAt.isNull())
      .first();

    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');

    return customer;
  }

  private async withActors<
    T extends {
      id?: unknown;
      createdBy?: unknown;
      referenceType?: unknown;
      referenceId?: unknown;
    },
  >(entries: T[]) {
    const ids = [...new Set(entries.map((e) => e.createdBy).filter(Boolean))];
    const names = ids.length
      ? (
          await this.rbac.pool.query<{ id: string; name: string }>(
            'SELECT u.id,coalesce(e.full_name,u.username) name FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=ANY($1::uuid[])',
            [ids],
          )
        ).rows
      : [];
    const refs = entries
      .filter((e) => e.referenceType === 'ORDER_DELIVERY')
      .map((e) => e.referenceId)
      .filter(Boolean);
    const orders = refs.length
      ? (
          await this.rbac.pool.query<{ id: string; order_code: string }>(
            'SELECT id,order_code FROM orders WHERE id=ANY($1::uuid[])',
            [refs],
          )
        ).rows
      : [];
    const actual = entries.length ? (await this.rbac.pool.query<{id:string;employee_id:string;name:string}>('SELECT l.id,e.id employee_id,e.full_name name FROM customers_ledger l JOIN employees e ON e.id=l.transaction_employee_id WHERE l.id=ANY($1::uuid[])',[entries.map(e=>e.id)])).rows : [];
    const products = entries.length ? (await this.rbac.pool.query<{ledger_id:string;name:string;quantity:number;unit_weight_g:string;total_weight_g:string;labor_price_per_15g:string|null;line_labor_amount:string|null}>("SELECT s.ledger_id,i.item_name name,i.quantity,i.unit_weight_g,i.labor_price_per_15g::text labor_price_per_15g,i.line_labor_amount::text line_labor_amount,(i.quantity*i.unit_weight_g)::numeric(20,4)::text total_weight_g FROM ledger_delivery_submissions s JOIN order_items i ON (i.ledger_id=s.ledger_id AND i.superseded_at IS NULL) OR i.order_id=s.order_id WHERE s.ledger_id=ANY($1::uuid[]) ORDER BY i.id",[entries.map(e=>e.id)])).rows : [];
    return entries.map((entry) => ({
      ...entry,
      actor_name: actual.find(n=>n.id===entry.id)?.name ?? names.find((n) => n.id === entry.createdBy)?.name,
      created_by_name: names.find((n) => n.id === entry.createdBy)?.name,
      transaction_employee_id: actual.find(n=>n.id===entry.id)?.employee_id,
      products: products.filter(p=>p.ledger_id===entry.id),
      reference_code: orders.find((o) => o.id === entry.referenceId)
        ?.order_code,
    }));
  }
  private async entryOrFail(id: string) {
    const entry = await this.prisma.db.orm.public.CustomerLedger.where({
      id,
    }).first();

    if (!entry) throw new NotFoundException('Không tìm thấy giao dịch');

    return entry;
  }

  /** Tổng hợp nợ vàng theo chiều +/- đã được xác nhận. */

  private calculateTotals(
    entries: Array<{
      transactionType: unknown;

      goldWeightG: unknown;

      laborAmountDue: unknown;

      laborAmountPaid: unknown;

      laborCurrency: unknown;

      reversedAt: unknown;
      approvalStatus?: unknown;
    }>,
  ) {
    const goldByType = new Map<string, bigint>();

    const laborByCurrency = new Map<string, { due: bigint; paid: bigint }>();

    let reversedCount = 0,
      activeCount = 0;
    let goldDebtBalance = BigInt(0),
      pendingGold = 0n,
      approvedGold = 0n,
      legacyGold = 0n;

    for (const e of entries) {
      if (e.reversedAt !== null && e.reversedAt !== undefined) {
        reversedCount++;
        continue;
      }

      if (e.approvalStatus === 'INCORRECT') continue;
      activeCount++;

      const type = String(e.transactionType);

      const delta = signedGoldUnits(e);
      goldDebtBalance += delta;
      if (e.approvalStatus === 'PENDING') pendingGold += delta;
      else if (e.approvalStatus === 'LEGACY' || !e.approvalStatus)
        legacyGold += delta;
      else approvedGold += delta;
      goldByType.set(
        type,
        (goldByType.get(type) ?? BigInt(0)) + units(String(e.goldWeightG)),
      );

      const due = units(String(e.laborAmountDue)),
        paid = units(String(e.laborAmountPaid));

      if (due !== BigInt(0) || paid !== BigInt(0)) {
        const currency = e.laborCurrency
          ? String(e.laborCurrency).trim()
          : 'UNSPECIFIED';

        const row = laborByCurrency.get(currency) ?? {
          due: BigInt(0),
          paid: BigInt(0),
        };

        row.due += due;

        row.paid += paid;

        laborByCurrency.set(currency, row);
      }
    }

    const goldTotals: Record<string, string> = {};
    goldByType.forEach((value, key) => {
      goldTotals[key] = toDecimal(value);
    });

    const laborTotals: Record<
      string,
      {
        due: string;
        paid: string;
        outstanding: string;
      }
    > = {};
    laborByCurrency.forEach((value, key) => {
      laborTotals[key] = {
        due: toDecimal(value.due),
        paid: toDecimal(value.paid),
        outstanding: toDecimal(value.due - value.paid),
      };
    });

    return {
      active_entries: activeCount,
      reversed_entries: reversedCount,
      gold_weight_by_transaction_type: goldTotals,
      labor_by_currency: laborTotals,
      gold_debt_balance_g: toDecimal(goldDebtBalance),
      gold_debt_official_g: toDecimal(goldDebtBalance),
      gold_debt_pending_g: toDecimal(pendingGold),
      gold_debt_approved_g: toDecimal(approvedGold),
      gold_debt_legacy_g: toDecimal(legacyGold),
      official_includes_pending: true,
    };
  }

  private matchesEntry(
    entry: {
      businessDate: unknown;
      transactionType: unknown;
      reversedAt: unknown;
      approvalStatus?: unknown;
      laborPaymentStatus: unknown;
      laborCurrency: unknown;
    },
    query: QueryLedgerDto,
  ) {
    if (query.from && query.to && query.from > query.to)
      throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    return (
      (!query.from || String(entry.businessDate) >= query.from) &&
      (!query.to || String(entry.businessDate) <= query.to) &&
      (!query.transaction_type ||
        String(entry.transactionType) === query.transaction_type) &&
      (!query.labor_status ||
        String(entry.laborPaymentStatus) === query.labor_status) &&
      (!query.currency ||
        String(entry.laborCurrency).trim() === query.currency) &&
      (!query.reversed ||
        query.reversed === 'all' ||
        (query.reversed === 'reversed'
          ? !!entry.reversedAt
          : !entry.reversedAt))
    );
  }

  async summary(query: QueryLedgerDto) {
    if (query.from && query.to && query.from > query.to)
      throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    const [customers, entries, sourceOrders] = await Promise.all([
      this.prisma.db.orm.public.Customer.where((c) =>
        c.deletedAt.isNull(),
      ).all(),
      this.prisma.db.orm.public.CustomerLedger.all(),
      this.rbac.pool.query<{
        id: string;
        customer_id: string;
        order_code: string;
        status: string;
      }>(
        'SELECT id,customer_id,order_code,status FROM orders WHERE deleted_at IS NULL',
      ),
    ]);
    const groups = new Map<string, typeof entries>();
    for (const entry of entries) {
      const id = String(entry.customerId);
      const bucket = groups.get(id) ?? [];
      bucket.push(entry);
      groups.set(id, bucket);
    }
    const term = query.q?.trim().toLocaleLowerCase() ?? '';
    const rows = customers
      .filter(
        (c) =>
          !term ||
          String(c.customerCode).toLocaleLowerCase().includes(term) ||
          String(c.name).toLocaleLowerCase().includes(term),
      )
      .filter((c) => !query.status || String(c.status) === query.status)
      .map((c) => {
        const all = groups.get(String(c.id)) ?? [];
        const period = all.filter((e) => this.matchesEntry(e, query));
        const totals = this.calculateTotals(all);
        const goldDebt =
          BigInt(totals.gold_debt_balance_g.replace('.', '')) > 0n;
        const laborDebt = Object.values(totals.labor_by_currency).some(
          (v) => units(v.outstanding) > 0n,
        );
        const latest = [...all].sort((a, b) =>
          String(b.occurredAt).localeCompare(String(a.occurredAt)),
        )[0];
        const delivery = [...all]
          .filter(
            (e) =>
              String(e.transactionType) === 'DELIVERY' &&
              !e.reversedAt &&
              e.approvalStatus !== 'INCORRECT',
          )
          .sort((a, b) =>
            String(b.occurredAt).localeCompare(String(a.occurredAt)),
          )[0];
        return {
          customer: {
            id: c.id,
            customer_code: c.customerCode,
            name: c.name,
            phone: c.phone,
            address: c.address,
            status: c.status,
          },
          totals,
          period_totals: this.calculateTotals(period),
          has_gold_debt: goldDebt,
          has_labor_debt: laborDebt,
          latest_transaction_at: latest?.occurredAt ?? null,
          latest_delivery: delivery
            ? {
                entry_id: delivery.id,
                reference_id: delivery.referenceId,
                reference_code: sourceOrders.rows.find(
                  (o) => o.id === delivery.referenceId,
                )?.order_code,
                occurred_at: delivery.occurredAt,
              }
            : null,
          pending_orders: sourceOrders.rows.filter(
            (o) =>
              o.customer_id === String(c.id) &&
              !['COMPLETED', 'CANCELLED'].includes(o.status),
          ).length,
          period_entry_count: period.length,
          today_transactions: period.filter(
            (e) =>
              !e.reversedAt &&
              e.approvalStatus !== 'INCORRECT' &&
              String(e.businessDate) ===
                new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                }).format(new Date()),
          ).length,
        };
      })
      .filter((row) => {
        const scope = query.customer_scope ?? 'with_transactions';
        if (scope === 'with_transactions' && !row.period_entry_count)
          return false;
        if (scope === 'without_transactions' && row.period_entry_count)
          return false;
        if (query.debt === 'gold') return row.has_gold_debt;
        if (query.debt === 'labor') return row.has_labor_debt;
        if (query.debt === 'debt')
          return row.has_gold_debt || row.has_labor_debt;
        if (query.debt === 'clear')
          return !row.has_gold_debt && !row.has_labor_debt;
        return true;
      });
    const layout = await this.layout.read();
    const positions = new Map(layout.items.map((item, index) => [item.id, { ...item, display_order: index + 1 }]));
    const visibleRows = rows.filter(row => positions.get(String(row.customer.id))?.is_visible_in_ledger !== false)
      .map(row => ({ ...row, display_order: positions.get(String(row.customer.id))?.display_order ?? 0 }))
      .sort((a,b) => a.display_order - b.display_order);
    const start = (query.page - 1) * query.page_size;
    return {
      data: visibleRows.slice(start, start + query.page_size),
      statistics: {
        customers_with_transactions: rows.filter(
          (r) => r.period_entry_count > 0,
        ).length,
        customers_with_labor_debt: rows.filter((r) => r.has_labor_debt).length,
        customers_with_gold_debt: rows.filter((r) => r.has_gold_debt).length,
        today_transactions: rows.reduce(
          (sum, r) => sum + r.today_transactions,
          0,
        ),
      },
      meta: {
        page: query.page,
        page_size: query.page_size,
        total: visibleRows.length,
        total_pages: Math.ceil(visibleRows.length / query.page_size),
      },
    };
  }

  async findByCustomer(customerId: string, query: QueryLedgerDto) {
    if (query.from && query.to && query.from > query.to)
      throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    const customer = await this.customerOrFail(customerId);
    const entries = await this.withActors(
      await this.prisma.db.orm.public.CustomerLedger.where({
        customerId,
      }).all(),
    );
    const chronological = [...entries].sort(
      (a, b) =>
        String(a.businessDate).localeCompare(String(b.businessDate)) ||
        String(a.occurredAt).localeCompare(String(b.occurredAt)) ||
        String(a.id).localeCompare(String(b.id)),
    );
    let balance = 0n;
    const enriched = chronological.map((entry) => {
      const before = balance,
        delta = signedGoldUnits(entry);
      balance += delta;
      return {
        ...entry,
        gold_debt_before_g: toDecimal(before),
        gold_debt_change_g: toDecimal(delta),
        gold_debt_running_balance_g: toDecimal(balance),
      };
    });
    const selected = enriched.filter(
      (e) =>
        e.transactionType !== 'OPENING_BALANCE' &&
        this.matchesEntry(e, query) &&
        (!query.q ||
          [e.referenceId, e.description, e.note].some((value) =>
            String(value ?? '')
              .toLocaleLowerCase()
              .includes(query.q!.trim().toLocaleLowerCase()),
          )),
    );
    const dates = [...new Set(selected.map((e) => String(e.businessDate)))];
    const daily = dates.map((date) => {
      const day = selected.filter((e) => String(e.businessDate) === date);
      const completeDay = enriched.filter(
        (e) => String(e.businessDate) === date,
      );
      let received = 0n,
        delivered = 0n;
      for (const e of day) {
        const delta = signedGoldUnits(e);
        if (delta < 0n) received -= delta;
        else delivered += delta;
      }
      return {
        date,
        transaction_count: day.length,
        received_g: toDecimal(received),
        delivered_g: toDecimal(delivered),
        closing_gold_g:
          completeDay.at(-1)?.gold_debt_running_balance_g ?? '0.0000',
        totals: this.calculateTotals(day),
      };
    });
    const start = (query.page - 1) * query.page_size;
    const pageDates = dates.slice(start, start + query.page_size);
    const pageEntries =
      query.group_by_day === 'true'
        ? selected.filter((e) => pageDates.includes(String(e.businessDate)))
        : selected.slice(start, start + query.page_size);
    const total =
      query.group_by_day === 'true' ? dates.length : selected.length;
    const pendingCount = (
      await this.rbac.pool.query<{ count: number }>(
        "SELECT count(*)::int count FROM orders WHERE customer_id=$1 AND deleted_at IS NULL AND status NOT IN ('COMPLETED','CANCELLED')",
        [customerId],
      )
    ).rows[0]!.count;
    const latest = chronological.at(-1);
    const opening = query.from
      ? (enriched.filter((e) => String(e.businessDate) < query.from!).at(-1)
          ?.gold_debt_running_balance_g ?? '0.0000')
      : toDecimal(chronological.filter(e => e.transactionType === 'OPENING_BALANCE').reduce((sum, e) => sum + signedGoldUnits(e), 0n));
    const closing = query.to
      ? (enriched.filter((e) => String(e.businessDate) <= query.to!).at(-1)
          ?.gold_debt_running_balance_g ?? '0.0000')
      : toDecimal(balance);
    return {
      data: {
        customer: {
          id: customer.id,
          customer_code: customer.customerCode,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          status: customer.status,
        },
        totals: this.calculateTotals(chronological),
        period_totals: this.calculateTotals(selected),
        opening_gold_g: opening,
        closing_gold_g: closing,
        latest_transaction_at: latest?.occurredAt ?? null,
        pending_orders: pendingCount,
        entries: pageEntries,
        daily_summaries: daily.filter((d) =>
          pageEntries.some((e) => String(e.businessDate) === d.date),
        ),
      },
      meta: {
        page: query.page,
        page_size: query.page_size,
        total,
        total_pages: Math.ceil(total / query.page_size),
      },
    };
  }

  async findOne(id: string) {
    const [entry] = await this.withActors([await this.entryOrFail(id)]);
    await this.customerOrFail(String(entry.customerId));
    const entries = await this.prisma.db.orm.public.CustomerLedger.where({
      customerId: entry.customerId,
    }).all();
    const chronological = [...entries].sort(
      (a, b) =>
        String(a.businessDate).localeCompare(String(b.businessDate)) ||
        String(a.occurredAt).localeCompare(String(b.occurredAt)) ||
        String(a.id).localeCompare(String(b.id)),
    );
    let balance = 0n;
    for (const row of chronological) {
      const before = balance,
        delta = signedGoldUnits(row);
      balance += delta;
      if (String(row.id) === id)
        return {
          data: {
            ...entry,
            gold_debt_before_g: toDecimal(before),
            gold_debt_change_g: toDecimal(delta),
            gold_debt_running_balance_g: toDecimal(balance),
          },
        };
    }
    return { data: entry };
  }

  private present(row: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_match, letter: string) =>
          letter.toUpperCase(),
        ),
        value instanceof Date
          ? key === 'business_date'
            ? value.toISOString().slice(0, 10)
            : value.toISOString()
          : value,
      ]),
    );
  }
  private async writeEntry<T extends Record<string, unknown>>(
    customerId: string,
    actor: string,
    permission: string,
    id: string | null,
    action: string,
    change: (c: PoolClient) => Promise<T>,
  ) {
    const c = await this.rbac.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('factory:ledger:' || $1::text))",
        [customerId],
      );
      await this.rbac.require(actor, [permission], c);
      if (
        !(
          await c.query(
            'SELECT id FROM customers WHERE id=$1 AND deleted_at IS NULL FOR SHARE',
            [customerId],
          )
        ).rowCount
      )
        throw new NotFoundException('Không tìm thấy khách hàng');
      const before = id
        ? (
            await c.query(
              'SELECT * FROM customers_ledger WHERE id=$1 FOR UPDATE',
              [id],
            )
          ).rows[0]
        : null;
      const after = await change(c);
      await c.query(
        'INSERT INTO security_audit(actor_id,target_id,action,before_state,after_state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',
        [
          actor,
          id ?? after.id,
          action,
          JSON.stringify(before),
          JSON.stringify(after),
        ],
      );
      await c.query('COMMIT');
      return { data: this.present(after) };
    } catch (error) {
      await c.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'Mã yêu cầu đã được sử dụng; không ghi nhận giao dịch trùng',
        );
      if ((error as { code?: string }).code === '23503')
        throw new ConflictException(
          'Giao dịch còn dữ liệu liên kết; cần xử lý chứng từ liên quan trước khi xóa.',
        );
      if (['23514', '22003'].includes((error as { code?: string }).code ?? ''))
        throw new BadRequestException(
          'Trọng lượng, tuổi vàng hoặc dữ liệu quy đổi không hợp lệ',
        );
      throw error;
    } finally {
      c.release();
    }
  }
  private goldInput(
    type: string,
    weight: string | undefined,
    actual?: string | null,
    purity?: string | null,
  ) {
    if (type === 'RETURN_RECOVERED_GOLD') {
      if (!actual || !purity)
        throw new BadRequestException(
          'Vàng hồi cần trọng lượng thực tế và tuổi vàng (%)',
        );
      const result = recoveredGold(actual, purity);
      if (weight !== undefined && units(weight) !== units(result.gold))
        throw new BadRequestException(
          'Vàng quy đổi phải do backend tính từ trọng lượng thực tế × tuổi vàng / 100',
        );
      return {
        weight: result.gold,
        actual: toDecimal(units(actual)),
        purity: toDecimal(units(purity)),
        exact: result.exact,
      };
    }
    if (actual != null || purity != null)
      throw new BadRequestException(
        'Trọng lượng thực tế / tuổi vàng chỉ dành cho vàng hồi',
      );
    if (weight === undefined || units(weight) <= 0n)
      throw new BadRequestException('Trọng lượng vàng phải lớn hơn 0');
    return {
      weight: toDecimal(units(weight)),
      actual: null,
      purity: null,
      exact: null,
    };
  }
  async create(customerId: string, dto: CreateLedgerEntryDto, actor: string) {
    if (['DELIVERY', 'RETURN_GOODS'].includes(dto.transaction_type))
      throw new ConflictException(
        'Cần đơn hàng và dòng hàng nguồn. Dùng luồng chọn đơn hàng nguồn; không nhập tay thay cho dữ liệu đơn.',
      );
    if (
      units(dto.labor_amount_due ?? '0') !== 0n ||
      units(dto.labor_amount_paid ?? '0') !== 0n
    )
      throw new ConflictException(
        'Tiền công phải lấy từ đơn hàng và các lần thu đã duyệt; không được ghi tổng tiền thủ công.',
      );
    if (dto.labor_currency && dto.labor_currency !== 'THB')
      throw new BadRequestException(
        'Tiền công hạch toán theo BAHT (THB); nguyên tệ thuộc từng lần thu riêng.',
      );
    if (
      dto.reference_id ||
      (dto.reference_type && dto.reference_type !== 'MANUAL')
    )
      throw new ConflictException(
        'Chưa có nguồn nghiệp vụ để xác thực tham chiếu này.',
      );
    const gold = this.goldInput(
      dto.transaction_type,
      dto.gold_weight_g,
      dto.actual_weight_g,
      dto.purity_percent,
    );
    const date = checkedDate(dto.business_date),
      occurred = checkedTimestamp(dto.occurred_at);
    return this.writeEntry(
      customerId,
      actor,
      'customer_ledger.create',
      null,
      'ledger.create',
      async (c) => {
        if (dto.request_id) {
          const original = (
            await c.query(
              'SELECT * FROM customers_ledger WHERE request_id=$1',
              [dto.request_id],
            )
          ).rows[0];
          if (original) {
            const equal =
              original.customer_id === customerId &&
              original.created_by === actor &&
              original.transaction_type === dto.transaction_type &&
              String(original.gold_weight_g) === gold.weight &&
              String(original.actual_weight_g ?? '') ===
                String(gold.actual ?? '') &&
              String(original.purity_percent ?? '') ===
                String(gold.purity ?? '') &&
              new Date(original.occurred_at).toISOString() === occurred &&
              this.present(original).businessDate === date &&
              (original.description ?? null) === (dto.description ?? null) &&
              (original.note ?? null) === (dto.note ?? null);
            if (!equal)
              throw new ConflictException(
                'Mã yêu cầu đã thuộc về một nội dung khác',
              );
            return original;
          }
        }
        const { rows } = await c.query(
          `INSERT INTO customers_ledger(id,customer_id,business_date,occurred_at,transaction_type,gold_weight_g,actual_weight_g,purity_percent,recovered_exact_gold_g,labor_amount_due,labor_amount_paid,labor_currency,labor_payment_status,reference_type,description,note,created_by,request_id,approval_status)
       VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,0,0,'THB','PAID','MANUAL',$9,$10,$11,$12,'RECORDED') RETURNING *`,
          [
            customerId,
            date,
            occurred,
            dto.transaction_type,
            gold.weight,
            gold.actual,
            gold.purity,
            gold.exact,
            dto.description ?? null,
            dto.note ?? null,
            actor,
            dto.request_id ?? null,
          ],
        );
        return rows[0];
      },
    );
  }
  async update(id: string, dto: UpdateLedgerEntryDto, actor: string) {
    const entry = await this.entryOrFail(id);
    return this.writeEntry(
      String(entry.customerId),
      actor,
      'customer_ledger.update',
      id,
      'ledger.update',
      async (c) => {
        const original = (
          await c.query(
            'SELECT * FROM customers_ledger WHERE id=$1 FOR UPDATE',
            [id],
          )
        ).rows[0];
        if (!original) throw new NotFoundException('Không tìm thấy giao dịch');
        if (original.reversed_at)
          throw new ConflictException('Không thể sửa giao dịch đã reverse');
        if (
          ['ORDER_DELIVERY', 'MANUAL_DELIVERY', 'GOODS_RETURN'].includes(original.reference_type)
        )
          throw new ConflictException(
            'Chứng từ nguồn phải sửa / đối soát qua luồng đơn hàng, thanh toán hoặc trả hàng.',
          );
        if (dto.request_id !== undefined)
          throw new BadRequestException('Mã yêu cầu tạo là bất biến');
        if (
          dto.transaction_type !== undefined &&
          dto.transaction_type !== original.transaction_type
        )
          throw new ConflictException(
            'Không đổi loại nghiệp vụ sau khi đã ghi sổ; cần nghiệp vụ điều chỉnh có truy vết.',
          );
        const checks: { [key: string]: unknown } = {
          labor_amount_due: dto.labor_amount_due,
          labor_amount_paid: dto.labor_amount_paid,
          labor_currency: dto.labor_currency,
          labor_payment_status: dto.labor_payment_status,
          reference_type: dto.reference_type,
          reference_id: dto.reference_id,
        };
        for (const [key, value] of Object.entries(checks))
          if (
            value !== undefined &&
            (key.startsWith('labor_amount_')
              ? units(String(value)) !== units(String(original[key]))
              : String(value ?? '') !== String(original[key] ?? '').trim())
          )
            throw new ConflictException(
              'Không sửa tổng tiền công, khoản đã thu hoặc nguồn chứng từ bằng tay. Cần đối soát dữ liệu cũ và luồng đơn hàng/thanh toán.',
            );
        const sourceBased = ['DELIVERY', 'RETURN_GOODS'].includes(
          original.transaction_type,
        );
        const weightChanged =
          dto.gold_weight_g !== undefined &&
          units(dto.gold_weight_g) !== units(String(original.gold_weight_g));
        if (
          sourceBased &&
          (weightChanged ||
            dto.actual_weight_g !== undefined ||
            dto.purity_percent !== undefined ||
            dto.business_date !== undefined ||
            dto.occurred_at !== undefined)
        )
          throw new ConflictException(
            'Chứng từ giao/trả hàng cần được sửa tại nguồn đơn hàng; hiện chỉ cho sửa ghi chú/mô tả dữ liệu cũ.',
          );
        let gold = {
          weight: String(original.gold_weight_g),
          actual: original.actual_weight_g,
          purity: original.purity_percent,
          exact: original.recovered_exact_gold_g,
        };
        if (
          weightChanged ||
          dto.actual_weight_g !== undefined ||
          dto.purity_percent !== undefined
        )
          gold = this.goldInput(
            original.transaction_type,
            dto.gold_weight_g ??
              (original.transaction_type === 'RETURN_RECOVERED_GOLD'
                ? undefined
                : String(original.gold_weight_g)),
            dto.actual_weight_g ?? original.actual_weight_g,
            dto.purity_percent ?? original.purity_percent,
          );
        const { rows } = await c.query(
          `UPDATE customers_ledger SET business_date=$2,occurred_at=$3,gold_weight_g=$4,actual_weight_g=$5,purity_percent=$6,recovered_exact_gold_g=$7,description=$8,note=$9,updated_by=$10,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
          [
            id,
            dto.business_date !== undefined
              ? checkedDate(dto.business_date)
              : original.business_date,
            dto.occurred_at !== undefined
              ? checkedTimestamp(dto.occurred_at)
              : original.occurred_at,
            gold.weight,
            gold.actual,
            gold.purity,
            gold.exact,
            dto.description ?? original.description,
            dto.note ?? original.note,
            actor,
          ],
        );
        return rows[0];
      },
    );
  }
  async remove(id: string, actor: string, dto: ReverseLedgerEntryDto) {
    const entry = await this.entryOrFail(id);
    return this.writeEntry(
      String(entry.customerId),
      actor,
      'customer_ledger.reverse',
      id,
      'ledger.delete',
      async (c) => {
        const original = (
          await c.query(
            'SELECT * FROM customers_ledger WHERE id=$1 FOR UPDATE',
            [id],
          )
        ).rows[0];
        if (!original) throw new NotFoundException('Không tìm thấy giao dịch');
        if (
          original.reference_id &&
          ['ORDER_DELIVERY', 'MANUAL_DELIVERY', 'GOODS_RETURN'].includes(original.reference_type)
        )
          throw new ConflictException(
            'Không reverse riêng chứng từ đã liên kết tiền / hàng; dùng nghiệp vụ đối soát hoặc trả hàng.',
          );
        const linked = await c.query(
          `SELECT 1 FROM ledger_payments WHERE ledger_id=$1
           UNION ALL
           SELECT 1 FROM ledger_goods_returns WHERE source_ledger_id=$1 OR ledger_id=$1
           LIMIT 1`,
          [id],
        );
        if (linked.rowCount)
          throw new ConflictException(
            'Giao dịch còn phiếu thu hoặc trả hàng liên kết; cần xử lý chứng từ liên quan trước khi xóa.',
          );
        await c.query('DELETE FROM ledger_delivery_submissions WHERE ledger_id=$1', [id]);
        await c.query('DELETE FROM order_items WHERE ledger_id=$1', [id]);
        await c.query('DELETE FROM customers_ledger WHERE id=$1', [id]);
        await c.query(
          'INSERT INTO security_audit(actor_id,target_id,action,before_state,after_state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',
          [
            actor,
            id,
            'ledger.delete_reason',
            null,
            JSON.stringify({ reason: dto.reason?.trim() ?? null }),
          ],
        );
        return { id, deleted: true };
      },
    );
  }
}
