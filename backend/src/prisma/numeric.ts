
const NUMERIC_20_4_PATTERN =
  /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;

export function numeric20_4(
  value: string,
): string & {
  readonly __numericPrecision: 20;
  readonly __numericScale: 4;
} {
  if (!NUMERIC_20_4_PATTERN.test(value)) {
    throw new Error(
      `Giá trị Numeric(20,4) không hợp lệ: ${value}`,
    );
  }

  return value as string & {
    readonly __numericPrecision: 20;
    readonly __numericScale: 4;
  };
}
