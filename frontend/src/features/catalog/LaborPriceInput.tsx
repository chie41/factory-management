import { InputNumber } from "antd";
import { decimalPattern, parseLocaleDecimal } from "../../utils/decimal";
import { laborDecimalText } from "./laborPrice";

export function LaborPriceInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <InputNumber<string>
      stringMode
      min="0"
      max="9999999999999999.9999"
      precision={4}
      controls={false}
      disabled={disabled}
      style={{ width: "100%" }}
      value={value ?? null}
      placeholder={placeholder}
      formatter={(current, info) =>
        info.userTyping
          ? info.input
          : current == null || current === ""
            ? ""
            : laborDecimalText(current)
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
