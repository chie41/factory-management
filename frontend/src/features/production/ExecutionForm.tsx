import { TransactionChangeForm } from "./TransactionChangeForm";
import { GoldWeightInput } from "./GoldWeightInput";
import { CombinedGoldForm } from "./CombinedGoldForm";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
} from "antd";
import { apiClient } from "../../services/apiClient";
import { RequestError } from "../../components/common/RequestError";
import { LaborPriceInput } from "../catalog/LaborPriceInput";
import { useUnsavedProduction } from "../catalog/ProductionWorkflow";
import { usePermissions } from "../auth/hooks/usePermissions";
import {
  writeExecution,
  movementKinds,
  type Execution,
  type Assignment,
  type ExecutionEntry,
  type ExecutionTransaction,
} from "./executionApi";
export type ExecutionFormKind =
  | "stage"
  | "assignment"
  | "output"
  | "material"
  | "transfer"
  | "loss"
  | "labor"
  | "reverse";
export type ExecutionFormContext = {
  kind:
    | ExecutionFormKind
    | "reconcile"
    | "work-gold"
    | "gold-receipt"
    | "transaction-edit";
  transaction?: ExecutionTransaction;
  add?: boolean;
  stepId?: string;
  action?: string;
  assignment?: Assignment;
  entry?: ExecutionEntry;
  adjust?: boolean;
};
const titles: Record<ExecutionFormContext["kind"], string> = {
  "transaction-edit": "Sửa giao dịch",
  "work-gold": "Giao việc / Giao vàng",
  "gold-receipt": "Giao bổ sung / Nhận vàng",
  reconcile: "Chốt / mở lại đối soát",
  stage: "Thao tác công đoạn",
  assignment: "Phân công nhân viên",
  output: "Ghi nhận sản lượng",
  material: "Giao/nhận nguyên liệu",
  transfer: "Chuyển nguyên liệu nội bộ",
  loss: "Ghi nhận / điều chỉnh hao hụt",
  labor: "Ghi nhận / điều chỉnh tiền công",
  reverse: "Đảo bút toán nguyên liệu",
};
function localInput(value?: string) {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function ExecutionForm(props: {
  id: string;
  data: Execution;
  context: ExecutionFormContext;
  close: () => void;
  saved: () => Promise<void>;
}) {
  if (props.context.kind === "transaction-edit")
    return <TransactionChangeForm {...props} />;
  return ["work-gold", "gold-receipt"].includes(props.context.kind) ? (
    <CombinedGoldForm {...props} />
  ) : (
    <LegacyExecutionForm {...props} />
  );
}
function LegacyExecutionForm({
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
  const { can } = usePermissions();
  const [form] = Form.useForm(),
    { modal, message } = App.useApp(),
    [dirty, setDirty] = useState(false),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const request = useRef({ signature: "", id: crypto.randomUUID() });
  useUnsavedProduction(dirty);
  const step =
      Form.useWatch("step_id", form) ??
      context.stepId ??
      data.stages[0]?.step_id,
    toStep = Form.useWatch("to_step_id", form),
    materialType = Form.useWatch(["material", "material_type"], form);
  const stage = data.stages.find((s) => s.step_id === step),
    kind = context.kind,
    entry = context.entry;
  const selectedEmployee = Form.useWatch("employee_id", form);
  const employees = useQuery({
    queryKey: ["production-employees", q, page],
    queryFn: async () =>
      (
        await apiClient.get<{
          data: { id: string; name: string; code: string }[];
          meta: { total: number };
        }>("/employees", {
          params: { q, page, page_size: 30, status: "ACTIVE" },
        })
      ).data,
    enabled: kind === "assignment" && can("employees.read"),
  });
  const assignmentOptions = data.assignments
    .filter((a) => a.step_id === step)
    .map((a) => ({
      value: a.employee_id,
      label: a.employee_name + " · " + a.employee_code,
    }));
  const staffOptions = (employees.data?.data ?? []).map((e) => ({
    value: e.id,
    label: e.code + " · " + e.name,
  }));
  if (
    context.assignment &&
    !staffOptions.some((e) => e.value === context.assignment!.employee_id)
  )
    staffOptions.push({
      value: context.assignment.employee_id,
      label: context.assignment.employee_name,
    });
  const save = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const stamp = (value: string) => new Date(value).toISOString();
      let path = "",
        payload: Record<string, unknown> = {};
      const stepId = values.step_id;
      if (kind === "reconcile") {
        path = "stages/" + stepId + "/reconciliation";
        payload = {
          employee_id: context.assignment!.employee_id,
          action: context.action,
          reason: values.reason,
          materials_reviewed: values.materials_reviewed ?? false,
        };
      }
      if (kind === "stage") {
        path = "stages/" + stepId + "/action";
        payload = { action: context.action, reason: values.reason };
      }
      if (kind === "assignment") {
        path = "stages/" + stepId + "/assignments";
        payload = {
          employee_id: values.employee_id,
          planned_quantity: values.planned_quantity ?? null,
          quantity_mode: context.add ? "ADD" : "SET",
          assigned_at: stamp(values.assigned_at),
          status: values.status,
          note: values.note,
        };
      }
      if (kind === "output") {
        path = "stages/" + stepId + "/outputs";
        payload = {
          work_reference: values.work_reference,
          quantity: values.quantity,
          assignment_ids: values.assignment_ids,
          occurred_at: stamp(values.occurred_at),
          note: values.note,
        };
      }
      if (kind === "material" || kind === "transfer") {
        path =
          "stages/" +
          stepId +
          "/" +
          (kind === "transfer" ? "transfers" : "materials");
        payload = {
          employee_id: values.employee_id,
          material: values.material,
          quantity: values.quantity,
          kind: kind === "transfer" ? "INITIAL" : values.kind,
          occurred_at: stamp(values.occurred_at),
          note: values.note,
          ...(kind === "transfer"
            ? {
                to_step_id: values.to_step_id,
                to_employee_id: values.to_employee_id,
              }
            : {}),
        };
      }
      if (kind === "loss") {
        path = "stages/" + stepId + "/losses";
        payload = {
          employee_id: values.employee_id,
          material: values.material,
          quantity: values.quantity,
          direction: context.adjust ? "DECREASE" : "INCREASE",
          ...(context.adjust ? { adjusts_id: entry!.id } : {}),
          occurred_at: stamp(values.occurred_at),
          reason: values.reason,
        };
      }
      if (kind === "labor") {
        path = "stages/" + stepId + "/labor";
        payload = {
          employee_id: values.employee_id,
          amount: values.amount,
          direction: context.adjust ? "DECREASE" : "INCREASE",
          ...(context.adjust ? { adjusts_id: entry!.id } : {}),
          ...(values.output_id ? { output_id: values.output_id } : {}),
          rate_per_15g: values.rate_per_15g ?? null,
          calculation_note: values.calculation_note,
          occurred_at: stamp(values.occurred_at),
        };
      }
      if (kind === "reverse") {
        path = "material-reversals";
        payload = { movement_id: entry!.id, reason: values.reason };
      }
      const signature = JSON.stringify({
        path,
        payload,
        version: data.version,
      });
      if (request.current.signature !== signature)
        request.current = { signature, id: crypto.randomUUID() };
      return writeExecution(id, path, {
        ...payload,
        version: data.version,
        request_id: request.current.id,
      });
    },
    onSuccess: async () => {
      await saved();
      message.success("Đã ghi nhận nghiệp vụ sản xuất");
      close();
    },
  });
  const cancel = () => {
    if (save.isPending) return;
    if (dirty)
      modal.confirm({
        title: "Bỏ thông tin chưa lưu?",
        okText: "Bỏ thay đổi",
        cancelText: "Tiếp tục nhập",
        onOk: close,
      });
    else close();
  };
  const locked = !!context.assignment || !!entry || kind === "stage";
  const required = [{ required: true, message: "Nhập/chọn thông tin" }];
  const initial = {
    step_id: context.stepId ?? entry?.step_id ?? data.stages[0]?.step_id,
    employee_id: context.assignment?.employee_id ?? entry?.employee_id,
    planned_quantity: context.add
      ? null
      : (context.assignment?.planned_quantity ?? null),
    assignment_ids: context.assignment ? [context.assignment.id] : [],
    status: context.assignment?.status ?? "ACTIVE",
    assigned_at: localInput(
      context.add ? undefined : context.assignment?.assigned_at,
    ),
    occurred_at: localInput(),
    note: context.assignment?.note ?? "",
    quantity: kind === "output" ? 1 : undefined,
    kind: "INITIAL",
    material: {
      material_type: entry?.material_type ?? "GOLD",
      material_name: entry?.material_name ?? "Vàng",
      unit: entry?.unit ?? "G",
    },
    rate_per_15g: stage?.labor_rate_per_15g ?? null,
  };
  return (
    <Modal
      open
      width={700}
      title={titles[kind] + (context.adjust ? " · Ghi giảm" : "")}
      onCancel={cancel}
      maskClosable={false}
      closable={!save.isPending}
      styles={{ body: { maxHeight: "70dvh", overflowY: "auto" } }}
      footer={
        <Space>
          <Button disabled={save.isPending} onClick={cancel}>
            Hủy
          </Button>
          <Button
            type="primary"
            loading={save.isPending}
            onClick={() => form.submit()}
          >
            Ghi nhận
          </Button>
        </Space>
      }
    >
      <RequestError error={save.error} />
      {kind === "assignment" && (
        <RequestError
          error={employees.error}
          retry={() => void employees.refetch()}
        />
      )}
      {kind === "output" && (
        <Alert
          type="info"
          title="Mỗi phiếu ghi sản lượng cho một nhân viên, không vượt số lượng đã giao. Sản lượng công đoạn chỉ cộng một lần."
        />
      )}
      {kind === "labor" && (
        <Alert
          type="info"
          title="Tiền công trả thợ nhập thủ công theo căn cứ thực tế. Đơn giá chỉ để tham chiếu; chưa tự tính lương, duyệt/chốt hoặc chi tiền."
        />
      )}
      {kind === "reverse" && (
        <Alert
          type="warning"
          title="Đảo bằng bút toán đối ứng, giữ nguyên lịch sử. Với chuyển nội bộ, cả hai vế được đảo cùng transaction."
        />
      )}
      <Form
        form={form}
        layout="vertical"
        disabled={save.isPending}
        initialValues={initial}
        onValuesChange={(changed) => {
          setDirty(true);
          if (changed.employee_id)
            form.setFieldsValue({ output_id: undefined });
          if (changed.step_id) {
            form.setFieldsValue({
              employee_id: undefined,
              assignment_ids: [],
              output_id: undefined,
              rate_per_15g:
                data.stages.find((s) => s.step_id === changed.step_id)
                  ?.labor_rate_per_15g ?? null,
            });
          }
          if (changed.material?.material_type) {
            const type = changed.material.material_type;
            form.setFieldsValue({
              material: {
                material_type: type,
                material_name: {
                  GOLD: "Vàng",
                  SILVER: "Bạc",
                  GEM: "Đá quý",
                  OTHER: "Nguyên liệu khác",
                }[type as string],
                unit: ["GOLD", "SILVER"].includes(type) ? "G" : "PCS",
              },
            });
          }
        }}
        onFinish={(values) => save.mutate(values)}
      >
        {kind !== "reverse" && (
          <Form.Item name="step_id" label="Công đoạn" rules={required}>
            <Select
              disabled={locked}
              options={data.stages.map((s) => ({
                value: s.step_id,
                label: s.name,
              }))}
            />
          </Form.Item>
        )}
        {kind === "stage" && (
          <>
            <Alert
              type="info"
              title={
                {
                  START: "Bắt đầu công đoạn",
                  PAUSE: "Tạm dừng công đoạn",
                  RESUME: "Tiếp tục công đoạn",
                  COMPLETE: "Xác nhận hoàn thành công đoạn",
                }[context.action ?? ""]
              }
            />
            <Form.Item
              name="reason"
              label="Lý do / ghi chú thực thi"
              rules={required}
            >
              <Input.TextArea maxLength={1000} />
            </Form.Item>
          </>
        )}
        {!["stage", "output", "reverse", "reconcile"].includes(kind) && (
          <Form.Item name="employee_id" label="Nhân viên" rules={required}>
            <Select
              disabled={!!context.assignment || !!entry}
              showSearch={{
                filterOption: kind !== "assignment",
                ...(kind === "assignment"
                  ? {
                      onSearch: (text: string) => {
                        setQ(text);
                        setPage(1);
                      },
                    }
                  : {}),
              }}
              optionFilterProp="label"
              options={kind === "assignment" ? staffOptions : assignmentOptions}
              popupRender={
                kind === "assignment"
                  ? (menu) => (
                      <>
                        {menu}
                        <Space>
                          <Button
                            size="small"
                            disabled={page === 1}
                            onClick={() => setPage((p) => p - 1)}
                          >
                            Trước
                          </Button>
                          <Button
                            size="small"
                            disabled={
                              page * 30 >= (employees.data?.meta.total ?? 0)
                            }
                            onClick={() => setPage((p) => p + 1)}
                          >
                            Sau
                          </Button>
                        </Space>
                      </>
                    )
                  : undefined
              }
            />
          </Form.Item>
        )}
        {kind === "assignment" && (
          <>
            <Form.Item
              name="planned_quantity"
              label={context.add ? "Số lượng giao thêm" : "Tổng số lượng giao"}
              rules={required}
            >
              <InputNumber min={1} max={data.planned_quantity} precision={0} />
            </Form.Item>
            <Form.Item
              name="status"
              label="Trạng thái phân công"
              rules={required}
            >
              <Select
                options={[
                  { value: "ACTIVE", label: "Đang phân công" },
                  { value: "COMPLETED", label: "Đã hoàn thành phân công" },
                  { value: "CANCELLED", label: "Ngừng phân công" },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="assigned_at"
              label="Thời điểm phân công"
              rules={required}
            >
              <Input type="datetime-local" />
            </Form.Item>
          </>
        )}
        {kind === "output" && (
          <>
            <Form.Item
              name="work_reference"
              label="Mã phiếu sản lượng / phần việc (không trùng trong công đoạn)"
              rules={required}
            >
              <Input maxLength={160} />
            </Form.Item>
            <Form.Item
              name="quantity"
              label="Sản lượng hoàn thành"
              rules={required}
            >
              <InputNumber
                min={1}
                max={stage?.remaining_quantity ?? data.planned_quantity}
                precision={0}
              />
            </Form.Item>
            <Form.Item
              name="assignment_ids"
              label="Nhân viên cùng tham gia"
              rules={required}
            >
              <Select
                mode="multiple"
                maxCount={1}
                options={data.assignments
                  .filter((a) => a.step_id === step && a.status === "ACTIVE")
                  .map((a) => ({ value: a.id, label: a.employee_name }))}
              />
            </Form.Item>
          </>
        )}
        {kind === "material" && (
          <Form.Item name="kind" label="Loại giao/nhận" rules={required}>
            <Select
              options={[
                "INITIAL",
                "ADDITIONAL",
                "RETURN_TOTAL",
                "RETURN_UNUSED",
                "RECEIVE_PRODUCT",
              ].map((value) => ({ value, label: movementKinds[value] }))}
            />
          </Form.Item>
        )}
        {["material", "transfer", "loss"].includes(kind) && (
          <>
            <Form.Item
              name={["material", "material_type"]}
              label="Loại nguyên liệu"
              rules={required}
            >
              <Select
                disabled={!!entry}
                options={[
                  { value: "GOLD", label: "Vàng" },
                  { value: "SILVER", label: "Bạc" },
                  { value: "GEM", label: "Đá quý" },
                  { value: "OTHER", label: "Khác" },
                ]}
              />
            </Form.Item>
            <Form.Item
              name={["material", "material_name"]}
              label="Tên / phân loại nguyên liệu"
              rules={required}
            >
              <Input disabled={!!entry} maxLength={120} />
            </Form.Item>
            <Form.Item
              name={["material", "unit"]}
              label="Đơn vị"
              rules={required}
            >
              <Select
                disabled={
                  !!entry || ["GOLD", "SILVER"].includes(materialType ?? "GOLD")
                }
                options={[
                  { value: "G", label: "Gram (g)" },
                  { value: "PCS", label: "Viên / cái" },
                  { value: "CARAT", label: "Carat" },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="quantity"
              label={
                kind === "loss"
                  ? "Số lượng hao hụt ghi nhận / điều chỉnh"
                  : "Trọng lượng / số lượng"
              }
              rules={required}
            >
              {materialType === "GOLD" && kind !== "loss" ? (
                <GoldWeightInput />
              ) : (
                <LaborPriceInput />
              )}
            </Form.Item>
          </>
        )}
        {kind === "transfer" && (
          <>
            <Form.Item
              name="to_step_id"
              label="Công đoạn nhận"
              rules={required}
            >
              <Select
                options={data.stages.map((s) => ({
                  value: s.step_id,
                  label: s.name,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="to_employee_id"
              label="Nhân viên nhận"
              rules={required}
            >
              <Select
                options={data.assignments
                  .filter(
                    (a) => a.step_id === toStep && a.status !== "CANCELLED",
                  )
                  .map((a) => ({
                    value: a.employee_id,
                    label: a.employee_name,
                  }))}
              />
            </Form.Item>
          </>
        )}
        {kind === "labor" && (
          <>
            <Form.Item
              name="output_id"
              label="Phiếu sản lượng liên quan (nếu có)"
            >
              <Select
                allowClear
                options={data.outputs
                  .filter(
                    (o) =>
                      o.step_id === step &&
                      o.contributors.some(
                        (p) =>
                          data.assignments.find((a) => a.id === p.assignment_id)
                            ?.employee_id === selectedEmployee,
                      ),
                  )
                  .map((o) => ({
                    value: o.id,
                    label: o.work_reference + " · " + o.quantity + " SP",
                  }))}
              />
            </Form.Item>
            <Form.Item name="rate_per_15g" label="Đơn giá tham chiếu / 15g (B)">
              <LaborPriceInput />
            </Form.Item>
            <Form.Item
              name="amount"
              label="Tiền công ghi nhận (B)"
              rules={required}
            >
              <GoldWeightInput precision={0} />
            </Form.Item>
            <Form.Item
              name="calculation_note"
              label="Căn cứ / cách tính và lý do điều chỉnh"
              rules={required}
            >
              <Input.TextArea maxLength={10000} />
            </Form.Item>
          </>
        )}
        {kind === "reconcile" && (
          <>
            <Alert
              type="info"
              title={
                context.action === "REOPEN"
                  ? "Mở lại không đổi trạng thái công đoạn hoặc khóa công đoạn phụ thuộc. Kết quả cũ được giữ trong lịch sử."
                  : "Chốt khi đủ số lượng giao và quản lý xác nhận đã đối soát nguyên liệu."
              }
            />
            {context.action === "CLOSE" && (
              <Form.Item
                name="materials_reviewed"
                valuePropName="checked"
                rules={[
                  {
                    validator: (_, value) =>
                      value
                        ? Promise.resolve()
                        : Promise.reject(
                            new Error("Cần xác nhận đã đối soát nguyên liệu"),
                          ),
                  },
                ]}
              >
                <Checkbox>Đã kiểm tra và đối soát toàn bộ nguyên liệu</Checkbox>
              </Form.Item>
            )}
          </>
        )}
        {["loss", "reverse", "reconcile"].includes(kind) && (
          <Form.Item name="reason" label="Lý do và căn cứ" rules={required}>
            <Input.TextArea maxLength={kind === "reverse" ? 1000 : 10000} />
          </Form.Item>
        )}
        {!["stage", "reverse", "assignment", "reconcile"].includes(kind) && (
          <Form.Item
            name="occurred_at"
            label="Ngày giờ ghi nhận"
            rules={required}
          >
            <Input type="datetime-local" />
          </Form.Item>
        )}
        {!["stage", "reverse", "loss", "labor", "reconcile"].includes(kind) && (
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea
              maxLength={10000}
              autoSize={{ minRows: 1, maxRows: 4 }}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
