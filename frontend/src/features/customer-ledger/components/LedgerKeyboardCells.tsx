import { fixedDecimalText } from "../../../utils/decimal";
import { handleCellKey } from "../utils/ledgerKeyboardNavigation";
import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Checkbox,
  Input,
  Select,
  type InputProps,
  type InputRef,
  type SelectProps,
  type RefSelectProps,
  type GetRef,
  DatePicker,
  type CheckboxProps,
} from "antd";
import { LedgerDateTimeInput } from "./LedgerDateTimeInput";
import {
  cellKey,
  type CellAddress,
  type CellHandle,
} from "../utils/ledgerFocusManager";
import { LedgerKeyboardContext } from "../hooks/ledgerKeyboardContext";
import { applicationDateTime } from "../utils/applicationDate";
import dayjs from "dayjs";
function useCell(cell: CellAddress, handle: CellHandle) {
  const manager = useContext(LedgerKeyboardContext)!;
  const latest = useRef(handle);
  useLayoutEffect(() => {
    latest.current = handle;
  });
  const key = cellKey(cell);
  useLayoutEffect(() => {
    const [transactionId, section, rowId, fieldKey] = JSON.parse(
      key,
    ) as string[];
    return manager.register(
      { transactionId, section, rowId, fieldKey },
      {
        focus: () => latest.current.focus(),
        select: () => latest.current.select?.(),
        edit: () => latest.current.edit?.(),
        cancel: () => latest.current.cancel?.(),
        commit: () => latest.current.commit?.() ?? true,
      },
    );
  }, [manager, key]);
  const state = useSyncExternalStore(manager.subscribe, manager.snapshot);
  return {
    manager,
    mode: state.key === key ? state.mode : "navigation",
    selected: state.key === key,
  };
}
export function KeyboardInput({
  cell,
  ...props
}: InputProps & { cell: CellAddress }) {
  const ref = useRef<InputRef>(null),
    before = useRef("");
  const { manager, mode, selected } = useCell(cell, {
    focus: () => ref.current?.focus({ cursor: "all" }),
    select: () => {
      before.current = String(props.value ?? "");
      ref.current?.select();
    },
    cancel: () => manager.restore(cell, before.current),
  });
  return (
    <Input
      {...props}
      ref={ref}
      data-keyboard-cell={cellKey(cell)}
      data-cell-mode={mode}
      className={`${props.className ?? ""} ${selected ? "keyboard-cell-selected" : ""}`}
      onFocus={(e) => {
        before.current = String(props.value ?? "");
        manager.selected(cell);
        props.onFocus?.(e);
      }}
      onCompositionStart={(e) => {
        manager.compositionStart();
        props.onCompositionStart?.(e);
      }}
      onCompositionEnd={(e) => {
        manager.compositionEnd();
        props.onCompositionEnd?.(e);
      }}
      onKeyDown={(e) => {
        handleCellKey(manager, cell, e, "input");
        props.onKeyDown?.(e);
      }}
    />
  );
}
// Keep the source string untouched on focus/blur; only user edits update the draft.
export function KeyboardNumericInput({ displayPrecision, ...props }: InputProps & { cell: CellAddress; displayPrecision?: number }) {
  const [editing, setEditing] = useState(false);
  const group = (text: string) => {
    const [whole, fraction] = text.replaceAll(".", "").split(",");
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (fraction !== undefined ? "," + fraction : "");
  };
  const raw = String(props.value ?? "");
  const shown = !editing && displayPrecision !== undefined && raw
    ? fixedDecimalText(raw.replaceAll(".", "").replace(",", "."), displayPrecision)
    : group(raw);
  return <KeyboardInput {...props} inputMode="decimal" value={shown}
    onFocus={e => { setEditing(true); props.onFocus?.(e); }}
    onBlur={e => { setEditing(false); props.onBlur?.(e); }}
    onKeyDown={e => {
      const input = e.currentTarget, pos = input.selectionStart;
      if (pos != null && pos === input.selectionEnd && !e.ctrlKey && !e.metaKey) {
        if (e.key === "Backspace" && input.value[pos - 1] === ".") input.setSelectionRange(pos - 1, pos - 1);
        if (e.key === "Delete" && input.value[pos] === ".") input.setSelectionRange(pos + 1, pos + 1);
      }
      props.onKeyDown?.(e);
    }}
    onChange={e => {
      const input = e.target, text = input.value;
      if (!/^[\d.]*(?:,\d{0,4})?$/.test(text)) { input.value = shown; return; }
      const logical = text.slice(0, input.selectionStart ?? text.length).replaceAll(".", "").length;
      const formatted = group(text);
      input.value = formatted;
      props.onChange?.(e);
      let position = 0, count = 0;
      while (position < formatted.length && count < logical) {
        if (formatted[position] !== ".") count++;
        position++;
      }
      input.setSelectionRange(position, position);
      requestAnimationFrame(() => { if (document.activeElement === input) input.setSelectionRange(position, position); });
    }} />;
}
export function KeyboardTextarea({
  cell,
  ...props
}: React.ComponentProps<typeof Input.TextArea> & { cell: CellAddress }) {
  const ref = useRef<GetRef<typeof Input.TextArea>>(null),
    before = useRef("");
  const { manager, mode, selected } = useCell(cell, {
    focus: () => ref.current?.focus({ cursor: "all" }),
    select: () => {
      before.current = String(props.value ?? "");
      ref.current?.resizableTextArea?.textArea.select();
    },
    cancel: () => manager.restore(cell, before.current),
  });
  return (
    <Input.TextArea
      {...props}
      ref={ref}
      data-keyboard-cell={cellKey(cell)}
      data-cell-mode={mode}
      className={selected ? "keyboard-cell-selected" : ""}
      onFocus={() => {
        before.current = String(props.value ?? "");
        manager.selected(cell);
      }}
      onCompositionStart={() => {
        manager.compositionStart();
      }}
      onCompositionEnd={() => {
        manager.compositionEnd();
      }}
      onKeyDown={(e) => handleCellKey(manager, cell, e, "input")}
    />
  );
}
export function KeyboardCheckbox({
  cell,
  ...props
}: CheckboxProps & { cell: CellAddress }) {
  const ref = useRef<GetRef<typeof Checkbox>>(null);
  const { manager } = useCell(cell, { focus: () => ref.current?.focus() });
  return (
    <Checkbox
      {...props}
      ref={ref}
      data-keyboard-cell={cellKey(cell)}
      onFocus={() => manager.selected(cell)}
      onKeyDown={(e) => handleCellKey(manager, cell, e, "input")}
    />
  );
}
export function KeyboardSelect({
  cell,
  ...props
}: SelectProps<string> & { cell: CellAddress }) {
  const ref = useRef<RefSelectProps>(null),
    active = useRef<string | undefined>(undefined),
    intent = useRef<"Enter" | "up" | undefined>(undefined),
    query = useRef(""),
    [open, setOpen] = useState(false);
  const { manager, mode, selected } = useCell(cell, {
    focus: () => ref.current?.focus(),
    edit: () => setOpen(true),
    cancel: () => setOpen(false),
    commit: () => {
      if (!open) return true;
      const option = props.options?.find(
        (o) => o.value === active.current && !o.disabled,
      );
      if (option) {
        props.onChange?.(String(option.value), option);
        query.current = "";
        setOpen(false);
        return true;
      }
      if (!query.current && props.value) {
        setOpen(false);
        return true;
      }
      return false;
    },
  });
  return (
    <span
      data-keyboard-cell={cellKey(cell)}
      data-cell-mode={mode}
      className={selected ? "keyboard-cell-selected" : ""}
      onKeyDownCapture={(e) => {
        if (
          e.nativeEvent.isComposing ||
          manager.composing ||
          e.keyCode === 229 ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey
        )
          return;
        if (open && e.key === "Enter") {
          intent.current = e.shiftKey ? "up" : "Enter";
          return;
        }
        if (open && e.key === "Tab") {
          intent.current = undefined;
          const option = props.options?.find(
            (o) => o.value === active.current && !o.disabled,
          );
          if (option) {
            e.preventDefault();
            e.stopPropagation();
            props.onChange?.(String(option.value), option);
            setOpen(false);
            manager.deferNext(cell, e.shiftKey ? -1 : 1, true);
          } else if (!query.current && props.value) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            manager.deferNext(cell, e.shiftKey ? -1 : 1, true);
          } else {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
              query.current = "";
              setOpen(false);
              manager.next(cell, -1, false, false);
            }
          }
          return;
        }
        if (open && e.key === "Escape") {
          intent.current = undefined;
          query.current = "";
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          manager.cancelEdit();
          return;
        }
        if (e.key === "Enter" && !props.value) {
          e.preventDefault();
          e.stopPropagation();
          manager.openEdit();
          return;
        }
        handleCellKey(manager, cell, e, "select", open);
      }}
      onCompositionStart={() => {
        manager.compositionStart();
      }}
      onCompositionEnd={() => {
        manager.compositionEnd();
      }}
    >
      <Select
        {...props}
        showSearch={
          props.showSearch
            ? {
                ...(typeof props.showSearch === "object"
                  ? props.showSearch
                  : {}),
                onSearch: (q) => {
                  query.current = q;
                  if (typeof props.showSearch === "object")
                    props.showSearch.onSearch?.(q);
                },
              }
            : props.showSearch
        }
        ref={ref}
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          props.onOpenChange?.(v);
        }}
        onActive={(v) => {
          active.current = v;
          props.onActive?.(v);
        }}
        onFocus={(e) => {
          manager.selected(cell);
          props.onFocus?.(e);
        }}
        onSelect={(value, option) => {
          props.onSelect?.(value, option);
          query.current = "";
          setOpen(false);
          manager.selected(cell);
          const movement = intent.current;
          intent.current = undefined;
          if (movement === "Enter") manager.deferNext(cell, 1, false);
          else if (movement === "up") manager.deferNext(cell, -1, false, true);
        }}
        onKeyDown={(e) => {
          if (!e.ctrlKey && !e.metaKey && ["Enter", "Escape"].includes(e.key))
            e.stopPropagation();
          props.onKeyDown?.(e);
        }}
      />
    </span>
  );
}
export function KeyboardDate({
  cell,
  value,
  onChange,
}: {
  cell: CellAddress;
  value?: string;
  onChange: (value?: string) => void;
}) {
  const ref = useRef<GetRef<typeof DatePicker>>(null),
    before = useRef(value),
    [open, setOpen] = useState(false),
    [invalid, setInvalid] = useState(false);
  const commit = () => {
    const text = ref.current?.nativeElement.querySelector("input")?.value ?? "";
    if (
      value &&
      dayjs(
        /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
          ? applicationDateTime(value)
          : value,
      ).format("DD/MM/YYYY HH:mm") === text
    )
      return true;
    if (!text) {
      if (value) onChange(undefined);
      return true;
    }
    const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(text);
    if (!match) {
      setInvalid(true);
      return false;
    }
    const [, d, m, y, h, min] = match,
      iso = `${y}-${m}-${d}T${h}:${min}:00`;
    const actual = new Date(`${iso}+07:00`);
    const valid =
      !Number.isNaN(actual.getTime()) &&
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .format(actual)
        .replace(",", "") === text;
    setInvalid(!valid);
    if (valid) onChange(iso);
    return valid;
  };
  const { manager, mode, selected } = useCell(cell, {
    focus: () => ref.current?.focus(),
    select: () => {
      before.current = value;
      ref.current?.nativeElement.querySelector("input")?.select();
    },
    edit: () => setOpen(true),
    cancel: () => {
      setOpen(false);
      onChange(before.current);
      setInvalid(false);
    },
    commit,
  });
  return (
    <span
      data-keyboard-cell={cellKey(cell)}
      data-cell-mode={mode}
      className={`${selected ? "keyboard-cell-selected" : ""} ${invalid ? "keyboard-cell-invalid" : ""}`}
      onFocus={() => {
        before.current = value;
        manager.selected(cell);
      }}
      onKeyDownCapture={(e) => handleCellKey(manager, cell, e, "date", open)}
      onCompositionStart={() => {
        manager.compositionStart();
      }}
      onCompositionEnd={() => {
        manager.compositionEnd();
      }}
    >
      <LedgerDateTimeInput
        controlRef={ref}
        open={open}
        onOpenChange={setOpen}
        value={value}
        onChange={(v) => {
          setInvalid(false);
          onChange(v);
        }}
      />
    </span>
  );
}
