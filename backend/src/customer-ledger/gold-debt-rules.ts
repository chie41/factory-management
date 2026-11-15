import { BadRequestException } from '@nestjs/common';
import { units } from './ledger-decimal.js';

/** Quy ước chiều biến động nợ vàng đã được xác nhận bởi nghiệp vụ.
 * + : khách nợ vàng tăng; - : khách nợ vàng giảm.
 */
export const GOLD_DEBT_SIGN: Record<string, 1 | -1> = {
  OPENING_BALANCE: 1,
  DELIVERY: 1,
  GOLD_RETURN_TO_CUSTOMER: 1,
  RETURN_GOLD: -1,
  RETURN_GOODS: -1,
  RETURN_RECOVERED_GOLD: -1,
};

export function signedGoldUnits(entry: {
  transactionType: unknown;
  goldWeightG: unknown;
  reversedAt: unknown;
  approvalStatus?: unknown;
}): bigint {
  // Giao dịch đã reverse vẫn có mặt trong lịch sử nhưng không làm thay đổi số dư.
  if (entry.reversedAt !== null && entry.reversedAt !== undefined)
    return BigInt(0);

  if (entry.approvalStatus === 'INCORRECT') return 0n;
  const type = String(entry.transactionType);
  const sign = GOLD_DEBT_SIGN[type];
  if (sign === undefined) {
    throw new BadRequestException(
      `Loại giao dịch vàng chưa được cấu hình: ${type}`,
    );
  }
  return BigInt(sign) * units(String(entry.goldWeightG));
}

// Identifiers are internal SQL aliases; transaction types come from the same map as the ledger.
export function goldDeltaSql(alias: string) {
  const cases = Object.entries(GOLD_DEBT_SIGN).map(([type, sign]) => `WHEN '${type}' THEN ${sign}`).join(' ');
  return `CASE WHEN ${alias}.reversed_at IS NOT NULL OR ${alias}.approval_status='INCORRECT' THEN 0::numeric ELSE ${alias}.gold_weight_g * (CASE ${alias}.transaction_type ${cases} ELSE NULL END) END`;
}
