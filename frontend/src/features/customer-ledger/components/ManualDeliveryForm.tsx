import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Form, Input, Select } from "antd";
import { decimalPattern } from "../../../utils/decimal";
import { RequestError } from "../../../components/common/RequestError";
import { usePermissions } from "../../auth/hooks/usePermissions";
import {
  localNow,
  moneyOptions,
  workflowWrite,
} from "../services/workflowService";
import { LedgerCustomerSelect } from "./LedgerCustomerSelect";
import { LedgerDateTimeInput } from "./LedgerDateTimeInput";
import { LedgerDecimalInput } from "./LedgerDecimalInput";

export function ManualDeliveryForm({
  customerId,
  formId,
  close,
  onPending,
  onReady,
  onDirty,
}: {
  customerId?: string;
  formId?: string;
  close: () => void;
  onPending?: (value: boolean) => void;
  onReady?: (value: boolean) => void;
  onDirty?: (value: boolean) => void;
}) {
  const [form] = Form.useForm(),
    cache = useQueryClient(),
    { message } = App.useApp(),
    { can } = usePermissions();
  const [requestId] = useState(() => crypto.randomUUID());
  const discountType = Form.useWatch("discount_type", form);
  const currency = Form.useWatch("received_currency", form);
  const received = Form.useWatch("actual_received_amount", form);
  const save = useMutation({
    mutationFn: (values: {
      customer_id: string;
      local_time: string;
      gold_weight_g: string;
      original_labor_baht: string;
      discount_type: string;
      discount_value?: string;
      actual_received_amount?: string;
      received_currency: string;
      confirmed_fx_per_baht?: string;
      note?: string;
    }) => {
      const { local_time, ...rest } = values;
      return workflowWrite("/customer-ledger/manual-deliveries", {
        ...rest,
        request_id: requestId,
        occurred_at: new Date(local_time).toISOString(),
        discount_value:
          values.discount_type === "NONE" ? "0" : values.discount_value,
        actual_received_amount: values.actual_received_amount || undefined,
        confirmed_fx_per_baht:
          received && currency !== "THB"
            ? values.confirmed_fx_per_baht
            : undefined,
      });
    },
    onSuccess: async () => {
      await Promise.all(
        ["ledger", "ledger-entry", "ledger-workflow", "cash"].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      message.success("Đã ghi nhận giao hàng trực tiếp");
      close();
    },
  });
  useEffect(() => onPending?.(save.isPending), [save.isPending, onPending]);
  useEffect(() => onReady?.(true), [onReady]);
  return (
    <>
      <RequestError error={save.error} />
      <Form
        id={formId}
        form={form}
        layout="vertical"
        initialValues={{
          customer_id: customerId,
          local_time: localNow(),
          discount_type: "NONE",
          original_labor_baht: "0",
          received_currency: "THB",
        }}
        onValuesChange={() => onDirty?.(true)}
        onFinish={(values) => save.mutate(values)}
        disabled={save.isPending}
      >
        <Form.Item
          name="customer_id"
          label="KHÁCH HÀNG"
          rules={[{ required: true }]}
        >
          <LedgerCustomerSelect
            onChange={(id) => form.setFieldValue("customer_id", id)}
          />
        </Form.Item>
        <Form.Item
          name="local_time"
          label="NGÀY GIAO DỊCH"
          rules={[{ required: true }]}
        >
          <LedgerDateTimeInput />
        </Form.Item>
        <Form.Item
          name="gold_weight_g"
          label="VÀNG THỰC GIAO (g)"
          rules={[{ required: true, pattern: decimalPattern }]}
        >
          <LedgerDecimalInput />
        </Form.Item>
        <Form.Item
          name="original_labor_baht"
          label="TIỀN CÔNG GỐC (BAHT)"
          rules={[{ required: true, pattern: decimalPattern }]}
        >
          <LedgerDecimalInput />
        </Form.Item>
        <div className="ledger-field-grid">
          <Form.Item name="discount_type" label="GIẢM GIÁ">
            <Select
              options={[
                { value: "NONE", label: "Không giảm" },
                { value: "PERCENT", label: "Giảm theo phần trăm" },
                { value: "AMOUNT", label: "Giảm theo tiền" },
              ]}
            />
          </Form.Item>
          {discountType && discountType !== "NONE" && (
            <Form.Item
              name="discount_value"
              label={
                discountType === "PERCENT"
                  ? "GIÁ TRỊ GIẢM (%)"
                  : "GIÁ TRỊ GIẢM (BAHT)"
              }
              rules={[{ required: true, pattern: decimalPattern }]}
            >
              <LedgerDecimalInput />
            </Form.Item>
          )}
        </div>
        {can("customer_ledger.collect") && (
          <>
            <div className="ledger-field-grid">
              <Form.Item
                name="actual_received_amount"
                label="TIỀN THỰC THU (nếu có)"
                rules={[{ pattern: decimalPattern }]}
              >
                <LedgerDecimalInput />
              </Form.Item>
              <Form.Item name="received_currency" label="ĐỒNG TIỀN THỰC THU">
                <Select options={moneyOptions} />
              </Form.Item>
            </div>
            {received &&
              !/^0(?:\.0+)?$/.test(received) &&
              currency !== "THB" && (
                <Form.Item
                  name="confirmed_fx_per_baht"
                  label="TỶ GIÁ XÁC NHẬN (nguyên tệ / BAHT)"
                  rules={[{ required: true, pattern: decimalPattern }]}
                >
                  <LedgerDecimalInput />
                </Form.Item>
              )}
          </>
        )}
        <Form.Item name="note" label="GHI CHÚ">
          <Input.TextArea />
        </Form.Item>
        <Alert
          type="info"
          title="Kế toán nhập giao hàng trực tiếp"
          description="Không cần liên kết đơn hàng hoặc chuyến giao. Lưu để ghi nhận vàng và tiền công; khoản thực thu (nếu có) được ghi Thu/Chi cùng lần lưu."
        />
      </Form>
    </>
  );
}
