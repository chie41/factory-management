import { currencyLabels, decimalText } from "../../utils/decimal";

/** Display only: keep every significant decimal digit and never use floating point. */
export function laborDecimalText(value?: string | number | null) {
  if (value == null) return "—";
  const raw = String(value);
  const compact = raw.includes(".")
    ? raw.replace(/0+$/, "").replace(/\.$/, "")
    : raw;
  return decimalText(compact);
}
export function laborPriceText(
  value?: string | number | null,
  currency?: string | null,
) {
  if (value == null) return "—";
  const code = currency?.trim();
  return (
    laborDecimalText(value) +
    (code
      ? " " + (code === "THB" ? "B" : (currencyLabels[code] ?? code))
      : " (chưa rõ đơn vị)")
  );
}
