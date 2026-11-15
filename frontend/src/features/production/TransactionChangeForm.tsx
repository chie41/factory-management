import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
} from "antd";
import { RequestError } from "../../components/common/RequestError";
import { fixedDecimalText, decimalPattern } from "../../utils/decimal";
import { LaborPriceInput } from "../catalog/LaborPriceInput";
import { useUnsavedProduction } from "../catalog/ProductionWorkflow";
import { usePermissions } from "../auth/hooks/usePermissions";
import { GoldWeightInput } from "./GoldWeightInput";
import {
  grantPlannedLabor,
  inverseGrantRate,
  wholeMoney,
} from "./grantPlannedLabor";
import {
  writeExecution,
  type Execution,
  type ExecutionTransaction,
  type TransactionState,
} from "./executionApi";
import type { ExecutionFormContext } from "./ExecutionForm";
export const transactionLabel = (t: ExecutionTransaction) =>
  t.has_work && t.has_gold
    ? "Giao việc & giao vàng"
    : t.has_work
      ? "Giao thêm việc"
      : t.kind === "ISSUE"
        ? "Giao vàng"
        : t.has_output && t.has_gold
          ? "Nhận vàng & sản phẩm"
          : t.kind === "OUTPUT"
            ? "Nhận sản phẩm"
            : "Nhận vàng";
export function transactionSummary(state: TransactionState) {
  return `${state.quantity} SP giao · ${state.completed_quantity} SP xong · ${fixedDecimalText(state.gold_weight_g, 2)} g vàng · ${state.planned_labor == null ? "Chưa đủ dữ liệu công" : fixedDecimalText(state.planned_labor, 0) + " " + state.currency}`;
}
type Values = {
  quantity: number;
  completed_quantity: number;
  gold_weight_g: string;
  labor_rate_per_15g: string | null;
  planned_labor: string | null;
  currency: string;
  reason: string;
};
export function TransactionChangeForm({
  id,
  data,
  context,
  close,
  saved,
}: {
  id: string;
  data: Execution;
  context: ExecutionFormContext;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const t = context.transaction!,
    before = t.state;
  const [form] = Form.useForm<Values>(),
    [dirty, setDirty] = useState(false);
  const { can } = usePermissions(),
    { modal, message } = App.useApp();
  const workDirty = useRef(false),
    goldDirty = useRef(false),
    outputDirty = useRef(false),
    pricingMode = useRef<"RATE" | "AMOUNT">("RATE");
  const request = useRef({ signature: "", id: crypto.randomUUID() });
  useUnsavedProduction(dirty);
  const quantity = Form.useWatch("quantity", form) ?? before.quantity,
    currency = Form.useWatch("currency", form) ?? before.currency;
  const worker = data.assignments.find((a) => a.id === t.assignment_id);
  const quota =
    data.planned_quantity -
    data.assignments
      .filter((a) => a.step_id === t.step_id)
      .reduce((n, a) => n + (a.planned_quantity ?? 0), 0) +
    before.quantity;
  const maxOutput = Math.max(
    0,
    (worker?.planned_quantity ?? 0) -
      (worker?.completed_quantity ?? 0) +
      before.completed_quantity,
  );
  const changes = (changed: Partial<Values>, values: Values) => {
    setDirty(true);
    if ("gold_weight_g" in changed) goldDirty.current = true;
    if ("completed_quantity" in changed) outputDirty.current = true;
    if (
      "quantity" in changed ||
      "currency" in changed ||
      "labor_rate_per_15g" in changed ||
      "planned_labor" in changed
    )
      workDirty.current = true;
    if ("planned_labor" in changed) {
      if (values.quantity === 0) {
        form.setFieldValue("planned_labor", "0");
        return;
      }
      const inverse = inverseGrantRate(
        data.standard_weight_per_unit_g,
        values.quantity,
        values.planned_labor,
      );
      if (inverse != null) form.setFieldValue("labor_rate_per_15g", inverse);
      pricingMode.current = "AMOUNT";
    } else if ("quantity" in changed || "labor_rate_per_15g" in changed) {
      form.setFieldValue(
        "planned_labor",
        grantPlannedLabor(
          data.standard_weight_per_unit_g,
          values.quantity,
          values.labor_rate_per_15g,
        ),
      );
      pricingMode.current = "RATE";
    }
  };
  const save = useMutation({
    mutationFn: async (values: Values) => {
      const payload = {
        version: data.version,
        transaction_version: t.transaction_version,
        reason: values.reason.trim(),
        ...{
          ...(workDirty.current
            ? {
                quantity: values.quantity,
                labor_rate_per_15g: values.labor_rate_per_15g ?? undefined,
                currency: values.currency,
                planned_labor: wholeMoney(values.planned_labor) ?? undefined,
                pricing_mode: pricingMode.current,
              }
            : {}),
          ...(goldDirty.current ? { gold_weight_g: values.gold_weight_g } : {}),
          ...(outputDirty.current
            ? { completed_quantity: values.completed_quantity }
            : {}),
        },
      };
      const signature = JSON.stringify(payload);
      if (signature !== request.current.signature)
        request.current = { signature, id: crypto.randomUUID() };
      return writeExecution(id, "transactions/" + t.id + "/edit", {
        ...payload,
        request_id: request.current.id,
      });
    },
    onSuccess: async () => {
      setDirty(false);
      await saved();
      message.success("Đã sửa giao dịch và cập nhật tổng hợp");
      close();
    },
  });
  const cancel = () =>
    dirty
      ? modal.confirm({
          title: "Bỏ thay đổi chưa lưu?",
          okText: "Bỏ thay đổi",
          cancelText: "Tiếp tục sửa",
          onOk: close,
        })
      : close();
  return (
    <Modal
      open
      title="Sửa giao dịch"
      width={560}
      style={{ maxWidth: "calc(100vw - 24px)" }}
      maskClosable={false}
      onCancel={cancel}
      closable={!save.isPending}
      footer={
        <Space>
          <Button disabled={save.isPending} onClick={cancel}>
            Đóng
          </Button>
          <Button
            type="primary"
            loading={save.isPending}
            disabled={!!t.blocked_reason || before.voided}
            onClick={() => form.submit()}
          >
            Lưu điều chỉnh
          </Button>
        </Space>
      }
    >
      <Descriptions
        size="small"
        column={1}
        items={[
          {
            key: "type",
            label: "Loại giao dịch",
            children: transactionLabel(t),
          },
          { key: "worker", label: "Nhân viên", children: t.employee_name },
          {
            key: "at",
            label: "Thời gian",
            children: new Date(t.occurred_at).toLocaleString("vi-VN"),
          },
          {
            key: "summary",
            label: "Giá trị hiện tại",
            children: transactionSummary(before),
          },
        ]}
      />
      {t.blocked_reason && <Alert type="error" title={t.blocked_reason} />}
      <RequestError error={save.error} />
      <Form
        form={form}
        layout="vertical"
        disabled={save.isPending}
        initialValues={{
          quantity: before.quantity,
          completed_quantity: before.completed_quantity,
          gold_weight_g: before.gold_weight_g,
          labor_rate_per_15g: before.rate,
          planned_labor: before.planned_labor,
          currency: before.currency,
        }}
        onValuesChange={changes}
        onFinish={(values) => save.mutate(values)}
        style={{ marginTop: 16 }}
      >
        {
          <>
            <Row gutter={16}>
              {t.has_gold && (
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="gold_weight_g"
                    label={
                      t.kind === "RECEIPT" ? "Vàng nhận (g)" : "Vàng giao (g)"
                    }
                    rules={[{ required: true, message: "Nhập trọng lượng" }]}
                  >
                    <GoldWeightInput />
                  </Form.Item>
                </Col>
              )}
              {t.has_work && (
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="quantity"
                    label="Số SP trong lượt giao này"
                    rules={[
                      { required: true, message: "Nhập số lượng" },
                      {
                        type: "integer",
                        min: 0,
                        max: quota,
                        message: `Số lượng từ 0 đến ${quota}`,
                      },
                    ]}
                  >
                    <InputNumber
                      min={0}
                      max={quota}
                      precision={0}
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>
              )}
              {(t.has_output || t.kind === "RECEIPT") && (
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="completed_quantity"
                    label="SP hoàn thành trong lần nhận"
                    rules={[
                      { required: true, message: "Nhập số lượng" },
                      {
                        type: "integer",
                        min: 0,
                        max: maxOutput,
                        message: `Không vượt quá ${maxOutput} SP`,
                      },
                    ]}
                    extra={
                      !can("production.output.manage")
                        ? "Chưa có quyền điều chỉnh sản lượng"
                        : undefined
                    }
                  >
                    <InputNumber
                      min={0}
                      max={maxOutput}
                      precision={0}
                      disabled={
                        !can("production.output.manage") || save.isPending
                      }
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>
              )}
            </Row>
            {t.has_work && (
              <>
                <Row gutter={16}>
                  <Col xs={24} sm={16}>
                    <Form.Item
                      name="labor_rate_per_15g"
                      label="Đơn giá công / 15g"
                      dependencies={["quantity"]}
                      rules={[
                        {
                          validator: (_, value) =>
                            quantity === 0 ||
                            (typeof value === "string" &&
                              decimalPattern.test(value))
                              ? Promise.resolve()
                              : Promise.reject(
                                  new Error(
                                    "Nhập đơn giá không âm, tối đa 4 số lẻ",
                                  ),
                                ),
                        },
                      ]}
                    >
                      <LaborPriceInput />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item
                      name="currency"
                      label="Tiền tệ"
                      rules={[{ required: true, message: "Chọn tiền tệ" }]}
                    >
                      <Select
                        options={["THB", "VND", "LAK"].map((value) => ({
                          value,
                          label: value,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item
                  name="planned_labor"
                  label={`Tiền công lượt giao (${currency})`}
                  dependencies={["quantity"]}
                  rules={[
                    {
                      validator: (_, value) =>
                        quantity === 0 || wholeMoney(value) != null
                          ? Promise.resolve()
                          : Promise.reject(
                              new Error("Nhập tiền công không âm"),
                            ),
                    },
                  ]}
                >
                  <GoldWeightInput
                    precision={0}
                    disabled={quantity === 0 || save.isPending}
                  />
                </Form.Item>
              </>
            )}
          </>
        }
        <Form.Item
          name="reason"
          label="Lý do sửa"
          rules={[
            {
              required: true,
              whitespace: true,
              message: "Bắt buộc nhập lý do",
            },
          ]}
        >
          <Input.TextArea
            maxLength={10000}
            autoSize={{ minRows: 2, maxRows: 5 }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
