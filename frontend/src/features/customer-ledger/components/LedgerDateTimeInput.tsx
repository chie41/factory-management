import { applicationDateTime } from "../utils/applicationDate";
import { DatePicker, type GetRef } from "antd";
import type { Ref } from 'react';
import dayjs from "dayjs";

export function LedgerDateTimeInput({
  value,
  onChange,
  id,
  controlRef,
  open,
  onOpenChange,
}: {
  value?: string;
  onChange?: (value?: string) => void;
  id?: string;
  controlRef?:Ref<GetRef<typeof DatePicker>>;
  open?:boolean;
  onOpenChange?:(open:boolean)=>void;
}) {
  return (
    <div
      onKeyDown={(event) => {
        if (event.ctrlKey && event.key === ";") {
          event.preventDefault();
          event.stopPropagation();
          const now = applicationDateTime();
          onChange?.(now);
        } else if (event.key === "Enter") event.preventDefault();
      }}
    >
      <DatePicker
        ref={controlRef}
        open={open}
        onOpenChange={onOpenChange}
        id={id}
        value={
          value
            ? dayjs(
                /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
                  ? applicationDateTime(value)
                  : value,
              )
            : null
        }
        onChange={(date) => onChange?.(date?.format("YYYY-MM-DDTHH:mm:ss.SSS"))}
        showTime={{ format: "HH:mm" }}
        format="DD/MM/YYYY HH:mm"
        needConfirm={false}
        style={{ width: "100%" }}
      />
    </div>
  );
}
