import {
  decimalPattern,
  decimalUnits,
  fixedDecimalText,
} from "../../utils/decimal";
const canonical = (units: bigint) =>
  (units / 10000n).toString() +
  "." +
  (units % 10000n).toString().padStart(4, "0");
export function wholeMoney(value: unknown): string | null {
  if (typeof value !== "string" || !decimalPattern.test(value)) return null;
  return ((decimalUnits(value) + 5000n) / 10000n).toString();
}
export function grantPlannedLabor(
  weight: string | null,
  quantity: unknown,
  rate: unknown,
): string | null {
  if (quantity === 0) return "0";
  if (
    weight == null ||
    !decimalPattern.test(weight) ||
    decimalUnits(weight) === 0n ||
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    typeof rate !== "string" ||
    !decimalPattern.test(rate)
  )
    return null;
  const denominator = 1500000000n;
  return (
    (decimalUnits(weight) * BigInt(quantity) * decimalUnits(rate) +
      denominator / 2n) /
    denominator
  ).toString();
}
export function inverseGrantRate(
  weight: string | null,
  quantity: unknown,
  amount: unknown,
): string | null {
  const whole = wholeMoney(amount);
  if (
    whole == null ||
    weight == null ||
    !decimalPattern.test(weight) ||
    decimalUnits(weight) === 0n ||
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1
  )
    return null;
  const denominator = decimalUnits(weight) * BigInt(quantity);
  return canonical(
    (BigInt(whole) * 15n * 100000000n + denominator / 2n) / denominator,
  );
}
export function suggestGrantQuantity(
  gold: unknown,
  weight: string | null,
  quota: number,
): number | null {
  if (
    typeof gold !== "string" ||
    !decimalPattern.test(gold) ||
    weight == null ||
    !decimalPattern.test(weight) ||
    decimalUnits(weight) === 0n
  )
    return null;
  const proposed = decimalUnits(gold) / decimalUnits(weight);
  return Number(proposed > BigInt(quota) ? BigInt(quota) : proposed);
}
export function laborTotalsText(
  rows: {
    planned_labor?: string | null;
    planned_labor_by_currency?: Record<string, string | null>;
  }[],
): string | null {
  const totals: Record<string, bigint> = {};
  for (const row of rows) {
    const map = row.planned_labor_by_currency ?? {
      THB: row.planned_labor ?? null,
    };
    for (const [currency, amount] of Object.entries(map)) {
      if (amount == null) return null;
      const [whole, fraction = ""] = amount.split(".");
      totals[currency] =
        (totals[currency] ?? 0n) +
        BigInt(whole) * 10000n +
        BigInt(fraction.padEnd(4, "0"));
    }
  }
  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([currency, value]) =>
        fixedDecimalText(canonical(value), 0) + " " + currency,
    )
    .join(" · ");
}
