import { useLayoutEffect, useRef, useState } from "react";
import { Input, type InputProps, type InputRef } from "antd";
import { fixedDecimalText } from "../../utils/decimal";
import { wholeMoney } from "./grantPlannedLabor";

export type ProductionNumericProps = {
  value?: string | null;
  onChange?: (value: string | null) => void;
  disabled?: boolean;
  id?: string;
  onBlur?: InputProps["onBlur"];
};
type Selection = {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
};
const group = (whole: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const symbols = (text: string) => text.replace(/[^\d,]/g, "").length;
function position(text: string, right: number) {
  if (right === 0) return text.length;
  for (let i = text.length - 1, count = 0; i >= 0; i--)
    if (/[\d,]/.test(text[i]) && ++count === right) return i;
  return 0;
}
function selection(input: HTMLInputElement): Selection {
  return {
    start: symbols(
      input.value.slice(input.selectionStart ?? input.value.length),
    ),
    end: symbols(input.value.slice(input.selectionEnd ?? input.value.length)),
    direction: input.selectionDirection ?? "none",
  };
}
function externalDisplay(value: string, precision: 0 | 2 | 4, padGold = true) {
  if (!value) return "";
  if (precision === 2 && padGold) return fixedDecimalText(value, 2);
  const canonical = precision === 0 ? (wholeMoney(value) ?? value) : value;
  const [whole, fraction = ""] = canonical.split(".");
  const compact = fraction.replace(/0+$/, "");
  return group(whole) + (precision !== 0 && compact ? "," + compact : "");
}
function parseDraft(raw: string, precision: 0 | 2 | 4) {
  const pattern =
    precision === 4
      ? /^[\d.]*(?:,\d{0,4})?$/
      : precision === 2
        ? /^[\d.]*(?:,\d{0,2})?$/
        : /^[\d.]*$/;
  if (!pattern.test(raw)) return null;
  const [integer, fraction = ""] = raw.replaceAll(".", "").split(",");
  const hasComma = raw.includes(",");
  if (integer === "" && !hasComma)
    return { displayValue: "", numericValue: null };
  const whole = (integer || "0").replace(/^0+(?=\d)/, "");
  if (whole.length > 16) return null;
  return {
    displayValue: group(whole) + (hasComma ? "," + fraction : ""),
    numericValue: whole + (fraction ? "." + fraction : ""),
  };
}
/** Local editing text preserves empty/trailing-comma drafts, independent of Decimal state. */
export function ProductionNumericInput({
  value,
  onChange,
  disabled,
  id,
  onBlur,
  precision = 0,
}: ProductionNumericProps & { precision?: 0 | 2 | 4 }) {
  const ref = useRef<InputRef>(null),
    focused = useRef(false),
    lastEmitted = useRef(value ?? ""),
    pending = useRef<Selection | null>(null),
    beforeEdit = useRef<Selection | null>(null);
  const [draft, setDraft] = useState(() => ({
    text: externalDisplay(value ?? "", precision),
  }));
  useLayoutEffect(() => {
    const incoming = value ?? "";
    if (incoming !== lastEmitted.current) {
      lastEmitted.current = incoming;
      setDraft({
        text: externalDisplay(incoming, precision, !focused.current),
      });
    }
  }, [value, precision]);
  useLayoutEffect(() => {
    const saved = pending.current,
      input = ref.current?.input;
    pending.current = null;
    if (!saved || !input || document.activeElement !== input) return;
    input.setSelectionRange(
      position(input.value, saved.start),
      position(input.value, saved.end),
      saved.direction,
    );
  });
  return (
    <Input
      ref={ref}
      id={id}
      value={draft.text}
      disabled={disabled}
      inputMode={precision !== 0 ? "decimal" : "numeric"}
      onFocus={() => {
        focused.current = true;
      }}
      onBeforeInputCapture={(event) => {
        const input = event.target;
        if (input instanceof HTMLInputElement)
          beforeEdit.current = selection(input);
      }}
      onChange={(event) => {
        const input = event.currentTarget,
          next = parseDraft(input.value, precision);
        pending.current = next ? selection(input) : beforeEdit.current;
        beforeEdit.current = null;
        setDraft({ text: next?.displayValue ?? draft.text });
        if (next && (next.numericValue ?? "") !== lastEmitted.current) {
          lastEmitted.current = next.numericValue ?? "";
          onChange?.(next.numericValue);
        }
      }}
      onKeyDown={(event) => {
        const input = event.currentTarget,
          start = input.selectionStart;
        if (
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey ||
          start == null ||
          start !== input.selectionEnd
        )
          return;
        if (event.key === "Backspace" && input.value[start - 1] === ".")
          input.setSelectionRange(start - 1, start - 1);
        if (event.key === "Delete" && input.value[start] === ".")
          input.setSelectionRange(start + 1, start + 1);
      }}
      onBlur={(event) => {
        focused.current = false;
        setDraft({ text: externalDisplay(lastEmitted.current, precision) });
        onBlur?.(event);
      }}
    />
  );
}
