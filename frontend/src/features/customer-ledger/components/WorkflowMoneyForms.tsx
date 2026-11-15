import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Typography,
} from "antd";
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
  type DeliverySource,
  type GoodsReturn,
  type Receipt,
  type Workflow,
} from "../services/workflowService";
import { LedgerDecimalInput } from "./LedgerDecimalInput";
import { LedgerDateTimeInput } from "./LedgerDateTimeInput";
export function CollectPaymentModal({
  ledgerId,
  source = "LEDGER",
  close,
}: {
  ledgerId: string;
  source?: "LEDGER" | "CASH";
  close: () => void;
}) {
  const [form] = Form.useForm(),
    [requestId] = useState(() => crypto.randomUUID()),
    cache = useQueryClient(),
    { message } = App.useApp();
  const currency = Form.useWatch("currency", form);
  const save = useMutation({
    mutationFn: (values: {
      amount: string;
      currency: string;
      local_time: string;
      business_date: string;
      confirmed_fx_per_baht?: string;
    }) => {
      const { local_time, ...data } = values;
      return workflowWrite(
        source === "CASH"
          ? `/cash/entries/${ledgerId}/payments`
          : `/customer-ledger/entries/${ledgerId}/payments`,
        {
          ...data,
          request_id: requestId,
          business_date: local_time.slice(0,10),
          occurred_at: new Date(local_time).toISOString(),
        },
      );
    },
    onSuccess: async () => {
      await Promise.all(
        ["ledger-workflow", "ledger", "ledger-entry", "cash"].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      message.success(source === "LEDGER" ? "Đã ghi nhận khoản thu và cập nhật tiền công" : "Đã khai khoản thu chờ duyệt");
      close();
    },
  });
  return (
    <Modal
      open
      title="Thu bổ sung tiền công"
      onCancel={close}
      onOk={() => form.submit()}
      confirmLoading={save.isPending}
      okText={source === "LEDGER" ? "Ghi nhận" : "Gửi duyệt"}
      cancelText="Hủy"
    >
      <RequestError error={save.error} />
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          currency: "THB",
          local_time: localNow(),
          business_date: localNow().slice(0, 10),
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="amount"
          label="Số tiền thực thu"
          rules={[{ required: true, pattern: decimalPattern }]}
        >
          <LedgerDecimalInput />
        </Form.Item>
        <Form.Item
          name="currency"
          label="Đồng tiền thực thu"
          rules={[{ required: true }]}
        >
          <Select options={moneyOptions} />
        </Form.Item>
        {source === "LEDGER" && currency && currency !== "THB" && <Form.Item name="confirmed_fx_per_baht" label="Tỷ giá xác nhận (nguyên tệ / THB)" rules={[{required:true,pattern:decimalPattern}]}><LedgerDecimalInput /></Form.Item>}
        <Form.Item
          name="local_time"
          label="Ngày / giờ thu"
          rules={[{ required: true }]}
        >
          <LedgerDateTimeInput />
        </Form.Item>
        <Alert
          type="info"
          title={source === "LEDGER" ? "Ghi nhận trực tiếp" : "Chưa ghi Thu/Chi"}
          description={source === "LEDGER" ? "Khoản thu được ghi sổ và cập nhật tiền công ngay khi lưu. Ngoại tệ cần tỷ giá xác nhận." : "Khoản thu chỉ hạch toán sau khi kế toán duyệt. Người thu không nhập tỷ giá."}
        />
      </Form>
    </Modal>
  );
}
export function PaymentReviewModal({
  receipt,
  revise = false,
  close,
}: {
  receipt: Receipt;
  revise?: boolean;
  close: () => void;
}) {
  const [form] = Form.useForm(),
    cache = useQueryClient(),
    { message } = App.useApp();
  const save = useMutation({
    mutationFn: (values: { confirmed_fx_per_baht: string; reason?: string }) =>
      workflowWrite(
        `/cash/payments/${receipt.id}/${revise ? "fx" : "approve"}`,
        { ...values, version: receipt.version },
        revise ? "patch" : "post",
      ),
    onSuccess: async () => {
      await Promise.all(
        ["ledger", "ledger-entry", "ledger-workflow", "cash", "orders"].map(
          (key) => cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      message.success("Đã cập nhật khoản thu");
      close();
    },
  });
  return (
    <Modal
      open
      title={revise ? "Điều chỉnh tỷ giá khoản thu" : "Duyệt khoản thu"}
      onCancel={close}
      onOk={() => form.submit()}
      confirmLoading={save.isPending}
      okText="Xác nhận"
      cancelText="Hủy"
    >
      <Typography.Paragraph>
        Nguyên tệ đã thu: {currencyText(receipt.amount, receipt.currency)}
      </Typography.Paragraph>
      <RequestError error={save.error} />
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          confirmed_fx_per_baht:
            receipt.currency === "THB"
              ? "1"
              : revise
                ? receipt.confirmed_fx_per_baht
                : undefined,
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="confirmed_fx_per_baht"
          label={`Tỷ giá xác nhận (${receipt.fx_unit ?? "nguyên tệ / BAHT"})`}
          rules={[{ required: true, pattern: decimalPattern }]}
        >
          <LedgerDecimalInput readOnly={receipt.currency === "THB"} />
        </Form.Item>
        {!revise && receipt.currency !== "THB" && (
          <Alert
            type="info"
            title={`Gợi ý giả định thu đủ: ${receipt.suggested_fx_per_baht ?? "Không có số dư dương để gợi ý"}`}
            description="Đây chỉ là gợi ý. Nhập tỷ giá thực tế; hệ thống tính BAHT và chặn thu vượt."
          />
        )}
        {revise && (
          <Form.Item
            name="reason"
            label="Lý do thay đổi"
            rules={[{ required: true, whitespace: true, max: 1000 }]}
          >
            <Input.TextArea />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
export function NewGoodsReturnForm({
  common,
  customerId,
  ledgerId,
  formId,
  close,
  onPending,
  onReady,
  onDirty,
}: {
  common?:{employeeId?:string;date?:string};
  customerId?: string;
  ledgerId?: string;
  formId?: string;
  close: () => void;
  onPending?: (v: boolean) => void;
  onReady?: (v: boolean) => void;
  onDirty?: (v: boolean) => void;
}) {
  const [selected, setSelected] = useState(ledgerId),
    [requestId] = useState(() => crypto.randomUUID()),
    [form] = Form.useForm(),
    cache = useQueryClient(),
    { message } = App.useApp();
  const sources = useQuery({
    queryKey: ["returnable-deliveries", customerId],
    queryFn: () =>
      workflowGet<DeliverySource[]>("/customer-ledger/returnable-deliveries", {
        customer_id: customerId,
      }),
    enabled: !ledgerId,
  });
  const root = useQuery({
    queryKey: ["ledger-workflow", selected],
    queryFn: () =>
      workflowGet<Workflow>(`/customer-ledger/entries/${selected}/workflow`),
    enabled: !!selected,
  });
  const refundCurrency = Form.useWatch("refund_currency", form);
  const save = useMutation({
    mutationFn: (values: {
      quantities: Record<string, number>;
      weights?: Record<string, string>;
      local_time: string;
      business_date: string;
      note?: string;
      refund_amount?: string;
      refund_currency?: string;
      confirmed_fx_per_baht?: string;
    }) => {
      if(common&&(!common.employeeId||!common.date))throw new Error('Chọn ngày giao dịch và nhân viên thực hiện');
      const occurred=common?.date??values.local_time;
      const items = Object.entries(values.quantities ?? {})
        .filter(([, q]) => q > 0)
        .map(([order_item_id, quantity]) => ({
          order_item_id,
          quantity,
          ...(values.weights?.[order_item_id]
            ? { gold_weight_g: values.weights[order_item_id] }
            : {}),
        }));
      if (!items.length)
        throw new Error("Chọn ít nhất một dòng và số lượng trả");
      return workflowWrite(
        `/customer-ledger/entries/${selected}/goods-returns`,
        {
          request_id: requestId,
          refund_amount: values.refund_amount ?? "0",
          refund_currency: values.refund_currency ?? "THB",
          confirmed_fx_per_baht: values.refund_currency === "THB" || !values.refund_currency ? "1" : values.confirmed_fx_per_baht,
          items,
          business_date: occurred.slice(0, 10),
          ...(common?.employeeId?{employee_id:common.employeeId}:{}),
          occurred_at: new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(occurred)?occurred:`${occurred}+07:00`).toISOString(),
          note: values.note,
        },
      );
    },
    onSuccess: async () => {
      await Promise.all(["ledger-workflow","ledger","ledger-entry","cash","returnable-deliveries"].map(key=>cache.invalidateQueries({queryKey:[key]})));
      message.success("Đã ghi nhận trả hàng và tiền hoàn trực tiếp");
      close();
    },
  });
  useEffect(() => onPending?.(save.isPending), [save.isPending, onPending]);
  useEffect(() => onReady?.(!!root.data && (!common || !!(common.date && common.employeeId))), [root.data, onReady, common]);
  return (
    <>
      <RequestError error={sources.error || root.error || save.error} />
      <Form
        id={formId}
        form={form}
        layout="vertical"
        initialValues={{ local_time: localNow(), refund_amount: "0", refund_currency: "THB", confirmed_fx_per_baht: "1" }}
        onFinish={(values) => save.mutate(values)}
        onValuesChange={() => onDirty?.(true)}
      >
        {!ledgerId && (
          <Form.Item label="Giao hàng gốc" required>
            <Select
              value={selected}
              onChange={(id) => {
                setSelected(id);
                form.resetFields();
                onDirty?.(true);
              }}
              options={(sources.data ?? []).map((s) => ({
                value: s.id,
                label: s.order_code + " · " + s.customer_name,
              }))}
            />
          </Form.Item>
        )}
        {!common && <>
        <Form.Item
          name="local_time"
          label="Ngày / giờ nhận hàng trả"
          rules={[{ required: true }]}
        >
          <LedgerDateTimeInput />
        </Form.Item>
        </>}
        {root.data?.items.map((i) => (
          <div className="ledger-field-grid" key={i.id}>
            <Form.Item
              name={["quantities", i.id]}
              label={`${i.item_name} · còn được trả ${i.quantity - (i.returned_quantity ?? 0)}`}
              initialValue={0}
            >
              <InputNumber
                min={0}
                max={i.quantity - (i.returned_quantity ?? 0)}
                disabled={i.quantity <= (i.returned_quantity ?? 0)}
                precision={0}
              />
            </Form.Item>
            <Form.Item
              name={["weights", i.id]}
              label="Trọng lượng trả thực tế (tùy chọn)"
              rules={[{ pattern: decimalPattern }]}
            >
              <LedgerDecimalInput suffix="g" />
            </Form.Item>
          </div>
        ))}
        <Form.Item name="refund_amount" label="Số tiền hoàn thực tế (0 nếu không hoàn tiền)" rules={[{required:true,pattern:decimalPattern}]}><LedgerDecimalInput /></Form.Item>
        <Form.Item name="refund_currency" label="Đồng tiền hoàn" rules={[{required:true}]}><Select options={moneyOptions} onChange={value=>form.setFieldsValue({confirmed_fx_per_baht:value==="THB"?"1":undefined})} /></Form.Item>
        {refundCurrency && refundCurrency !== "THB" && <Form.Item name="confirmed_fx_per_baht" label="Tỷ giá hoàn (nguyên tệ / THB)" rules={[{required:true,pattern:decimalPattern}]}><LedgerDecimalInput /></Form.Item>}
        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea />
        </Form.Item>
        <Alert
          type="info"
          title="Ghi nhận trả hàng trực tiếp"
          description="Vàng trả, tiền công và khoản hoàn được ghi nhận ngay trong một lần lưu. Backend tính phần công từ dòng nguồn và kiểm tra số tiền hoàn trong phạm vi hợp lệ; ngoại tệ cần tỷ giá xác nhận."
        />
      </Form>
    </>
  );
}
export function ApproveGoodsReturnModal({
  returnId,
  close,
}: {
  returnId: string;
  close: () => void;
}) {
  const [form] = Form.useForm(),
    cache = useQueryClient(),
    { message } = App.useApp();
  const detail = useQuery({
    queryKey: ["goods-return", returnId],
    queryFn: () =>
      workflowGet<GoodsReturn>(`/customer-ledger/goods-returns/${returnId}`),
  });
  const save = useMutation({
    mutationFn: (values: object) =>
      workflowWrite(`/customer-ledger/goods-returns/${returnId}/approve`, {
        ...values,
        version: detail.data?.version,
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          "ledger",
          "ledger-entry",
          "ledger-workflow",
          "cash",
          "orders",
          "goods-return",
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
      message.success("Đã duyệt trả hàng và khoản hoàn");
      close();
    },
  });
  const currency = Form.useWatch("refund_currency", form);
  return (
    <Modal
      open
      title="Duyệt trả hàng / hoàn tiền"
      onCancel={close}
      onOk={() => form.submit()}
      confirmLoading={save.isPending}
      okText="Duyệt và ghi sổ"
      cancelText="Hủy"
      okButtonProps={{ disabled: !detail.data }}
    >
      <RequestError error={detail.error || save.error} />
      {detail.data && (
        <Alert
          type="info"
          title={`Hàng trả: ${weightText(detail.data.gold_weight_g)} · Tiền công ròng: ${currencyText(detail.data.net_labor_baht, "THB")}`}
          description={`Tổng hoàn sau quy đổi phải từ ${currencyText(detail.data.min_refund_baht, "THB")} đến ${currencyText(detail.data.max_refund_baht, "THB")}. Phần tiền công còn lại được hủy nợ chưa thu.`}
        />
      )}
      <Form
        form={form}
        layout="vertical"
        initialValues={{ refund_currency: "THB", confirmed_fx_per_baht: "1" }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="refund_amount"
          label="Tổng tiền thực tế hoàn cho khách"
          rules={[{ required: true, pattern: decimalPattern }]}
        >
          <LedgerDecimalInput />
        </Form.Item>
        <Form.Item name="refund_currency" label="Đồng tiền hoàn">
          <Select
            options={moneyOptions}
            onChange={(value) =>
              form.setFieldsValue({
                confirmed_fx_per_baht: value === "THB" ? "1" : undefined,
              })
            }
          />
        </Form.Item>
        <Form.Item
          name="confirmed_fx_per_baht"
          label="Tỷ giá hoàn (nguyên tệ / BAHT)"
          rules={[{ required: true, pattern: decimalPattern }]}
        >
          <LedgerDecimalInput readOnly={currency === "THB"} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function WorkflowReasonModal({
  title,
  url,
  version,
  extra = {},
  reasonField = "reason",
  close,
}: {
  title: string;
  url: string;
  version?: string;
  extra?: Record<string, string>;
  reasonField?: "reason" | "note";
  close: () => void;
}) {
  const [form] = Form.useForm(),
    cache = useQueryClient(),
    { message } = App.useApp();
  const save = useMutation({
    mutationFn: (values: { reason: string; local_time?: string }) =>
      workflowWrite(url, {
        ...extra,
        ...(version ? { version } : {}),
        [reasonField]: values.reason,
        ...(values.local_time
          ? { occurred_at: new Date(values.local_time).toISOString() }
          : {}),
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          "ledger",
          "ledger-entry",
          "ledger-workflow",
          "cash",
          "orders",
          "delivery-trips",
          "delivery-orders",
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
      message.success("Đã lưu lịch sử xử lý");
      close();
    },
  });
  return (
    <Modal
      open
      title={title}
      onCancel={close}
      onOk={() => form.submit()}
      confirmLoading={save.isPending}
      okText="Xác nhận"
      cancelText="Hủy"
    >
      <RequestError error={save.error} />
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          local_time: reasonField === "note" ? localNow() : undefined,
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="reason"
          label="Lý do"
          rules={[{ required: true, whitespace: true, max: 1000 }]}
        >
          <Input.TextArea />
        </Form.Item>
        {reasonField === "note" && (
          <Form.Item
            name="local_time"
            label="Thời điểm xảy ra"
            rules={[{ required: true }]}
          >
            <LedgerDateTimeInput />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
