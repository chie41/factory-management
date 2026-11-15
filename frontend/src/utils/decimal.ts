// Preserve numeric(20,4) precision for validation and display.
export const decimalPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;
export function decimalUnits(value: string): bigint {
  if (!decimalPattern.test(value))
    throw new Error(
      "Số không âm, tối đa 16 chữ số nguyên và 4 chữ số thập phân",
    );
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
}
export function decimalText(value?: string | number | null): string {
  if (value == null) return "—";
  const raw = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return raw;
  const [whole, fraction] = raw.split(".");
  const grouped =
    (whole === "-0" ? "-" : "") + BigInt(whole).toLocaleString("vi-VN");
  return grouped + (fraction ? "," + fraction : "");
}
export function parseLocaleDecimal(value: string): string {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,4})?$/.test(text))
    throw new Error(
      "Dùng dấu chấm phân nhóm nghìn, dấu phẩy cho phần thập phân (tối đa 4 số lẻ)",
    );
  const canonical = text
    .replaceAll(".", "")
    .replace(",", ".")
    .replace(/^0+(?=\d)/, "");
  if (!decimalPattern.test(canonical))
    throw new Error("Số vượt độ chính xác numeric(20,4)");
  return canonical;
}
export function fixedDecimalText(
  value: string | number,
  precision = 2,
): string {
  const text = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return text;
  const negative = text.startsWith("-"),
    [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  const scale = 10n ** BigInt(precision);
  let rounded =
    BigInt(whole) * scale +
    BigInt(fraction.padEnd(precision, "0").slice(0, precision) || "0");
  if ((fraction[precision] ?? "0") >= "5") rounded += 1n;
  return (
    (negative && rounded !== 0n ? "-" : "") +
    (rounded / scale).toLocaleString("vi-VN") +
    (precision > 0
      ? "," + (rounded % scale).toString().padStart(precision, "0")
      : "")
  );
}
export const weightText = (value?: string | number | null) =>
  value == null ? "—" : fixedDecimalText(value, 2) + " g";
export const currencyLabels: Record<string, string> = {
  THB: "BAHT (B)",
  LAK: "KIP",
  VND: "VND",
};
export const currencyText = (
  value?: string | number | null,
  currency?: string | null,
) =>
  value == null
    ? "—"
    : fixedDecimalText(value, 0) +
      (currency
        ? currency.trim() === "THB"
          ? "B"
          : " " + (currencyLabels[currency.trim()] ?? currency.trim())
        : " (chưa rõ đơn vị)");
