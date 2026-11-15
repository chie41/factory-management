import { batchGet, batchWrite } from "./api";
export const executionStatuses: Record<string, string> = {
  NOT_STARTED: "Chưa thực hiện",
  IN_PROGRESS: "Đang thực hiện",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn thành",
};
export const movementKinds: Record<string, string> = {
  RETURN_TOTAL: "Nhận vàng tổng",
  INITIAL: "Giao ban đầu",
  ADDITIONAL: "Giao bổ sung",
  RETURN_UNUSED: "Nhận nguyên liệu thừa",
  RECEIVE_PRODUCT: "Nhận thành phẩm/bán thành phẩm",
  TRANSFER_IN: "Chuyển nội bộ đến",
  TRANSFER_OUT: "Chuyển nội bộ đi",
};
export type StageExecution = {
  execution_locked_at: string | null;
  estimated_duration_minutes: number | null;
  requires_employee_confirmation: boolean;
  description: string;
  step_id: string;
  name: string;
  display_order: number;
  dependencies: string[];
  execution_status: string;
  completed_quantity: number;
  remaining_quantity: number;
  execution_started_at: string | null;
  execution_finished_at: string | null;
  waiting_for: { step_id: string; name: string }[];
  labor_rate_per_15g: string | null;
};
export type Assignment = {
  applied_currency: string;
  planned_labor_by_currency: Record<string, string | null>;
  applied_rate: string | null;
  planned_labor: string | null;
  gold_issued_g: string;
  gold_received_g: string;
  reconciliation_status: "OPEN" | "CLOSED" | "ADJUSTING";
  closed_difference_gold_g: string | null;
  closed_issued_gold_g: string | null;
  closed_received_gold_g: string | null;
  closed_at: string | null;
  closed_by_name: string | null;
  id: string;
  step_id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  planned_quantity: number | null;
  completed_quantity: number;
  assigned_at: string;
  status: string;
  note: string | null;
};
export type ExecutionEntry = {
  correction_generated?: boolean;
  group_id: string;
  id: string;
  step_id: string;
  employee_id: string;
  employee_name: string;
  actor_name: string;
  material_type: string;
  material_name: string;
  unit: string;
  quantity: string;
  amount: string;
  direction: string;
  kind: string;
  effect: number;
  reverses_id: string | null;
  adjusts_id: string | null;
  occurred_at: string;
  note: string;
  reason: string;
  calculation_note: string;
  rate_per_15g: string | null;
  output_id: string | null;
};
export type Output = {
  correction_generated?: boolean;
  id: string;
  step_id: string;
  work_reference: string;
  quantity: number;
  occurred_at: string;
  note: string;
  contributors: {
    employee_name: string;
    assignment_id: string;
    quantity: number;
  }[];
};
export type Reconciliation = {
  step_id: string;
  employee_id: string;
  step_name: string;
  employee_name: string;
  material_type: string;
  material_name: string;
  unit: string;
  initial: string;
  additional: string;
  returned: string;
  products: string;
  transfer_in: string;
  transfer_out: string;
  recognized_loss: string;
  unreturned: string;
  unexplained: string;
};
export type Execution = {
  transactions: ExecutionTransaction[];
  default_labor_currency: string;
  standard_weight_per_unit_g: string | null;
  planned_weight_g: string | null;
  assignment_events: {
    id: string;
    assignment_id: string;
    after_state?: Record<string, unknown>;
    quantity_delta: number;
    resulting_quantity: number;
    kind: string;
    actor_name: string;
    created_at: string;
  }[];
  reconciliation_events: {
    id: string;
    assignment_id: string;
    action: string;
    reason: string;
    actor_name: string;
    created_at: string;
    before_state: Record<string, unknown> | null;
    after_state: Record<string, unknown>;
  }[];
  version: string;
  planned_quantity: number;
  join_policy: string;
  stages: StageExecution[];
  assignments: Assignment[];
  outputs: Output[];
  materials: ExecutionEntry[];
  losses: ExecutionEntry[];
  labor: ExecutionEntry[];
  reconciliation: Reconciliation[];
  labor_totals: {
    step_id: string;
    employee_id: string;
    employee_name: string;
    amount: string;
  }[];
};
export const getExecution = (id: string) =>
  batchGet<Execution>("/" + id + "/execution");
export const writeExecution = (id: string, path: string, data: object) =>
  batchWrite<{ version: string }>(
    "/" + id + "/execution/" + path,
    data,
    "post",
  );

export type TransactionState = {
  quantity: number;
  completed_quantity: number;
  gold_weight_g: string;
  rate: string | null;
  currency: string;
  planned_labor: string | null;
  note: string;
  physical_material_id: string | null;
  physical_output_id: string | null;
  voided: boolean;
};
export type ExecutionTransaction = {
  id: string;
  assignment_id: string;
  step_id: string;
  employee_id: string;
  employee_name: string;
  occurred_at: string;
  kind: "WORK" | "ISSUE" | "RECEIPT" | "OUTPUT" | "OTHER";
  has_work: boolean;
  has_gold: boolean;
  has_output: boolean;
  gold_kind: string | null;
  state: TransactionState;
  transaction_version: string;
  blocked_reason: string | null;
  changes: {
    id: string;
    action: "EDIT" | "VOID";
    reason: string;
    actor_name: string;
    created_at: string;
    before_state: TransactionState;
    after_state: TransactionState;
  }[];
};
