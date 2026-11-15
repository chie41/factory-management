import type { LedgerLayoutService } from './ledger-layout.service.js';
import { describe, expect, it } from 'vitest';
import { CustomerLedgerService } from './customer-ledger.service.js';
import { QueryLedgerDto } from './dto/query-ledger.dto.js';
import type { RbacService } from '../auth/rbac.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const customers = [
  { id: 'a', customerCode: 'KH001', name: 'Alpha', status: 'ACTIVE', deletedAt: null },
  { id: 'b', customerCode: 'KH002', name: 'Beta', status: 'ACTIVE', deletedAt: null },
];
const entry = (id: string, customerId: string, date: string, type: string, weight: string, reversedAt: string | null = null) => ({ id, customerId, businessDate: date, occurredAt: `${date}T10:00:00Z`, transactionType: type, goldWeightG: weight, laborAmountDue: '0', laborAmountPaid: '0', laborCurrency: null, laborPaymentStatus: 'PAID', reversedAt });
const entries = [entry('1', 'a', '2026-01-01', 'DELIVERY', '10'), entry('2', 'a', '2026-01-02', 'RETURN_GOLD', '4'), entry('3', 'a', '2026-01-02', 'RETURN_GOODS', '1'), entry('4', 'a', '2026-01-03', 'DELIVERY', '99', '2026-01-03T11:00:00Z'), entry('5', 'b', '2026-01-02', 'RETURN_GOLD', '2')];
function collection(rows: object[]) {
  return {
    where(filter: unknown) {
      const selected = typeof filter === 'object' && filter ? rows.filter(row => Object.entries(filter).every(([key, value]) => (row as Record<string, unknown>)[key] === value)) : rows;
      return collection(selected);
    },
    all: async () => rows, first: async () => rows[0],
  };
}
const service = (ledgerRows = entries, layoutItems = customers.map(c => ({ id: c.id, is_visible_in_ledger: true }))) => {
 const db = { query: async (sql:string, params?:unknown[]) => {
  if(sql.includes('count(*)'))return {rows:[{count:0}],rowCount:1};
  if(sql.includes('SELECT id FROM customers '))return {rows:[{id:'a'}],rowCount:1};
  if(sql.includes('SELECT * FROM customers_ledger WHERE id='))return {rows:ledgerRows.filter(r=>r.id===params?.[0]).map(r=>({...r,reversed_at:r.reversedAt})),rowCount:1};
  return {rows:[],rowCount:0};
 },release(){} };
 const rbac={pool:{query:db.query,connect:async()=>db},require:async()=>{}} as unknown as RbacService;
 return new CustomerLedgerService({ db: { orm: { public: { Customer: collection(customers), CustomerLedger: collection(ledgerRows) } } } } as unknown as PrismaService,rbac, {read: async () => ({revision:'0',items:layoutItems})} as unknown as LedgerLayoutService);
};
const query = (values: Partial<QueryLedgerDto> = {}) => Object.assign(new QueryLedgerDto(), values);
describe('ledger read projections preserve accounting', () => {
  it('starts the book at the opening debt and carries it through all later balances', async () => {
    const rows = [entry('opening', 'a', '2025-12-31', 'OPENING_BALANCE', '520.70'), ...entries];
    const book = (await service(rows).findByCustomer('a', query())).data;
    expect(book.opening_gold_g).toBe('520.7000');
    expect(book.totals.gold_debt_balance_g).toBe('525.7000');
    expect(book.entries.some(row => row.id === 'opening')).toBe(false);
    expect(book.entries.find(row => row.id === '1')?.gold_debt_before_g).toBe('520.7000');
    expect(book.entries.find(row => row.id === '1')?.gold_debt_running_balance_g).toBe('530.7000');
    const filtered = (await service(rows).findByCustomer('a', query({ from: '2026-01-02' }))).data;
    expect(filtered.opening_gold_g).toBe('530.7000');
  });
  it('sorts globally before pagination and hides debt customers without changing statistics', async () => {
    const layout = [{id:'b',is_visible_in_ledger:true},{id:'a',is_visible_in_ledger:true}];
    expect((await service(entries,layout).summary(query({page_size:1}))).data[0].customer.id).toBe('b');
    expect((await service(entries,layout).summary(query({page:2,page_size:1}))).data[0].display_order).toBe(2);
    layout[1].is_visible_in_ledger=false;
    const hidden = await service(entries,layout).summary(query());
    expect(hidden.meta.total).toBe(1);
    expect(hidden.statistics.customers_with_gold_debt).toBe(1);
    expect((await service(entries,layout).findByCustomer('a',query())).data.totals.gold_debt_balance_g).toBe('5.0000');
  });
  it('preserves all five existing gold sign conventions', async () => {
    const rows = ['DELIVERY', 'GOLD_RETURN_TO_CUSTOMER', 'RETURN_GOLD', 'RETURN_GOODS', 'RETURN_RECOVERED_GOLD'].map((type, i) => entry(String(i), 'a', '2026-01-01', type, ['10', '1', '4', '2', '3'][i]));
    const result = await service(rows).findByCustomer('a', query());
    expect(result.data.totals.gold_debt_balance_g).toBe('2.0000');
    expect(result.data.entries.map(row => row.gold_debt_change_g)).toEqual(['10.0000', '1.0000', '-4.0000', '-2.0000', '-3.0000']);
  });
  it('rejects editing an already reversed transaction but permits permanent deletion', async () => {
    await expect(service().update('4', { note: 'changed' }, 'user')).rejects.toThrow('Không thể sửa giao dịch đã reverse');
    await expect(service().remove('4', 'user', { reason: 'again' })).resolves.toEqual({ data: { id: '4', deleted: true } });
  });
  it('keeps current balances separate from a filtered period and preserves reverse history', async () => {
    const result = await service().findByCustomer('a', query({ from: '2026-01-02', to: '2026-01-02', transaction_type: 'RETURN_GOLD', group_by_day: 'true' }));
    expect(result.data.totals.gold_debt_balance_g).toBe('5.0000');
    expect(result.data.period_totals.gold_debt_balance_g).toBe('-4.0000');
    expect(result.data.opening_gold_g).toBe('10.0000');
    expect(result.data.closing_gold_g).toBe('5.0000');
    expect(result.data.daily_summaries[0]).toMatchObject({ received_g: '4.0000', closing_gold_g: '5.0000' });
    expect(result.data.totals.reversed_entries).toBe(1);
  });
  it('paginates whole days, never splitting transactions of the same day', async () => {
    const result = await service().findByCustomer('a', query({ page: 2, page_size: 1, group_by_day: 'true' }));
    expect(result.data.entries.map(row => row.id)).toEqual(['2', '3']);
    expect(result.meta.total).toBe(3);
  });
  it('computes statistics before pagination and filters current debt without flipping signs', async () => {
    const result = await service().summary(query({ page_size: 1 }));
    expect(result.meta.total).toBe(2);
    expect(result.statistics.customers_with_transactions).toBe(2);
    expect(result.statistics.customers_with_gold_debt).toBe(1);
    const filtered = await service().summary(query({ debt: 'gold' }));
    expect(filtered.data.map(row => row.customer.id)).toEqual(['a']);
  });
  it('returns the correct before/change/after when detail is opened outside the current page', async () => {
    const result = await service().findOne('3');
    expect(result.data).toMatchObject({ gold_debt_before_g: '6.0000', gold_debt_change_g: '-1.0000', gold_debt_running_balance_g: '5.0000' });
  });
});
