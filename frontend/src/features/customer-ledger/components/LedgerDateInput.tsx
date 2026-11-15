import { applicationDate } from "../utils/applicationDate";
import { DatePicker } from "antd";
import dayjs from "dayjs";

export function LedgerDateInput({
  value,
  onChange,
  id,
  disabled,
}: {
  value?: string;
  onChange?: (value?: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <DatePicker
      id={id}
      disabled={disabled}
      onKeyDown={(event) => {
        if (event.ctrlKey && event.key === ";" && !disabled) {
          event.preventDefault();
          onChange?.(applicationDate());
        }
      }}
      value={value ? dayjs(value) : null}
      onChange={(date) => onChange?.(date?.format("YYYY-MM-DD"))}
      format="DD/MM/YYYY"
      placeholder="dd/mm/yyyy"
      style={{ width: "100%" }}
    />
  );
}
