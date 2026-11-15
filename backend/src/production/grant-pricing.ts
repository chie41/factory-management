import { BadRequestException } from '@nestjs/common';
import { units, toDecimal } from '../customer-ledger/ledger-decimal.js';
export type GrantPricing = {
  rate?: string;
  currency?: string;
  amount?: string;
  mode?: 'RATE' | 'AMOUNT';
};
export function plannedGrant(
  weight: string | null,
  quantity: number,
  input: GrantPricing,
  inheritedRate: string | null,
) {
  if (weight == null || units(weight) === 0n)
    throw new BadRequestException(
      'Cần trọng lượng chuẩn một sản phẩm lớn hơn 0 để tính công',
    );
  const basis = units(weight) * BigInt(quantity);
  let rate = input.rate ?? inheritedRate;
  let money: bigint;
  if (input.mode === 'AMOUNT') {
    if (input.amount == null)
      throw new BadRequestException('Nhập tiền công được xác nhận');
    money = (units(input.amount) + 5000n) / 10000n;
    const divisor = basis;
    rate = toDecimal((money * 15n * 100000000n + divisor / 2n) / divisor);
    units(rate); // Reject rates outside numeric(20,4).
  } else {
    if (rate == null)
      throw new BadRequestException(
        'Thiết lập đơn giá công trước khi giao sản phẩm',
      );
    const denominator = 1500000000n;
    money = (basis * units(rate) + denominator / 2n) / denominator;
    if (input.amount != null && units(input.amount) !== money * 10000n)
      throw new BadRequestException(
        'Tiền công không khớp đơn giá; tải lại giá trị hoặc chọn sửa tiền công',
      );
  }
  return { rate: toDecimal(units(rate!)), amount: toDecimal(money * 10000n) };
}
export function storedMoneyUnits(value: string): bigint {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value))
    throw new BadRequestException('Snapshot tiền công không hợp lệ');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}
