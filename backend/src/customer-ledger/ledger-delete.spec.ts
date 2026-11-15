import { describe, expect, it, vi } from 'vitest';
import { CustomerLedgerService } from './customer-ledger.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RbacService } from '../auth/rbac.service.js';
import type { LedgerLayoutService } from './ledger-layout.service.js';

function fixture(linked = false, failDelete = false) {
  const original = { id: 'entry', customer_id: 'customer', reference_type: 'MANUAL_DELIVERY', reference_id: null, labor_amount_due: '100', labor_amount_paid: '50', reversed_at: null };
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT * FROM customers_ledger')) return { rows: [original], rowCount: 1 };
    if (sql.startsWith('SELECT id FROM customers')) return { rows: [{ id: 'customer' }], rowCount: 1 };
    if (sql.includes('SELECT 1 FROM ledger_payments')) return { rows: linked ? [{ id: 'payment' }] : [], rowCount: linked ? 1 : 0 };
    if (sql.startsWith('DELETE FROM customers_ledger') && failDelete) throw Object.assign(new Error('foreign key'), { code: '23503' });
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  const service = new CustomerLedgerService({} as PrismaService, {
    pool: { connect: async () => ({ query, release }) }, require: vi.fn(),
  } as unknown as RbacService, {} as LedgerLayoutService);
  vi.spyOn(service as unknown as { entryOrFail: (id: string) => Promise<object> }, 'entryOrFail').mockResolvedValue({ customerId: 'customer' });
  return { service, query, release };
}

describe('permanent ledger deletion', () => {
  it('deletes a manual entry with labor amounts and its own rows in one transaction', async () => {
    const { service, query, release } = fixture();
    await expect(service.remove('entry', 'actor', { reason: 'Incorrect entry' })).resolves.toEqual({ data: { id: 'entry', deleted: true } });
    const sql = query.mock.calls.map(call => call[0]);
    expect(sql.filter(s => s.startsWith('DELETE'))).toEqual([
      'DELETE FROM ledger_delivery_submissions WHERE ledger_id=$1',
      'DELETE FROM order_items WHERE ledger_id=$1',
      'DELETE FROM customers_ledger WHERE id=$1',
    ]);
    expect(sql.some(s => s.startsWith('UPDATE customers_ledger'))).toBe(false);
    expect(sql.at(-1)).toBe('COMMIT');
    expect(release).toHaveBeenCalled();
  });
  it('does not delete anything while a payment or return is linked', async () => {
    const { service, query } = fixture(true);
    await expect(service.remove('entry', 'actor', { reason: 'Incorrect entry' })).rejects.toThrow('phiếu thu hoặc trả hàng');
    expect(query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });
  it('rolls back all dependent deletes if a foreign key still references the entry', async () => {
    const { service, query, release } = fixture(false, true);
    await expect(service.remove('entry', 'actor', { reason: 'Incorrect entry' })).rejects.toThrow('còn dữ liệu liên kết');
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(release).toHaveBeenCalled();
  });
});
