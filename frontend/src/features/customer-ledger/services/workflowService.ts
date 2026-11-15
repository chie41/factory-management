import { apiClient } from "../../../services/apiClient";
export type Currency = "THB" | "LAK" | "VND";
export type OrderItem = {
  design_model_id?: string | null;
  design_code_snapshot?: string | null;
  design_image_snapshot?: string | null;
  id: string;
  item_name: string;
  quantity: number;
  returned_quantity?: number;
  unit_weight_g: string;
  labor_price_per_15g: string;
  line_labor_amount: string;
};
export type Order = {
  id: string;
  order_code: string;
  customer_id: string;
  status: string;
  delivery_error: boolean;
  labor_payment_status: string;
  items: OrderItem[];
  original_labor_baht: string;
  gold_weight_g: string;
  version: string;
  assigned_trips?: { id: string; delivery_date: string; full_name: string }[];
  declaration?: {
    trip_id?: string;
    discount_type: string;
    discount_value: string;
    actual_received_amount?: string;
    received_currency?: Currency;
    occurred_at: string;
    business_date: string;
    note?: string;
  } | null;
};
export type Receipt = {
  business_date?:string; occurred_at?:string; collector?:{id:string;code:string;name:string}; note?:string;
  id: string;
  ledger_id: string;
  amount: string;
  currency: Currency;
  status: string;
  source: string;
  paid_baht?: string;
  confirmed_fx_per_baht?: string;
  suggested_fx_per_baht?: string | null;
  fx_unit?: string;
  version: string;
  ledger_status?: string;
};
export type GoodsReturn = {
  id: string;
  status: string;
  source_ledger_id: string;
  gold_weight_g?: string;
  net_labor_baht?: string;
  min_refund_baht: string;
  max_refund_baht: string;
  version: string;
  items: (OrderItem & {
    order_item_id: string;
    net_labor_baht: string;
    gold_weight_g: string;
  })[];
};
export type Workflow = {
  id: string;
  version: string;
  ledger: { id: string; approval_status: string; reversed_at?: string };
  submission: {
    trip_id?: string;
    discount_type?: string;
    discount_value?: string;
    original_labor_baht: string;
    discount_baht: string;
    net_labor_baht: string;
    review_note?: string;
    actual_received_amount?: string;
    received_currency?: Currency;
  };
  order: Order | null;
  items: OrderItem[];
  payments: Receipt[];
  returns: GoodsReturn[];
  fx_revisions?: {
    id: string;
    payment_id: string;
    old_fx?: string;
    new_fx: string;
    old_paid_baht?: string;
    new_paid_baht: string;
    actor_id: string;
    reason: string;
    created_at: string;
  }[];
  outstanding_baht: string;
  paid_baht: string;
  due_baht: string;
};
export type DeliverySource = {
  id: string;
  order_code: string;
  customer_id: string;
  customer_name: string;
  labor_amount_due: string;
  labor_amount_paid: string;
};
export async function workflowGet<T>(url: string, params?: object): Promise<T> {
  return (await apiClient.get<{ data: T }>(url, { params })).data.data;
}
export async function workflowWrite<T = unknown>(
  url: string,
  data: object,
  method: "post" | "patch" = "post",
): Promise<T> {
  return (await apiClient.request<{ data: T }>({ url, data, method })).data
    .data;
}
export const paymentLabels: Record<string, string> = {
  PAID: "Đã thu tiền công",
  PARTIAL: "Thiếu tiền công",
  PARTIALLY_PAID: "Thiếu tiền công",
  UNPAID: "Chưa thu tiền công",
};
export const approvalLabels: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  INCORRECT: "Đơn hàng sai",
  RECORDED: "Đã ghi sổ",
  LEGACY: "Dữ liệu cũ",
  VOID: "Bản khai đã thay thế",
};
export const moneyOptions = [
  { value: "THB", label: "BAHT (B)" },
  { value: "LAK", label: "KIP" },
  { value: "VND", label: "VND" },
];
export const localNow = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
};
