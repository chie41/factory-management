import { apiClient } from "../../services/apiClient";
import type { ProductionDefinition } from "../catalog/ProductionWorkflow";
export const batchStatuses: Record<string, string> = {
  DRAFT: "Nháp",
  PLANNED: "Đã lên kế hoạch",
  IN_PROGRESS: "Đang sản xuất",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};
export type BatchPlan = {
  planned_start_at?:string|null;
  planned_end_at?:string|null;
  planned_quantity: number;
  planned_start?: string | null;
  planned_end?: string | null;
  note?: string | null;
};
export type Batch = BatchPlan & {
  standard_weight_per_unit_g:string|null;
  id: string;
  code: string;
  design_model_id: string;
  model_code_snapshot: string;
  model_name_snapshot: string;
  product_unit: string;
  status: string;
  actual_start: string | null;
  actual_end: string | null;
  created_at: string;
  updated_at: string;
  created_by_name: string;
  updated_by_name: string;
  version: string;
  source_metadata: {
    mode: string;
    revision: number;
    group_name?: string | null;
  };
  workflow_snapshot?: {
    id: string;
    revision: number;
    definition: ProductionDefinition;
    created_at: string;
  };
  has_execution?: boolean;
};
export type Preview = {
  standard_weight_per_unit_g:string|null;
  version: string;
  revision: number | null;
  mode: string;
  group_name?: string | null;
  effectiveWorkflow: ProductionDefinition | null;
};
export type Page<T> = {
  data: T[];
  meta: { total?: number; page: number; page_size: number; has_more?: boolean };
};
export async function batchList(params: object) {
  return (await apiClient.get<Page<Batch>>("/production-batches", { params }))
    .data;
}
export async function batchGet<T>(path: string) {
  return (await apiClient.get<{ data: T }>("/production-batches" + path)).data
    .data;
}
export async function batchWrite<T = Batch>(
  path: string,
  data: object,
  method: "post" | "patch" = "patch",
) {
  return (
    await apiClient.request<{ data: T }>({
      url: "/production-batches" + path,
      method,
      data,
    })
  ).data.data;
}
export type HistoryEntry = {
  id: string;
  action?: string;
  from_status?: string;
  to_status?: string;
  reason?: string;
  actor_name: string;
  created_at: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
};
export async function batchHistory(
  id: string,
  kind: "audit" | "status",
  page: number,
) {
  return (
    await apiClient.get<Page<HistoryEntry>>(
      `/production-batches/${id}/${kind}-history`,
      { params: { page, page_size: 10 } },
    )
  ).data;
}
