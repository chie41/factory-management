import type { Order } from "../services/workflowService";
import type { TransactionType } from "../types/ledger";
import { decimalUnits, parseLocaleDecimal } from "../../../utils/decimal";
export type Choice = {
  id: string;
  code: string;
  name: string;
  image_url?: string | null;
  weight_g?: string;
  default_labor_price_per_15g?: string;
  default_labor_currency?: string;
};
export type Line = {
  id: string;
  sourceItemId?: string;
  model?: Choice;
  quantity: string;
  weight: string;
  price: string;
  pricingRequestId?: string;
  priceSource?: 'CUSTOMER' | 'GROUP' | 'MODEL' | 'GROUP_DEFAULT' | 'NONE' | 'DEFAULT' | 'MANUAL';
  pricingError?: string;
};
export type Draft = {
  id: string;
  type?: TransactionType;
  customer?: Choice;
  employee?: Choice;
  date?: string;
  note: string;
  lines: Line[];
  directLines?: Line[];
  order?: Order;
  tripId?: string;
  gold: string;
  actual: string;
  purity: string;
  discount: string;
  discountType: string;
  hasReceipt: boolean;
  receiptId: string;
  received: string;
  confirmedFx?: string;
  currency: string;
  receivedDate?: string;
  collector?: Choice;
  paymentNote: string;
};
export const line = (): Line => ({
  id: crypto.randomUUID(),
  quantity: "",
  weight: "",
  price: "",
});
export const blank = (prior?: Draft): Draft => ({
  id: crypto.randomUUID(),
  customer: prior?.customer,
  employee: prior?.employee,
  date: prior?.date,
  note: "",
  lines: [line()],
  gold: "",
  actual: "",
  purity: "",
  discount: "",
  discountType: "NONE",
  hasReceipt: false,
  receiptId: crypto.randomUUID(),
  received: "",
  currency: "THB",
  paymentNote: "",
});
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
export const dec = (n: bigint) =>
  `${n / 10000n}.${(n % 10000n).toString().padStart(4, "0")}`;
export const iso = (value: string) =>
  new Date(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+07:00`,
  ).toISOString();
export const meaningfulLines = (lines:Line[]) => lines.filter(l=>l.model || l.quantity.trim() || l.weight.trim() || l.price.trim());
export function totals(d: Draft) {
  const lines=meaningfulLines(d.lines);
  if(!lines.length)throw Error('Cần ít nhất một dòng mẫu mã');
  let gold = 0n,
    gross = 0n;
  for (const l of lines) {
    if (!l.model) throw Error("Chọn mẫu mã cho tất cả dòng");
    if (!/^[1-9]\d*$/.test(l.quantity) || BigInt(l.quantity) > 2147483647n)
      throw Error("Số lượng phải là số nguyên dương");
    const w = decimalUnits(parseLocaleDecimal(l.weight)),
      p = decimalUnits(parseLocaleDecimal(l.price));
    if (w <= 0n) throw Error("Trọng lượng sản phẩm phải dương");
    gold += BigInt(l.quantity) * w;
    gross += (BigInt(l.quantity) * w * p + 75000n) / 150000n;
    if(gold>99999999999999999999n || gross>99999999999999999999n)throw Error('Tổng vượt độ chính xác numeric(20,4)');
  }
  const v =
    d.discountType === "NONE"
      ? 0n
      : decimalUnits(parseLocaleDecimal(d.discount));
  if (d.discountType === "PERCENT" && v > 1000000n)
    throw Error("Phần trăm giảm không quá 100");
  const discount =
    d.discountType === "PERCENT"
      ? (gross * v + 500000n) / 1000000n
      : d.discountType === "AMOUNT"
        ? v
        : 0n;
  if (discount > gross) throw Error("Giảm giá vượt tiền công");
  return { gold, gross, discount, net: gross - discount };
}
export function payload(d: Draft) {
  if (d.type === 'DELIVERY' && !d.order && d.lines.some(l => l.pricingRequestId)) throw Error('Đang lấy giá công hiệu lực; vui lòng chờ hoặc nhập giá thủ công');

  if (!d.type || !d.customer || !d.employee || !d.date)
    throw Error("Chọn loại giao dịch, khách hàng, ngày giao dịch và nhân viên");
  const common = {
    request_id: d.id,
    transaction_type: d.type,
    customer_id: d.customer.id,
    employee_id: d.employee.id,
    occurred_at: iso(d.date),
    note: d.note,
  };
  if (d.type === "RETURN_GOODS")
    throw Error("Lưu trả hàng bằng biểu mẫu phiếu trả");
  if (d.type === "DELIVERY") {
    const t = totals(d);
    let receipt;
    if (d.hasReceipt) {
      const amount = parseLocaleDecimal(d.received);
      if (decimalUnits(amount) <= 0n || !d.collector || !d.receivedDate)
        throw Error("Nhập số tiền thu, ngày thu và người thu");
      if (d.currency === "THB" && decimalUnits(amount) > t.net)
        throw Error("Thu vượt tiền công phải thu");
      const fx = d.currency === "THB" ? "1" : parseLocaleDecimal(d.confirmedFx ?? "");
      if (decimalUnits(fx) <= 0n) throw Error("Nhập tỷ giá xác nhận: số đơn vị ngoại tệ cho 1 THB");
      receipt = {
        confirmed_fx_per_baht: fx,
        request_id: d.receiptId,
        amount,
        currency: d.currency,
        received_at: iso(d.receivedDate),
        employee_id: d.collector.id,
        note: d.paymentNote,
      };
    }
    return {
      ...common,
      ...(d.order
        ? {
            order_id: d.order.id,
            order_version: d.order.version,
            trip_id: d.tripId,
          }
        : {}),
      discount_type: d.discountType,
      discount_value:
        d.discountType === "NONE" ? "0" : parseLocaleDecimal(d.discount),
      items: meaningfulLines(d.lines).map((l) => ({
        design_model_id: l.model!.id,
        ...(l.sourceItemId ? { source_item_id: l.sourceItemId } : {}),
        quantity: Number(l.quantity),
        unit_weight_g: parseLocaleDecimal(l.weight),
        labor_price_per_15g: parseLocaleDecimal(l.price),
      })),
      ...(receipt ? { receipt } : {}),
    };
  }
  if (d.type === "RETURN_RECOVERED_GOLD") {
    const actual_weight_g = parseLocaleDecimal(d.actual),
      purity_percent = parseLocaleDecimal(d.purity);
    if (
      decimalUnits(actual_weight_g) <= 0n ||
      decimalUnits(purity_percent) <= 0n ||
      decimalUnits(purity_percent) > 1000000n
    )
      throw Error(
        "Trọng lượng phải dương; tuổi vàng lớn hơn 0 và không quá 100%",
      );
    return { ...common, actual_weight_g, purity_percent };
  }
  const gold_weight_g = parseLocaleDecimal(d.gold);
  if (decimalUnits(gold_weight_g) <= 0n)
    throw Error("Trọng lượng phải lớn hơn 0");
  return { ...common, gold_weight_g };
}
