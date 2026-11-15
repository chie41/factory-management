import { dateText } from "../../../utils/format";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Descriptions, Form, Input, Select } from "antd";
import { RequestError } from "../../../components/common/RequestError";
import {
  currencyText,
  decimalPattern,
  weightText,
} from "../../../utils/decimal";
import {
  workflowGet,
  workflowWrite,
  localNow,
  moneyOptions,
  type Order,
} from "../services/workflowService";
import { LedgerDecimalInput } from "./LedgerDecimalInput";
import { LedgerDateTimeInput } from "./LedgerDateTimeInput";
import { usePermissions } from "../../auth/hooks/usePermissions";
export function ReportDeliveryForm({
  source = "LEDGER",
  customerId,
  orderId,
  tripId,
  formId,
  close,
  onPending,
  onReady,
  onDirty,
}: {
  source?: "LEDGER" | "DELIVERY";
  customerId?: string;
  orderId?: string;
  tripId?: string;
  formId?: string;
  close: () => void;
  onPending?: (v: boolean) => void;
  onReady?: (v: boolean) => void;
  onDirty?: (v: boolean) => void;
}) {
  const { can } = usePermissions(),
    [form] = Form.useForm(),
    cache = useQueryClient(),
    { message } = App.useApp();
  const [selected, setSelected] = useState(orderId),
    initialized = useRef(""),
    version = useRef("");
  const sources = useQuery({
    queryKey: ["delivery-orders", customerId],
    queryFn: () =>
      workflowGet<Order[]>("/customer-ledger/delivery-orders", {
        customer_id: customerId,
      }),
    enabled: can("delivery.report"),
  });
  const discountType = Form.useWatch("discount_type", form);
  const receivedCurrency = Form.useWatch("received_currency", form);
  const order = sources.data?.find((o) => o.id === selected);
  useEffect(() => {
    if (!order || initialized.current === order.id) return;
    initialized.current = order.id;
    version.current = order.version;
    if (order.declaration)
      form.setFieldsValue({
        ...order.declaration,
        local_time: localNow(order.declaration.occurred_at),
      });
    form.setFieldsValue({
      trip_id:
        tripId ??
        (order.assigned_trips?.some((t) => t.id === order.declaration?.trip_id)
          ? order.declaration?.trip_id
          : order.assigned_trips?.[0]?.id),
    });
  }, [order, form, tripId]);
  const save = useMutation({
    mutationFn: async (values: {
      trip_id?: string;
      confirmed_fx_per_baht?: string;
      discount_type: string;
      discount_value: string;
      actual_received_amount?: string;
      received_currency?: string;
      local_time: string;
      business_date: string;
      note?: string;
    }) => {
      if (!order) throw new Error("Chọn đơn hàng nguồn đang được phân công");
      const {
        local_time,
        actual_received_amount,
        trip_id,
        discount_type,
        discount_value,
        received_currency,
        note,
        confirmed_fx_per_baht,
      } = values;
      return workflowWrite(
        `/customer-ledger/orders/${order.id}/${source === "LEDGER" ? "record-delivery" : "report-delivery"}`,
        {
          trip_id,
          ...(source === "LEDGER" ? { confirmed_fx_per_baht } : {}),
          discount_type,
          discount_value: discount_type === "NONE" ? "0" : discount_value,
          received_currency,
          business_date: local_time.slice(0, 10),
          note,
          ...(actual_received_amount ? { actual_received_amount } : {}),
          version: version.current,
          occurred_at: new Date(local_time).toISOString(),
        },
      );
    },
    onSuccess: async () => {
      await Promise.all(
        [
          "ledger",
          "ledger-entry",
          "ledger-workflow",
          "orders",
          "delivery-orders",
          "cash",
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
      message.success(source === "LEDGER" ? "Đã ghi nhận giao hàng và khoản thu trực tiếp" : "Đã gửi giao hàng chờ kế toán duyệt");
      close();
    },
  });
  useEffect(() => onPending?.(save.isPending), [save.isPending, onPending]);
  useEffect(
    () => onReady?.(!!order && can("delivery.report") && (source !== "LEDGER" || can("customer_ledger.create"))),
    [order, onReady, can, source],
  );
  if (!can("delivery.report"))
    return <Alert type="warning" title="Bạn cần quyền khai giao hàng." />;
  if (source === "LEDGER" && !can("customer_ledger.create"))
    return <Alert type="warning" title="Bạn cần quyền tạo giao dịch trong sổ." />;
  return (
    <>
      <RequestError
        error={sources.error}
        retry={() => void sources.refetch()}
      />
      <RequestError error={save.error} />
      <Form
        id={formId}
        form={form}
        layout="vertical"
        initialValues={{
          discount_type: "NONE",
          discount_value: "0",
          local_time: localNow(),
          business_date: localNow().slice(0, 10),
          received_currency: "THB",
        }}
        onValuesChange={() => onDirty?.(true)}
        onFinish={(values) => save.mutate(values)}
        disabled={save.isPending}
      >
        <Form.Item label="ĐƠN HÀNG NGUỒN" required>
          <Select
            disabled={!!orderId}
            value={selected}
            onChange={(id) => {
              initialized.current = "";
              form.resetFields();
              setSelected(id);
              onDirty?.(true);
            }}
            loading={sources.isFetching}
            options={(sources.data ?? []).map((o) => ({
              value: o.id,
              label: o.order_code,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="trip_id"
          label="CHUYẾN GIAO THỰC TẾ"
          rules={[{ required: true }]}
        >
          <Select
            disabled={!!tripId}
            options={(order?.assigned_trips ?? []).map((t) => ({
              value: t.id,
              label: dateText(t.delivery_date) + " · " + t.full_name,
            }))}
          />
        </Form.Item>
        {order && (
          <Descriptions
            column={1}
            size="small"
            items={[
              {
                key: "g",
                label: "Vàng thực giao theo đơn",
                children: weightText(order.gold_weight_g),
              },
              {
                key: "l",
                label: "Tiền công gốc theo dòng đơn",
                children: currencyText(order.original_labor_baht, "THB"),
              },
            ]}
          />
        )}
        <Form.Item
          name="local_time"
          label="NGÀY GIAO DỊCH"
          rules={[{ required: true }]}
        >
          <LedgerDateTimeInput />
        </Form.Item>
        <div className="ledger-field-grid">
          <Form.Item name="discount_type" label="GIẢM GIÁ">
            <Select
              options={[
                { value: "NONE", label: "Không giảm" },
                { value: "PERCENT", label: "Theo %" },
                { value: "AMOUNT", label: "Số tiền BAHT" },
              ]}
            />
          </Form.Item>
          {discountType !== "NONE" && (
            <Form.Item
              name="discount_value"
              label="GIÁ TRỊ GIẢM"
              rules={[{ required: true, pattern: decimalPattern }]}
            >
              <LedgerDecimalInput />
            </Form.Item>
          )}
        </div>
        <div className="ledger-field-grid">
          <Form.Item
            name="actual_received_amount"
            label="TIỀN THỰC THU (để trống nếu chưa thu)"
            rules={[{ pattern: decimalPattern }]}
          >
            <LedgerDecimalInput />
          </Form.Item>
          <Form.Item name="received_currency" label="ĐỒNG TIỀN THỰC THU">
            <Select options={moneyOptions} />
          </Form.Item>
        </div>
        {source === "LEDGER" && receivedCurrency && receivedCurrency !== "THB" && <Form.Item name="confirmed_fx_per_baht" label="Tỷ giá xác nhận (nguyên tệ / THB)" rules={[{required:true,pattern:decimalPattern}]}><LedgerDecimalInput /></Form.Item>}
        <Form.Item name="note" label="GHI CHÚ">
          <Input.TextArea />
        </Form.Item>
        <Alert
          type="info"
          title={source === "LEDGER" ? "Ghi nhận trực tiếp từ sổ" : "Chờ kế toán duyệt"}
          description={source === "LEDGER" ? "Giao hàng và khoản thu được ghi nhận ngay khi lưu. Nhập tỷ giá thực tế nếu thu ngoại tệ." : "Vàng được tính vào công nợ ngay; tiền thực thu mới là bản khai, chưa ghi Thu/Chi. Kế toán xác nhận tỷ giá khi duyệt."}
        />
      </Form>
    </>
  );
}
