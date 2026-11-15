import type { Draft } from "./quickEntryDraft";
import type { CellSpec } from "./ledgerFocusManager";
export function quickFocusLayout(
  d: Draft,
  options: {
    fixedCustomer: boolean;
    sourceOrders: boolean;
    canCollect: boolean;
    pending: boolean;
  },
): CellSpec[] {
  const cells: CellSpec[] = [];
  const add = (
    section: string,
    rowId: string,
    fieldKey: string,
    row: number,
    column: number,
    disabled = false,
  ) =>
    cells.push({
      transactionId: d.id,
      section,
      rowId,
      fieldKey,
      row,
      column,
      disabled: disabled || options.pending,
    });
  ["type", "customer", "date", "employee"].forEach((f, c) =>
    add("header", "header", f, 0, c, f === "customer" && options.fixedCustomer),
  );
  if (d.type === "DELIVERY") {
    d.lines.forEach((l, r) =>
      ["model", "quantity", "weight", "price"].forEach((f, c) =>
        add("items", l.id, f, r, c, !!d.order),
      ),
    );
    if (options.sourceOrders) {
      add("source", "source", "order", 0, 0);
      if (d.order) add("source", "source", "tripId", 0, 1);
    }
    add("details", "details", "discountType", 0, 0);
    if (d.discountType !== "NONE") add("details", "details", "discount", 0, 1);
    add("details", "details", "hasReceipt", 1, 0, !options.canCollect);
    if (d.hasReceipt)
      [
        "received",
        "currency",
        ...(d.currency !== "THB" ? ["confirmedFx"] : []),
        "receivedDate",
        "collector",
        "paymentNote",
      ].forEach((f, c) => add("receipt", "receipt", f, 0, c));
  } else if (d.type === "RETURN_RECOVERED_GOLD") {
    add("details", "details", "actual", 0, 0);
    add("details", "details", "purity", 0, 1);
  } else if (d.type && d.type !== "RETURN_GOODS")
    add("details", "details", "gold", 0, 0);
  if (d.type !== "RETURN_GOODS") add("note", "note", "note", 0, 0);
  return cells;
}
