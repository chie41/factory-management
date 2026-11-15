import { BadRequestException, Injectable } from '@nestjs/common';
import { RbacService } from '../auth/rbac.service.js';
import { goldDeltaSql } from './gold-debt-rules.js';
import { toDecimal } from './ledger-decimal.js';

export type GoldDayMovement = {
  transaction_id: string; transaction_datetime: string; gold_amount: string;
};
export type GoldDayRow = {
  customer_id: string; customer_code: string; customer_name: string;
  opening_gold_g: string; delivered_g: string | null; received_g: string | null;
  adjustment_g: string; closing_gold_g: string; invalid_count: number;
  deliveries: GoldDayMovement[]; receipts: GoldDayMovement[];
};
function decimalBalance(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const amount = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
  return negative ? -amount : amount;
}
@Injectable()
export class MonthlyBalanceService {
  constructor(private readonly rbac: RbacService) {}

  async daily(date: string, scope: 'all' | 'debt') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)
      throw new BadRequestException('Ngày báo cáo không hợp lệ');
    const c = await this.rbac.pool.connect();
    try {
      // One statement also gives a consistent MVCC view of snapshots and movements.
      const result = await c.query<GoldDayRow>(`
        WITH bases AS (
          SELECT c.id customer_id,c.customer_code,c.name customer_name,
            j.pos display_order,c.created_at customer_created_at,
            s.period,coalesce(s.closing_gold_g,0) opening
          FROM public.customers c
          LEFT JOIN public.ledger_customer_layout layout ON layout.id=true
          LEFT JOIN LATERAL jsonb_array_elements(coalesce(layout.items,'[]'::jsonb))
            WITH ORDINALITY j(item,pos) ON j.item->>'id'=c.id::text
          LEFT JOIN LATERAL (
            SELECT period,closing_gold_g FROM customer_ledger_monthly_balances
            WHERE customer_id=c.id AND NOT is_dirty AND period<date_trunc('month',$1::date)::date
            ORDER BY period DESC LIMIT 1
          ) s ON true
          WHERE c.deleted_at IS NULL AND (
            (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $1::date
            OR EXISTS(SELECT 1 FROM customers_ledger h WHERE h.customer_id=c.id AND h.business_date<=$1::date)
          )
        ), movements AS (
          SELECT b.customer_id,l.id,l.occurred_at,l.business_date,l.transaction_type,${goldDeltaSql('l')} delta
          FROM bases b JOIN customers_ledger l ON l.customer_id=b.customer_id
            AND l.business_date<=$1::date
            AND (b.period IS NULL OR l.business_date >= (b.period+interval '1 month')::date)
        ), sums AS (
          SELECT customer_id,
            coalesce(sum(delta) FILTER(WHERE business_date<$1::date),0) before_day,
            coalesce(sum(delta) FILTER(WHERE business_date=$1::date AND transaction_type='OPENING_BALANCE'),0) adjustment,
            coalesce(sum(delta) FILTER(WHERE business_date=$1::date AND delta>0 AND transaction_type<>'OPENING_BALANCE'),0) delivered,
            coalesce(-sum(delta) FILTER(WHERE business_date=$1::date AND delta<0),0) received,
            coalesce(jsonb_agg(jsonb_build_object(
              'transaction_id',id,'transaction_datetime',occurred_at,'gold_amount',delta::text
            ) ORDER BY occurred_at,id) FILTER(WHERE business_date=$1::date AND delta>0 AND transaction_type<>'OPENING_BALANCE'),'[]'::jsonb) deliveries,
            coalesce(jsonb_agg(jsonb_build_object(
              'transaction_id',id,'transaction_datetime',occurred_at,'gold_amount',(-delta)::text
            ) ORDER BY occurred_at,id) FILTER(WHERE business_date=$1::date AND delta<0),'[]'::jsonb) receipts,
            count(*) FILTER(WHERE business_date=$1::date AND delta<>0) activity,
            count(*) FILTER(WHERE delta IS NULL)::int invalid_count
          FROM movements GROUP BY customer_id
        )
        SELECT b.customer_id,b.customer_code,b.customer_name,
          (b.opening+coalesce(s.before_day,0))::text opening_gold_g,
          CASE WHEN $1::date>(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND coalesce(s.activity,0)=0 THEN NULL ELSE coalesce(s.delivered,0)::text END delivered_g,
          CASE WHEN $1::date>(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND coalesce(s.activity,0)=0 THEN NULL ELSE coalesce(s.received,0)::text END received_g,
          coalesce(s.adjustment,0)::text adjustment_g,
          (b.opening+coalesce(s.before_day,0)+coalesce(s.delivered,0)-coalesce(s.received,0)+coalesce(s.adjustment,0))::text closing_gold_g,
          coalesce(s.invalid_count,0)::int invalid_count,
          coalesce(s.deliveries,'[]'::jsonb) deliveries,coalesce(s.receipts,'[]'::jsonb) receipts
        FROM bases b LEFT JOIN sums s ON s.customer_id=b.customer_id
        ORDER BY b.display_order NULLS LAST,b.customer_created_at,b.customer_id`, [date]);
      if (result.rows.some(r => r.invalid_count))
        throw new BadRequestException('Có loại giao dịch vàng chưa được cấu hình; không thể trả số dư chính xác');
      const rows = result.rows.filter(r => scope !== 'debt' || decimalBalance(r.closing_gold_g)>0n)
        .map(({ invalid_count: _invalid, ...row }) => row);
      const totals = { opening_gold_g: 0n, delivered_g: 0n, received_g: 0n, adjustment_g: 0n, closing_gold_g: 0n };
      for (const row of rows) for (const key of Object.keys(totals) as (keyof typeof totals)[])
        totals[key] += decimalBalance(row[key] ?? '0');
      const deliveryColumns: bigint[] = [], receiptColumns: bigint[] = [];
      let deliveryCount = 0, receiptCount = 0;
      for (const row of rows) {
        deliveryCount += row.deliveries.length;
        receiptCount += row.receipts.length;
        row.deliveries.forEach((item, index) => {
          deliveryColumns[index] = (deliveryColumns[index] ?? 0n) + decimalBalance(item.gold_amount);
        });
        row.receipts.forEach((item, index) => {
          receiptColumns[index] = (receiptColumns[index] ?? 0n) + decimalBalance(item.gold_amount);
        });
      }
      return { data: {
        date, scope, rows,
        column_counts: { deliveries: deliveryColumns.length, receipts: receiptColumns.length },
        totals: {
          ...Object.fromEntries(Object.entries(totals).map(([k,v]) => [k,toDecimal(v)])),
          delivery_columns_g: deliveryColumns.map(toDecimal), receipt_columns_g: receiptColumns.map(toDecimal),
          delivery_count: deliveryCount, receipt_count: receiptCount,
        },
      } };
    } finally { c.release(); }
  }

  /** Bounded, resumable maintenance. Never invoked by a report request. */
  async rebuildBatch(afterId?: string, batchSize = 100) {
    const c = await this.rbac.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SET LOCAL lock_timeout='2s'");
      await c.query("SET LOCAL statement_timeout='30s'");
      await c.query("SELECT pg_advisory_xact_lock(hashtext('factory:monthly-balances'))");
      // Lock BEFORE reading ledger/snapshots. Writers finish first, then cannot
      // alter inputs or invalidate while this bounded batch is being rebuilt.
      await c.query('LOCK TABLE customers_ledger IN SHARE MODE');
      const customers = (await c.query<{id: string}>(
        'SELECT id FROM customers WHERE ($1::uuid IS NULL OR id>$1::uuid) ORDER BY id LIMIT $2',
        [afterId ?? null, Math.max(1,Math.min(batchSize,250))],
      )).rows;
      if (!customers.length) { await c.query('COMMIT'); return { count: 0, snapshots: 0, cursor: null }; }
      const values = (await c.query<{customer_id: string; period: string; closing_gold_g: string; invalid_count: number}>(`
        WITH cutoff AS (
          SELECT (date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')-interval '1 month')::date period
        ), bases AS (
          SELECT c.id customer_id,coalesce(s.closing_gold_g,0) opening,
            coalesce((s.period+interval '1 month')::date,
              date_trunc('month', (SELECT min(business_date) FROM customers_ledger WHERE customer_id=c.id))::date,
              date_trunc('month',c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) start_period
          FROM customers c CROSS JOIN cutoff end_period
          LEFT JOIN LATERAL (
            SELECT period,closing_gold_g FROM customer_ledger_monthly_balances
            WHERE customer_id=c.id AND NOT is_dirty AND period<=end_period.period ORDER BY period DESC LIMIT 1
          ) s ON true
          WHERE c.id=ANY($1::uuid[])
        ), movements AS (
          SELECT b.customer_id,date_trunc('month',l.business_date)::date period,${goldDeltaSql('l')} delta
          FROM bases b JOIN customers_ledger l ON l.customer_id=b.customer_id
          CROSS JOIN cutoff e
          WHERE l.business_date>=b.start_period AND l.business_date<(e.period+interval '1 month')::date
        ), sums AS (
          SELECT customer_id,period,sum(delta) delta,count(*) FILTER(WHERE delta IS NULL)::int invalid_count
          FROM movements GROUP BY customer_id,period
        ), months AS (
          SELECT b.*,m.period::date FROM bases b CROSS JOIN cutoff e
          CROSS JOIN LATERAL generate_series(b.start_period,e.period,interval '1 month') m(period)
        )
        SELECT m.customer_id,m.period::text,
          (m.opening+sum(coalesce(s.delta,0)) OVER(PARTITION BY m.customer_id ORDER BY m.period))::text closing_gold_g,
          coalesce(s.invalid_count,0)::int invalid_count
        FROM months m LEFT JOIN sums s ON s.customer_id=m.customer_id AND s.period=m.period
        ORDER BY m.customer_id,m.period`, [customers.map(r=>r.id)])).rows;
      if (values.some(r=>r.invalid_count)) throw new BadRequestException('Có loại giao dịch vàng chưa được cấu hình; không tạo snapshot');
      if (values.length) await c.query(`
        INSERT INTO customer_ledger_monthly_balances(customer_id,period,closing_gold_g,calculated_at,is_dirty)
        SELECT customer_id,period,closing_gold_g,clock_timestamp(),false
        FROM jsonb_to_recordset($1::jsonb) AS v(customer_id uuid,period date,closing_gold_g numeric)
        ON CONFLICT(customer_id,period) DO UPDATE SET closing_gold_g=EXCLUDED.closing_gold_g,calculated_at=EXCLUDED.calculated_at,is_dirty=false`, [JSON.stringify(values)]);
      await c.query('COMMIT');
      return { count: customers.length, snapshots: values.length, cursor: customers.at(-1)!.id };
    } catch (error) { await c.query('ROLLBACK'); throw error; }
    finally { c.release(); }
  }
}
