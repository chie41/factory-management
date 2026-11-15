import { PlannedLaborInput } from "./PlannedLaborInput";
import { GoldWeightInput } from "./GoldWeightInput";
import { ProductionNumericInput } from "./ProductionNumericInput";
import { decimalPattern } from "../../utils/decimal";
import {
  grantPlannedLabor,
  inverseGrantRate,
  suggestGrantQuantity,
  wholeMoney,
} from "./grantPlannedLabor";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Typography,
} from "antd";
import { apiClient } from "../../services/apiClient";
import { RequestError } from "../../components/common/RequestError";
import { usePermissions } from "../auth/hooks/usePermissions";
import { useUnsavedProduction } from "../catalog/ProductionWorkflow";
import { laborDecimalText } from "../catalog/laborPrice";
import type { ExecutionFormContext } from "./ExecutionForm";
import { writeExecution, type Execution } from "./executionApi";

const currencyLabels: Record<string, string> = {
  VND: "VND",
  THB: "BAHT",
  LAK: "KIP",
};

type Values = {
  employee_id: string;
  gold_weight_g: string;
  labor_rate_per_15g: string | null;
  quantity?: number;
  currency?: string;
  planned_labor?: string | null;
  completed_quantity?: number;
  mode: "ADDITIONAL" | "RECEIVE";
  note?: string;
};
export function CombinedGoldForm({
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
  const issue = context.kind === "work-gold";
  const { can } = usePermissions(),
    { modal, message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [dirty, setDirty] = useState(false),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const quantityManual = useRef(false);
  const lastEditedField = useRef<"rate" | "labor">("rate");
  const request = useRef({ signature: "", id: crypto.randomUUID() });
  useUnsavedProduction(dirty);
  const stage = data.stages.find((s) => s.step_id === context.stepId)!;
  const workers = data.assignments.filter((a) => a.step_id === stage.step_id);
  const employeeId =
    Form.useWatch("employee_id", form) ?? context.assignment?.employee_id;
  const worker = workers.find((a) => a.employee_id === employeeId);
  const mode = Form.useWatch("mode", form) ?? "RECEIVE";
  const quantity = Form.useWatch("quantity", form);
  const currency =
    Form.useWatch("currency", form) ?? data.default_labor_currency;
  const gold = Form.useWatch("gold_weight_g", form);
  const quota = Math.max(
    0,
    data.planned_quantity -
      workers.reduce((n, a) => n + (a.planned_quantity ?? 0), 0),
  );
  const suggested = suggestGrantQuantity(
    gold,
    data.standard_weight_per_unit_g,
    quota,
  );
  const knownWeight =
    data.standard_weight_per_unit_g != null &&
    /[1-9]/.test(data.standard_weight_per_unit_g);
  const recalculate = (values: Values) => {
    lastEditedField.current = "rate";
    form.setFieldValue(
      "planned_labor",
      !knownWeight && values.quantity != null
        ? "0"
        : grantPlannedLabor(
            data.standard_weight_per_unit_g,
            values.quantity,
            values.labor_rate_per_15g,
          ),
    );
  };
  const changed = (changes: Partial<Values>, all: Values) => {
    setDirty(true);
    if (!issue) return;
    const values = { ...all };
    let quantityRecalculated = false;
    if ("employee_id" in changes) {
      const selected = workers.find(
        (w) => w.employee_id === values.employee_id,
      );
      values.labor_rate_per_15g =
        selected?.applied_rate ?? stage.labor_rate_per_15g ?? "";
      values.currency =
        selected?.applied_currency ?? data.default_labor_currency;
      form.setFieldsValue({
        labor_rate_per_15g: values.labor_rate_per_15g,
        currency: values.currency,
      });
    }
    if ("quantity" in changes) quantityManual.current = true;
    if ("gold_weight_g" in changes && !quantityManual.current) {
      const proposed = suggestGrantQuantity(
        values.gold_weight_g,
        data.standard_weight_per_unit_g,
        quota,
      );
      if (proposed != null) {
        quantityRecalculated = values.quantity !== proposed;
        values.quantity = proposed;
        form.setFieldValue("quantity", proposed);
      }
    }
    if ("planned_labor" in changes) {
      lastEditedField.current = "labor";
      // Never overwrite the active labor draft, including an empty input.
      // Without a positive basis, keep the rate and normalize non-empty labor on blur.
      if ((values.quantity ?? 0) === 0 || !knownWeight) return;
      const inverse = inverseGrantRate(
        data.standard_weight_per_unit_g,
        values.quantity,
        values.planned_labor,
      );
      if (inverse != null) form.setFieldValue("labor_rate_per_15g", inverse);
    } else if (
      "quantity" in changes ||
      quantityRecalculated ||
      "labor_rate_per_15g" in changes ||
      "employee_id" in changes
    )
      recalculate(values);
  };
  const recalculateQuantity = () => {
    const values = form.getFieldsValue();
    const proposed = suggestGrantQuantity(
      values.gold_weight_g,
      data.standard_weight_per_unit_g,
      quota,
    );
    if (proposed == null) return;
    quantityManual.current = false;
    setDirty(true);
    form.setFieldValue("quantity", proposed);
    recalculate({ ...values, quantity: proposed });
  };
  const remaining = Math.max(
    0,
    (worker?.planned_quantity ?? 0) - (worker?.completed_quantity ?? 0),
  );
  const canOutput =
    can("production.output.manage") && stage.execution_status === "IN_PROGRESS";
  const staff = useQuery({
    queryKey: ["production-employees", q, page],
    enabled: issue && can("employees.read"),
    queryFn: async () =>
      (
        await apiClient.get<{
          data: { id: string; code: string; name: string }[];
          meta: { total: number };
        }>("/employees", {
          params: { q, page, page_size: 30, status: "ACTIVE" },
        })
      ).data,
  });
  const options = new Map(
    workers.map((a) => [
      a.employee_id,
      {
        value: a.employee_id,
        label: a.employee_code + " · " + a.employee_name,
      },
    ]),
  );
  if (issue)
    for (const e of staff.data?.data ?? [])
      options.set(e.id, { value: e.id, label: e.code + " · " + e.name });
  const save = useMutation({
    mutationFn: async (values: Values) => {
      const payload = {
        employee_id: values.employee_id,
        gold_weight_g: String(values.gold_weight_g ?? "0"),
        note: values.note,
        ...(issue
          ? {
              quantity: values.quantity,
              ...((values.quantity ?? 0) > 0
                ? {
                    labor_rate_per_15g: values.labor_rate_per_15g,
                    currency: values.currency,
                    planned_labor:
                      wholeMoney(values.planned_labor) ?? undefined,
                    pricing_mode:
                      lastEditedField.current === "labor" ? "AMOUNT" : "RATE",
                  }
                : { planned_labor: "0" }),
            }
          : {
              mode: values.mode,
              completed_quantity:
                values.mode === "RECEIVE"
                  ? (values.completed_quantity ?? 0)
                  : 0,
            }),
        version: data.version,
      };
      const signature = JSON.stringify(payload);
      if (signature !== request.current.signature)
        request.current = { signature, id: crypto.randomUUID() };
      return writeExecution(
        id,
        "stages/" + stage.step_id + (issue ? "/work-gold" : "/gold-receipts"),
        { ...payload, request_id: request.current.id },
      );
    },
    onSuccess: async () => {
      setDirty(false);
      message.success("Đã ghi nhận");
      close();
      await saved();
    },
  });
  const cancel = () =>
    dirty
      ? modal.confirm({
          title: "Bỏ thông tin chưa lưu?",
          okText: "Bỏ thay đổi",
          cancelText: "Tiếp tục nhập",
          onOk: close,
        })
      : close();
  return (
    <Modal
      open
      title={issue ? "Giao việc / Giao vàng" : "Giao bổ sung / Nhận vàng"}
      width={issue ? 520 : 540}
      style={{ maxWidth: "calc(100vw - 24px)" }}
      onCancel={cancel}
      maskClosable={false}
      closable={!save.isPending}
      footer={
        <Space>
          <Button disabled={save.isPending} onClick={cancel}>
            Hủy
          </Button>
          <Button
            type="primary"
            loading={save.isPending}
            disabled={issue && (quantity ?? 0) > 0 && !knownWeight}
            onClick={() => form.submit()}
          >
            Xác nhận
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        {stage.name}
        {worker ? " · " + worker.employee_name : " · Ghi nhận cùng một lượt"}
      </Typography.Paragraph>
      <Alert
        type="info"
        showIcon={false}
        style={{ marginBottom: 16 }}
        title={
          issue
            ? `Đã giao ${worker?.planned_quantity ?? 0} SP · Xong ${worker?.completed_quantity ?? 0} SP · Vàng giao / nhận: ${laborDecimalText(worker?.gold_issued_g ?? "0")} / ${laborDecimalText(worker?.gold_received_g ?? "0")} g`
            : `Vàng đã giao: ${laborDecimalText(worker?.gold_issued_g ?? "0")} g · Đã nhận: ${laborDecimalText(worker?.gold_received_g ?? "0")} g`
        }
      />
      <RequestError error={save.error} />
      <RequestError error={staff.error} retry={() => void staff.refetch()} />
      <Form
        form={form}
        layout="vertical"
        disabled={save.isPending}
        initialValues={{
          employee_id: context.assignment?.employee_id,
          gold_weight_g: issue ? undefined : "0",
          labor_rate_per_15g:
            context.assignment?.applied_rate ?? stage.labor_rate_per_15g,
          quantity: 0,
          currency:
            context.assignment?.applied_currency ?? data.default_labor_currency,
          planned_labor: "0",
          completed_quantity: 0,
          mode: "RECEIVE",
        }}
        onValuesChange={changed}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="employee_id"
          label="Nhân viên"
          rules={[
            { required: true, message: "Chọn nhân viên" },
            {
              validator: (_, value) =>
                workers.find((w) => w.employee_id === value)
                  ?.reconciliation_status === "CLOSED"
                  ? Promise.reject(
                      new Error("Cần mở lại đối soát trước khi ghi nhận"),
                    )
                  : Promise.resolve(),
            },
          ]}
        >
          <Select
            disabled={!!context.assignment || save.isPending}
            options={[...options.values()]}
            placeholder="Chọn nhân viên"
            loading={staff.isFetching}
            showSearch={
              issue
                ? {
                    filterOption: false,
                    onSearch: (text) => {
                      setQ(text);
                      setPage(1);
                    },
                  }
                : true
            }
            popupRender={(menu) => (
              <>
                {menu}
                {issue && (
                  <Space style={{ padding: 8 }}>
                    <Button
                      size="small"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Trước
                    </Button>
                    <Button
                      size="small"
                      disabled={page * 30 >= (staff.data?.meta.total ?? 0)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Sau
                    </Button>
                  </Space>
                )}
              </>
            )}
          />
        </Form.Item>
        {!issue && (
          <Form.Item name="mode">
            <Segmented
              block
              options={[
                { label: "Giao bổ sung", value: "ADDITIONAL" },
                { label: "Nhận vàng", value: "RECEIVE" },
              ]}
              onChange={() => form.setFieldValue("completed_quantity", 0)}
            />
          </Form.Item>
        )}
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label={
                issue || mode === "ADDITIONAL"
                  ? "Vàng giao (g)"
                  : "Vàng nhận (g)"
              }
              name="gold_weight_g"
              dependencies={["completed_quantity", "mode", "quantity"]}
              rules={[
                { required: !issue, message: "Nhập trọng lượng" },
                {
                  validator: (_, value) => {
                    const text = String(value ?? "");
                    if (issue && text === "")
                      return form.getFieldValue("quantity") > 0
                        ? Promise.resolve()
                        : Promise.reject(new Error("Nhập vàng giao hoặc số sản phẩm giao thêm"));
                    if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(text))
                      return Promise.reject(
                        new Error("Nhập số không âm, tối đa 2 số thập phân"),
                      );
                    const positive = /[1-9]/.test(text);
                    if (positive && !can("production.materials.manage"))
                      return Promise.reject(
                        new Error("Bạn chưa có quyền giao/nhận nguyên liệu"),
                      );
                    if (
                      issue &&
                      !positive &&
                      !(form.getFieldValue("quantity") > 0)
                    )
                      return Promise.reject(
                        new Error("Nhập vàng giao hoặc số sản phẩm giao thêm"),
                      );
                    if (
                      !issue &&
                      !positive &&
                      (mode === "ADDITIONAL" ||
                        !(form.getFieldValue("completed_quantity") > 0))
                    )
                      return Promise.reject(
                        new Error("Nhập trọng lượng hoặc sản lượng nhận"),
                      );
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <GoldWeightInput />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            {issue ? (
              <Form.Item
                label="Số lượng sản phẩm giao thêm"
                name="quantity"
                extra={
                  <Space wrap size={4}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {suggested == null
                        ? knownWeight
                          ? "Nhập vàng để gợi ý số lượng, hoặc nhập số lượng thủ công."
                          : "Thiếu trọng lượng chuẩn, nhập số lượng thủ công."
                        : `Gợi ý: ${suggested} SP · Còn có thể giao ${quota} SP`}
                    </Typography.Text>
                    <Button
                      type="link"
                      size="small"
                      disabled={suggested == null || save.isPending}
                      onClick={recalculateQuantity}
                    >
                      Tính lại
                    </Button>
                  </Space>
                }
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
            ) : (
              mode === "RECEIVE" && (
                <Form.Item
                  label="Số lượng hoàn thành thêm"
                  name="completed_quantity"
                  rules={[
                    {
                      type: "integer",
                      min: 0,
                      max: remaining,
                      message: `Không vượt quá ${remaining} SP còn lại`,
                    },
                  ]}
                  extra={
                    !canOutput
                      ? "Ghi sản lượng khi công đoạn đang thực hiện và có quyền ghi nhận."
                      : undefined
                  }
                >
                  <InputNumber
                    min={0}
                    max={remaining}
                    precision={0}
                    disabled={!canOutput || save.isPending}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              )
            )}
          </Col>
        </Row>
        {issue && (
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
                        !(form.getFieldValue("quantity") > 0) ||
                        (typeof value === "string" &&
                          decimalPattern.test(value))
                          ? Promise.resolve()
                          : Promise.reject(
                              new Error(
                                "Thiết lập đơn giá không âm, tối đa 4 số lẻ",
                              ),
                            ),
                    },
                  ]}
                >
                  <ProductionNumericInput precision={4} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item
                  name="currency"
                  label="Tiền tệ"
                  rules={[
                    { required: (quantity ?? 0) > 0, message: "Chọn tiền tệ" },
                  ]}
                >
                  <Select
                    options={[
                      { value: "VND", label: "VND" },
                      { value: "THB", label: "BAHT" },
                      { value: "LAK", label: "KIP" },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="planned_labor"
              label={`Tiền công dự kiến${currency ? " (" + (currencyLabels[currency] ?? currency) + ")" : ""}`}
              dependencies={["quantity"]}
              rules={[
                {
                  validator: (_, value) =>
                    (form.getFieldValue("quantity") ?? 0) === 0 ||
                    wholeMoney(value) != null
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error("Nhập tiền công không âm hợp lệ"),
                        ),
                },
              ]}
              extra={
                !knownWeight
                  ? "Thiếu trọng lượng chuẩn một sản phẩm; có thể giao vàng với số lượng SP bằng 0."
                  : "Tính từ trọng lượng chuẩn × SP giao thêm × đơn giá / 15. Sửa tiền công sẽ tính ngược đơn giá; làm tròn HALF_UP về số nguyên."
              }
            >
              <PlannedLaborInput
                onBlur={() => {
                  const current = form.getFieldValue("planned_labor");
                  if (
                    ((form.getFieldValue("quantity") ?? 0) === 0 ||
                      !knownWeight) &&
                    current != null &&
                    current !== ""
                  )
                    form.setFieldValue("planned_labor", "0");
                }}
              />
            </Form.Item>
          </>
        )}
        <Form.Item label="Ghi chú" name="note">
          <Input.TextArea
            maxLength={10000}
            autoSize={{ minRows: 2, maxRows: 5 }}
            placeholder="Nhập ghi chú (nếu có)"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
