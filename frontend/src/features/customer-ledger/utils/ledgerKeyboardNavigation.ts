import type { KeyboardEvent } from "react";
import type { LedgerFocusManager, CellAddress } from "./ledgerFocusManager";
export function handleCellKey(
  manager: LedgerFocusManager,
  cell: CellAddress,
  event: KeyboardEvent,
  kind: "input" | "select" | "date",
  popup = false,
) {
  if (
    event.nativeEvent.isComposing ||
    manager.composing ||
    event.keyCode === 229 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return false;
  if (
    popup &&
    [
      "ArrowDown",
      "ArrowUp",
      "ArrowLeft",
      "ArrowRight",
      "Enter",
      "Escape",
    ].includes(event.key)
  )
    return false;
  if (event.key === "F2") {
    event.preventDefault();
    event.stopPropagation();
    manager.openEdit();
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    manager.cancelEdit();
    return true;
  }
  if (event.key === "Tab") {
    if (!manager.finishEdit()) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    const moved = manager.next(cell, event.shiftKey ? -1 : 1, true, false);
    if (moved) {
      event.preventDefault();
      event.stopPropagation();
    }
    return moved;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    manager.vertical(cell, event.shiftKey ? -1 : 1);
    return true;
  }
  if (
    manager.snapshot().mode === "navigation" &&
    event.key.startsWith("Arrow")
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "ArrowDown" || event.key === "ArrowUp")
      manager.vertical(cell, event.key === "ArrowDown" ? 1 : -1, false);
    else manager.next(cell, event.key === "ArrowRight" ? 1 : -1, false);
    return true;
  }
  if (
    event.key.length === 1 ||
    event.key === "Backspace" ||
    event.key === "Delete"
  ) {
    manager.beginEdit();
    if (kind === "select") manager.openEdit();
  }
  return false;
}
