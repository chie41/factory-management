import {
  ProductionNumericInput,
  type ProductionNumericProps,
} from "./ProductionNumericInput";
import { InputNumber } from "antd";
import {
  decimalPattern,
  fixedDecimalText,
  parseLocaleDecimal,
} from "../../utils/decimal";
/** Canonical decimal state; locale formatting is display-only. */
export function GoldWeightInput({
  value,
  onChange,
  disabled,
  precision = 2,
  id,
  onBlur,
}: ProductionNumericProps & { precision?: 0 | 2 }) {
  if (precision === 2)
    return (
      <ProductionNumericInput
        value={value}
        onChange={onChange}
        disabled={disabled}
        id={id}
        onBlur={onBlur}
        precision={2}
      />
    );
  return (
    <InputNumber<string>
      stringMode
      id={id}
      onBlur={onBlur}
      min="0"
      max={precision === 0 ? "9999999999999999" : "9999999999999999.99"}
      precision={precision}
      controls={false}
      disabled={disabled}
      style={{ width: "100%" }}
      value={value ?? null}
      formatter={(current, info) =>
        info.userTyping
          ? info.input
          : current == null || current === ""
            ? ""
            : fixedDecimalText(current, precision)
      }
      parser={(input) => {
        if (!input?.trim()) return "";
        try {
          return parseLocaleDecimal(
            input.endsWith(",") ? input.slice(0, -1) : input,
          );
        } catch {
          return value ?? "";
        }
      }}
      onChange={(next) => {
        if (next == null || decimalPattern.test(next)) onChange?.(next);
      }}
    />
  );
}
