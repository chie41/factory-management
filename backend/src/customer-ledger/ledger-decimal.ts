import { BadRequestException } from '@nestjs/common';
export function units(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/.test(value))
    throw new BadRequestException(
      'Số phải không âm, tối đa 16 chữ số nguyên và 4 chữ số thập phân',
    );
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}
export function toDecimal(value: bigint): string {
  const sign = value < 0n ? '-' : '',
    absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 10000n}.${(absolute % 10000n).toString().padStart(4, '0')}`;
}
export function recoveredGold(actual: string, purity: string) {
  const weight = units(actual),
    percent = units(purity);
  if (weight <= 0n || percent <= 0n || percent > 1000000n)
    throw new BadRequestException(
      'Trọng lượng thực phải dương và tuổi vàng phải lớn hơn 0, không quá 100%',
    );
  const product = weight * percent;
  const rounded = (product + 500000n) / 1000000n;
  if (rounded <= 0n || rounded > 99999999999999999999n)
    throw new BadRequestException(
      'Vàng quy đổi nằm ngoài độ chính xác numeric(20,4)',
    );
  return {
    gold: toDecimal(rounded),
    exact: `${product / 10000000000n}.${(product % 10000000000n).toString().padStart(10, '0')}`,
  };
}
