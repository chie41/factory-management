import { describe, it, expect } from 'vitest';
import { deliveryTotals, foldSearch } from './quick-entry.service.js';
import { recoveredGold } from '../ledger-decimal.js';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { QuickBatchDto, type QuickEntryDto } from './quick-entry.dto.js';
const draft = (patch: Partial<QuickEntryDto> = {}): QuickEntryDto => ({
  request_id: 'de4b54fe-5852-45c5-87f9-2bf7a5f10001',
  customer_id: 'de4b54fe-5852-45c5-87f9-2bf7a5f10002',
  employee_id: 'de4b54fe-5852-45c5-87f9-2bf7a5f10003',
  transaction_type: 'DELIVERY',
  occurred_at: '2026-08-01T03:00:00Z',
  items: [
    {
      design_model_id: 'de4b54fe-5852-45c5-87f9-2bf7a5f10004',
      quantity: 3,
      unit_weight_g: '0.1234',
      labor_price_per_15g: '10000',
    },
  ],
  ...patch,
});
describe('quick ledger exact calculations and contract', () => {
  it('rounds each stored line once at numeric(20,4), sums repeated models', () => {
    const d = draft();
    d.items!.push({ ...d.items![0]!, quantity: 2 });
    expect(deliveryTotals(d)).toEqual({
      gold: 6170n,
      gross: 4113333n,
      discount: 0n,
      net: 4113333n,
    });
  });
  it('applies percent and fixed discount without binary floating point', () => {
    expect(
      deliveryTotals(
        draft({ discount_type: 'PERCENT', discount_value: '12.5' }),
      ),
    ).toEqual({
      gold: 3702n,
      gross: 2468000n,
      discount: 308500n,
      net: 2159500n,
    });
    expect(
      deliveryTotals(draft({ discount_type: 'AMOUNT', discount_value: '20' }))
        .net,
    ).toBe(2268000n);
  });
  it('rejects invalid discounts, zero weight and overflowing aggregates', () => {
    expect(() =>
      deliveryTotals(
        draft({ discount_type: 'PERCENT', discount_value: '100.0001' }),
      ),
    ).toThrow();
    expect(() =>
      deliveryTotals(
        draft({ discount_type: 'AMOUNT', discount_value: '1000' }),
      ),
    ).toThrow();
    expect(() =>
      deliveryTotals(
        draft({ items: [{ ...draft().items![0]!, unit_weight_g: '0' }] }),
      ),
    ).toThrow();
    expect(() =>
      deliveryTotals(
        draft({
          items: [
            {
              ...draft().items![0]!,
              quantity: 2147483647,
              unit_weight_g: '9999999999999999',
              labor_price_per_15g: '9999999999999999',
            },
          ],
        }),
      ),
    ).toThrow();
  });
  it('preserves recovered exact gold before final rounding', () => {
    expect(recoveredGold('1.2345', '96.5')).toEqual({
      gold: '1.1913',
      exact: '1.1912925000',
    });
    for (const p of ['0', '100.0001'])
      expect(() => recoveredGold('1', p)).toThrow();
  });
  it('finds Vietnamese names without accents', () =>
    expect(foldSearch('Phạm Việt Hà · ĐỨC')).toBe('pham viet ha · duc'));
  it('rejects fractional quantities, unknown types and date without timezone', async () => {
    for (const patch of [
      { transaction_type: 'PAYMENT' },
      { occurred_at: '2026-08-01T00:00:00' },
      { items: [{ ...draft().items![0]!, quantity: 1.5 }] },
    ]) {
      const dto = plainToInstance(QuickBatchDto, {
        request_id: crypto.randomUUID(),
        entries: [{ ...draft(), ...patch }],
      });
      expect(
        (await validate(dto, { whitelist: true, forbidNonWhitelisted: true }))
          .length,
      ).toBeGreaterThan(0);
    }
  });
});
