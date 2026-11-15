import { apiClient } from "../../services/apiClient";
export type CatalogKind = "design-models" | "components";
export type CatalogRow = {
  effective_labor_price_per_15g?: string | null;
  effective_labor_currency?: string | null;
  labor_price_source?: 'MODEL' | 'GROUP_DEFAULT' | 'NONE';
  group_default_labor_price_per_15g?: string | null;
  group_id?: string | null;
  group_name?: string | null;
  id: string;
  code: string;
  name: string;
  version: string;
  status?: "ACTIVE" | "INACTIVE";
  image_url?: string | null;
  weight_g?: string | null;
  default_labor_price_per_15g?: string | null;
  default_labor_currency?: string | null;
  description?: string | null;
  design_description?: string | null;
  note?: string | null;
  length_mm?: string | null;
  width_mm?: string | null;
  height_mm?: string | null;
  attributes?: Record<string, unknown> | null;
  used_by?: { id: string; code: string; name: string }[];
};
export type CatalogList = {
  data: CatalogRow[];
  meta: { total: number; page: number; page_size: number };
};
export type BomItem = {
  id?: string;
  item_type: "COMPONENT" | "AUX_MATERIAL";
  component_id?: string | null;
  name_snapshot?: string | null;
  quantity?: string | null;
  weight_g?: string | null;
  unit?: "PCS" | "G" | "CM" | null;
};
export type Bom = {
  id: string;
  version: string;
  design_model_id: string;
  items: BomItem[];
};
export async function catalogList(
  kind: CatalogKind,
  params: object,
): Promise<CatalogList> {
  return (await apiClient.get<CatalogList>("/" + kind, { params })).data;
}
export async function catalogGet<T>(path: string): Promise<T> {
  return (await apiClient.get<{ data: T }>(path)).data.data;
}
export async function catalogWrite<T = CatalogRow>(
  path: string,
  data: object,
  method: "post" | "patch" | "delete" = "post",
): Promise<T> {
  return (await apiClient.request<{ data: T }>({ url: path, data, method }))
    .data.data;
}

/** Keep raw nullable override fields separate from server-resolved catalog prices. */
export const catalogPrice = (row: CatalogRow) => row.effective_labor_price_per_15g !== undefined ? row.effective_labor_price_per_15g : row.default_labor_price_per_15g
export const catalogPriceCurrency = (row: CatalogRow) => row.effective_labor_currency !== undefined ? row.effective_labor_currency : row.default_labor_currency
