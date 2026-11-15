export type CellAddress = {
  transactionId: string;
  section: string;
  rowId: string;
  fieldKey: string;
};
export type CellSpec = CellAddress & {
  row: number;
  column: number;
  disabled?: boolean;
};
export type CellHandle = {
  focus: () => void;
  select?: () => void;
  edit?: () => void;
  cancel?: () => void;
  commit?: () => boolean;
};
export const cellKey = (cell: CellAddress) =>
  JSON.stringify([cell.transactionId, cell.section, cell.rowId, cell.fieldKey]);
export const address = (
  transactionId: string,
  fieldKey: string,
  rowId = "header",
  section = "header",
): CellAddress => ({ transactionId, section, rowId, fieldKey });
export class LedgerFocusManager {
  private handles = new Map<string, CellHandle>();
  private cells: CellSpec[] = [];
  private pending?: string;
  private queued?: {
    cell: CellAddress;
    direction: number;
    extend: boolean;
    vertical: boolean;
  };
  private refresh = () => {};
  private remembered = new Map<string, string>();
  private listeners = new Set<() => void>();
  private state = { key: "", mode: "navigation" as "navigation" | "edit" };
  composing = false;
  appendRow: (cell: CellAddress) => CellAddress | undefined = () => undefined;
  restore: (cell: CellAddress, value: string) => void = () => {};
  configure(
    callbacks: Pick<LedgerFocusManager, "appendRow" | "restore"> & {
      refresh?: () => void;
    },
  ) {
    this.appendRow = callbacks.appendRow;
    this.restore = callbacks.restore;
    this.refresh = callbacks.refresh ?? (() => {});
  }
  compositionStart() {
    this.composing = true;
    this.publish(this.state.key, "edit");
  }
  compositionEnd() {
    this.composing = false;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private publish(key = this.state.key, mode = this.state.mode) {
    if (key === this.state.key && mode === this.state.mode) return;
    this.state = { key, mode };
    this.listeners.forEach((f) => f());
  }
  register(cell: CellAddress, handle: CellHandle) {
    const key = cellKey(cell);
    this.handles.set(key, handle);
    this.flush();
    return () => {
      if (this.handles.get(key) === handle) this.handles.delete(key);
    };
  }
  layout(cells: CellSpec[]) {
    const prior=this.current();
    this.cells = cells.filter((c) => !c.disabled);
    const move = this.queued;
    this.queued = undefined;
    if (move) {
      if (move.vertical)
        this.vertical(move.cell, move.direction, move.extend, false);
      else this.next(move.cell, move.direction, move.extend, false);
    }
    if(!move&&!this.pending&&prior&&!this.current()&&this.cells.some(c=>c.transactionId===prior.transactionId)){
      const candidates=this.cells.filter(c=>c.section===prior.section&&c.column===prior.column);
      const replacement=candidates.find(c=>c.row>=prior.row)??candidates.at(-1)??this.cells[0];
      if(replacement)this.pending=cellKey(replacement);
    }
    this.flush();
  }
  deferNext(cell: CellAddress, direction = 1, extend = true, vertical = false) {
    this.queued = { cell, direction, extend, vertical };
    this.refresh();
  }
  current() {
    return this.cells.find((c) => cellKey(c) === this.state.key);
  }
  selected(cell: CellAddress) {
    this.remembered.set(cell.transactionId, cellKey(cell));
    this.publish(cellKey(cell), "navigation");
  }
  beginEdit() {
    if (this.state.mode === "navigation") {
      this.publish(this.state.key, "edit");
      this.handles.get(this.state.key)?.select?.();
    }
  }
  openEdit() {
    this.beginEdit();
    this.handles.get(this.state.key)?.edit?.();
  }
  cancelEdit() {
    this.handles.get(this.state.key)?.cancel?.();
    this.publish(this.state.key, "navigation");
  }
  focus(cell: CellAddress) {
    this.pending = cellKey(cell);
    this.flush();
  }
  focusTransaction(transactionId: string, remember = true) {
    const key = remember ? this.remembered.get(transactionId) : undefined;
    this.pending =
      key ??
      cellKey({
        transactionId,
        section: "header",
        rowId: "header",
        fieldKey: "type",
      });
    this.flush();
  }
  private flush() {
    if (!this.pending || !this.cells.some((c) => cellKey(c) === this.pending))
      return;
    const h = this.handles.get(this.pending);
    if (!h) return;
    this.pending = undefined;
    h.focus();
  }
  private commit() {
    return this.handles.get(this.state.key)?.commit?.() !== false;
  }
  finishEdit() {
    if (!this.commit()) return false;
    this.publish(this.state.key, "navigation");
    return true;
  }
  next(cell: CellAddress, direction = 1, extend = true, commit = true) {
    if (commit && !this.commit()) return false;
    const index = this.cells.findIndex((c) => cellKey(c) === cellKey(cell));
    if (index < 0) return false;
    const current = this.cells[index],
      next = this.cells[index + direction];
    if (
      direction > 0 &&
      extend &&
      current.section === "items" &&
      (!next || next.section !== "items")
    ) {
      const created = this.appendRow(current);
      if (created) {
        this.focus({ ...created, fieldKey: "model" });
        return true;
      }
    }
    if (next) {
      this.focus(next);
      return true;
    }
    return false;
  }
  vertical(cell: CellAddress, direction: number, extend = true, commit = true) {
    if (commit && !this.commit()) return false;
    const current = this.cells.find((c) => cellKey(c) === cellKey(cell));
    if (!current) return false;
    if (current.section !== "items")
      return this.next(cell, direction, false, false);
    const rows = this.cells.filter(
      (c) =>
        c.section === current.section &&
        c.transactionId === current.transactionId &&
        c.column === current.column,
    );
    const at = rows.findIndex((c) => cellKey(c) === cellKey(current)),
      next = rows[at + direction];
    if (next) {
      this.focus(next);
      return true;
    }
    if (direction > 0 && extend) {
      const created = this.appendRow(current);
      if (created) {
        this.focus({ ...created, fieldKey: current.fieldKey });
        return true;
      }
    }
    return false;
  }
  deleted(cell: CellAddress, remainingRowIds: string[]) {
    const current = this.current();
    if (!current || current.rowId !== cell.rowId) return;
    const priorRows = [
      ...new Set(
        this.cells.filter((c) => c.section === "items").map((c) => c.rowId),
      ),
    ];
    const at = priorRows.indexOf(cell.rowId),
      rowId =
        remainingRowIds[Math.min(Math.max(at, 0), remainingRowIds.length - 1)];
    if (rowId) this.focus({ ...cell, rowId, fieldKey: current.fieldKey });
  }
}
