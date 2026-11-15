import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Flex,
  Progress,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { RequestError } from "../../components/common/RequestError";
import { usePermissions } from "../auth/hooks/usePermissions";
import { laborDecimalText, laborPriceText } from "../catalog/laborPrice";
import { ExecutionGraph } from "./ExecutionGraph";
import { ExecutionForm, type ExecutionFormContext } from "./ExecutionForm";
import {
  getExecution,
  executionStatuses,
  movementKinds,
  type Execution,
  type ExecutionEntry,
  type Reconciliation,
  type StageExecution,
  type Assignment,
  type Output,
} from "./executionApi";
type Section = "workflow" | "assignments" | "materials" | "losses" | "labor";
const assignmentStatus: Record<string, string> = {
  ACTIVE: "Đang phân công",
  COMPLETED: "Hoàn thành phân công",
  CANCELLED: "Ngừng phân công",
};
const balanceNumbers = [
  "initial",
  "additional",
  "returned",
  "products",
  "transfer_in",
  "transfer_out",
  "recognized_loss",
  "unreturned",
  "unexplained",
] as const;
const materialUnits = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
};
function groupBalances(rows: Reconciliation[], scope: string) {
  if (scope === "DETAIL") return rows;
  const groups = new Map<string, Reconciliation>();
  for (const row of rows) {
    const key = JSON.stringify([
      scope === "STEP" ? row.step_id : "",
      scope === "EMPLOYEE" ? row.employee_id : "",
      row.material_type,
      row.material_name,
      row.unit,
    ]);
    let target = groups.get(key);
    if (!target) {
      target = {
        ...row,
        step_id: scope === "STEP" ? row.step_id : "",
        employee_id: scope === "EMPLOYEE" ? row.employee_id : "",
        step_name: scope === "STEP" ? row.step_name : "Toàn lô",
        employee_name:
          scope === "EMPLOYEE" ? row.employee_name : "Toàn bộ nhân viên",
      };
      balanceNumbers.forEach((k) => (target![k] = "0"));
      groups.set(key, target);
    }
    for (const column of balanceNumbers) {
      const amount = materialUnits(target[column]) + materialUnits(row[column]);
      target[column] =
        (amount / 10000n).toString() +
        "." +
        (amount % 10000n).toString().padStart(4, "0");
    }
  }
  return [...groups.values()];
}
export function BatchExecutionSection({
  id,
  section,
  locked = false,
}: {
  id: string;
  section: Section;
  locked?: boolean;
}) {
  const { can } = usePermissions(),
    cache = useQueryClient(),
    [form, setForm] = useState<{
      context: ExecutionFormContext;
      data: Execution;
    }>(),
    [scope, setScope] = useState("DETAIL");
  const query = useQuery({
      queryKey: ["production-execution", id],
      queryFn: () => getExecution(id),
      refetchInterval: 15000,
    }),
    data = query.data;
  const open = (context: ExecutionFormContext) => {
    if (data) setForm({ context, data: structuredClone(data) });
  };
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["production-execution", id] }),
      cache.invalidateQueries({ queryKey: ["production-batch", id] }),
      cache.invalidateQueries({ queryKey: ["production-batches"] }),
      cache.invalidateQueries({ queryKey: ["production-history", id] }),
    ]);
  };
  const stageName = (step: string) =>
    data?.stages.find((s) => s.step_id === step)?.name ?? "Công đoạn";
  const stageColumn = {
    title: "Công đoạn",
    dataIndex: "step_id",
    render: (step: string) => stageName(step),
  };
  const timeColumn = {
    title: "Ngày giờ",
    dataIndex: "occurred_at",
    render: (value: string) => new Date(value).toLocaleString("vi-VN"),
  };
  const materialColumns: ColumnsType<ExecutionEntry> = [
    stageColumn,
    { title: "Nhân viên", dataIndex: "employee_name" },
    {
      title: "Nguyên liệu",
      render: (_, r) => r.material_name + " · " + r.unit,
    },
    {
      title: "Số lượng",
      render: (_, r) =>
        (r.effect === -1 ? "−" : "") + laborDecimalText(r.quantity),
    },
    timeColumn,
    { title: "Người ghi", dataIndex: "actor_name" },
  ];
  const balanceColumns: ColumnsType<Reconciliation> = [
    { title: "Công đoạn", dataIndex: "step_name" },
    { title: "Nhân viên", dataIndex: "employee_name" },
    {
      title: "Nguyên liệu",
      render: (_, r) => r.material_name + " (" + r.unit + ")",
    },
    ...balanceNumbers.map((key, index) => ({
      title: [
        "Giao ban đầu",
        "Giao bổ sung",
        "Nhận thừa",
        "Nhận SP/BTP",
        "Chuyển đến",
        "Chuyển đi",
        "Hao hụt ghi nhận",
        "Chưa nhận lại",
        "Chưa phân bổ hao hụt",
      ][index],
      dataIndex: key,
      render: (value: string) => laborDecimalText(value),
    })),
  ];
  const balanceView = data && (
    <>
      <Select
        value={scope}
        onChange={setScope}
        style={{ minWidth: 220 }}
        options={[
          { value: "DETAIL", label: "Theo công đoạn và nhân viên" },
          { value: "BATCH", label: "Tổng hợp toàn lô" },
          { value: "STEP", label: "Tổng hợp theo công đoạn" },
          { value: "EMPLOYEE", label: "Tổng hợp theo nhân viên" },
        ]}
      />
      <Table<Reconciliation>
        rowKey={(row) =>
          JSON.stringify([
            row.step_id,
            row.employee_id,
            row.material_type,
            row.material_name,
            row.unit,
          ])
        }
        size="small"
        scroll={{ x: 1600 }}
        columns={balanceColumns}
        dataSource={groupBalances(data.reconciliation, scope)}
        pagination={{ pageSize: 10 }}
      />
    </>
  );
  return (
    <Flex vertical gap="middle" style={{ minWidth: 0 }}>
      <RequestError error={query.error} retry={() => void query.refetch()} />
      {locked && (
        <Alert
          type="warning"
          title="Lưu hoặc hủy bản nháp quy trình trước khi ghi nghiệp vụ thực thi."
        />
      )}
      {query.isPending ? (
        <Spin />
      ) : (
        data && (
          <>
            {section === "workflow" && (
              <>
                <Alert
                  type="info"
                  title="AND-Join: chỉ bắt đầu khi tất cả dependency hoàn thành. Các nhánh không phụ thuộc nhau vận hành độc lập; hoàn thành công đoạn phải được xác nhận riêng."
                />
                <ExecutionGraph data={data} />
                <Table<StageExecution>
                  rowKey="step_id"
                  scroll={{ x: 1100 }}
                  dataSource={data.stages}
                  pagination={false}
                  columns={[
                    { title: "Công đoạn", dataIndex: "name" },
                    {
                      title: "Trạng thái",
                      render: (_, s) => (
                        <Tag
                          color={
                            s.execution_status === "COMPLETED"
                              ? "success"
                              : s.execution_status === "IN_PROGRESS"
                                ? "processing"
                                : "default"
                          }
                        >
                          {executionStatuses[s.execution_status]}
                        </Tag>
                      ),
                    },
                    {
                      title: "Sản lượng",
                      render: (_, s) => (
                        <>
                          <Typography.Text>
                            {s.completed_quantity} / {data.planned_quantity} SP
                            · Còn {s.remaining_quantity}
                          </Typography.Text>
                          <Progress
                            size="small"
                            percent={Math.round(
                              (s.completed_quantity / data.planned_quantity) *
                                100,
                            )}
                            status={
                              s.execution_status === "COMPLETED"
                                ? "success"
                                : "normal"
                            }
                          />
                        </>
                      ),
                    },
                    {
                      title: "Đang chờ",
                      render: (_, s) =>
                        s.waiting_for.map((p) => p.name).join(", ") || "—",
                    },
                    {
                      title: "Bắt đầu / Kết thúc",
                      render: (_, s) => (
                        <>
                          {s.execution_started_at
                            ? new Date(s.execution_started_at).toLocaleString(
                                "vi-VN",
                              )
                            : "—"}
                          <br />
                          {s.execution_finished_at
                            ? new Date(s.execution_finished_at).toLocaleString(
                                "vi-VN",
                              )
                            : "—"}
                        </>
                      ),
                    },
                    {
                      title: "Thao tác",
                      render: (_, s) => (
                        <Space wrap>
                          {can("production.execution.manage") &&
                            [
                              ["NOT_STARTED", "START", "Bắt đầu"],
                              ["IN_PROGRESS", "PAUSE", "Tạm dừng"],
                              ["PAUSED", "RESUME", "Tiếp tục"],
                              ["IN_PROGRESS", "COMPLETE", "Hoàn thành"],
                            ]
                              .filter(
                                ([status]) => status === s.execution_status,
                              )
                              .map(([, action, label]) => (
                                <Button
                                  key={action}
                                  size="small"
                                  disabled={
                                    locked ||
                                    (["START", "RESUME"].includes(action) &&
                                      s.waiting_for.length > 0) ||
                                    (action === "COMPLETE" &&
                                      s.remaining_quantity !== 0)
                                  }
                                  onClick={() =>
                                    open({
                                      kind: "stage",
                                      stepId: s.step_id,
                                      action,
                                    })
                                  }
                                >
                                  {label}
                                </Button>
                              ))}
                          {can("production.output.manage") &&
                            s.execution_status === "IN_PROGRESS" && (
                              <Button
                                size="small"
                                disabled={locked || s.remaining_quantity === 0}
                                onClick={() =>
                                  open({ kind: "output", stepId: s.step_id })
                                }
                              >
                                Ghi sản lượng
                              </Button>
                            )}
                        </Space>
                      ),
                    },
                  ]}
                />
                <Typography.Title level={5}>Phiếu sản lượng</Typography.Title>
                <Alert
                  type="info"
                  title="Mỗi phiếu cộng một lần vào sản lượng công đoạn. Sản lượng tham gia của nhiều thợ không cộng lại; chưa có quy tắc sửa/đảo phiếu sản lượng đã ghi."
                />
                <Table<Output>
                  rowKey="id"
                  scroll={{ x: 700 }}
                  dataSource={data.outputs}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    stageColumn,
                    { title: "Mã phiếu", dataIndex: "work_reference" },
                    { title: "Sản lượng", dataIndex: "quantity" },
                    {
                      title: "Thợ tham gia",
                      render: (_, o) =>
                        o.contributors.map((c) => c.employee_name).join(", "),
                    },
                    timeColumn,
                    { title: "Ghi chú", dataIndex: "note" },
                  ]}
                />
              </>
            )}
            {section === "assignments" && (
              <>
                <Space>
                  {can("production.assignments.manage") && (
                    <Button
                      type="primary"
                      disabled={
                        locked || !can("employees.read") || !data.stages.length
                      }
                      onClick={() => open({ kind: "assignment" })}
                    >
                      Phân công nhân viên
                    </Button>
                  )}
                </Space>
                <Alert
                  type="info"
                  title="Có thể phân công trước khi tới công đoạn. Sản lượng tham gia của từng thợ được theo dõi riêng, không cộng để suy ra sản lượng công đoạn."
                />
                <Table<Assignment>
                  rowKey="id"
                  scroll={{ x: 850 }}
                  dataSource={data.assignments}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    stageColumn,
                    {
                      title: "Nhân viên",
                      render: (_, r) =>
                        r.employee_code + " · " + r.employee_name,
                    },
                    {
                      title: "SL giao",
                      render: (_, r) =>
                        r.planned_quantity ?? "Chưa chia cụ thể",
                    },
                    { title: "SL tham gia", dataIndex: "completed_quantity" },
                    {
                      title: "Trạng thái",
                      render: (_, r) => assignmentStatus[r.status],
                    },
                    {
                      title: "Ngày phân công",
                      render: (_, r) =>
                        new Date(r.assigned_at).toLocaleString("vi-VN"),
                    },
                    { title: "Ghi chú", dataIndex: "note" },
                    {
                      title: "Thao tác",
                      render: (_, assignment) =>
                        can("production.assignments.manage") && (
                          <Button
                            size="small"
                            disabled={locked}
                            onClick={() =>
                              open({
                                kind: "assignment",
                                stepId: assignment.step_id,
                                assignment,
                              })
                            }
                          >
                            Điều chỉnh
                          </Button>
                        ),
                    },
                  ]}
                />
              </>
            )}
            {section === "materials" && (
              <>
                <Space wrap>
                  {can("production.materials.manage") && (
                    <>
                      <Button
                        type="primary"
                        disabled={locked || !data.assignments.length}
                        onClick={() => open({ kind: "material" })}
                      >
                        Giao / nhận nguyên liệu
                      </Button>
                      <Button
                        disabled={locked || !data.assignments.length}
                        onClick={() => open({ kind: "transfer" })}
                      >
                        Chuyển nội bộ
                      </Button>
                    </>
                  )}
                </Space>
                <Alert
                  type="info"
                  title="Chuyển giữa công đoạn dùng hai vế đối ứng, không tính là giao mới vào lô. Bút toán được giữ nguyên; điều chỉnh bằng đảo bút toán rồi ghi lại."
                />
                <Table<ExecutionEntry>
                  rowKey="id"
                  scroll={{ x: 1150 }}
                  dataSource={data.materials}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    {
                      title: "Nghiệp vụ",
                      render: (_, r) =>
                        (r.effect === -1 ? "Đảo: " : "") +
                        movementKinds[r.kind],
                    },
                    ...materialColumns,
                    { title: "Ghi chú", dataIndex: "note" },
                    {
                      title: "Thao tác",
                      render: (_, r) =>
                        can("production.adjustments.manage") &&
                        r.effect === 1 &&
                        !data.materials.some((m) => m.reverses_id === r.id) && (
                          <Button
                            size="small"
                            danger
                            disabled={locked}
                            onClick={() => open({ kind: "reverse", entry: r })}
                          >
                            Đảo bút toán
                          </Button>
                        ),
                    },
                  ]}
                />
                {balanceView}
              </>
            )}
            {section === "losses" && (
              <>
                {can("production.losses.manage") && (
                  <Button
                    type="primary"
                    disabled={locked || !data.assignments.length}
                    onClick={() => open({ kind: "loss" })}
                  >
                    Xác định hao hụt
                  </Button>
                )}
                <Alert
                  type="info"
                  title="Nguyên liệu chưa trả không tự coi là hao hụt. Hao hụt do người quản lý ghi nhận theo căn cứ; chưa khấu trừ lương. Khi thu hồi phần đã ghi hao, ghi giảm hao hụt trước rồi nhận nguyên liệu trả về."
                />
                {balanceView}
                <Table<ExecutionEntry>
                  rowKey="id"
                  scroll={{ x: 1000 }}
                  dataSource={data.losses}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    ...materialColumns,
                    {
                      title: "Ghi nhận",
                      render: (_, r) =>
                        r.direction === "INCREASE"
                          ? "Tăng hao hụt"
                          : "Giảm hao hụt",
                    },
                    { title: "Căn cứ", dataIndex: "reason" },
                    {
                      title: "Thao tác",
                      render: (_, r) =>
                        can("production.losses.manage") &&
                        r.direction === "INCREASE" && (
                          <Button
                            size="small"
                            disabled={locked}
                            onClick={() =>
                              open({
                                kind: "loss",
                                stepId: r.step_id,
                                entry: r,
                                adjust: true,
                              })
                            }
                          >
                            Ghi giảm / thu hồi
                          </Button>
                        ),
                    },
                  ]}
                />
              </>
            )}
            {section === "labor" && (
              <>
                {can("production.labor.manage") && (
                  <Button
                    type="primary"
                    disabled={locked || !data.assignments.length}
                    onClick={() => open({ kind: "labor" })}
                  >
                    Ghi tiền công
                  </Button>
                )}
                <Alert
                  type="info"
                  title="Tiền công trả thợ độc lập với giá công bán cho khách. Chỉ ghi nhận số tiền/căn cứ thủ công và điều chỉnh có lịch sử; chưa tính công thức, duyệt/chốt, khấu trừ hoặc chi lương."
                />
                <Table
                  rowKey={(r) => r.step_id + r.employee_id}
                  scroll={{ x: 600 }}
                  dataSource={data.labor_totals}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    stageColumn,
                    { title: "Nhân viên", dataIndex: "employee_name" },
                    {
                      title: "Tiền công ghi nhận ròng",
                      render: (_, r) => laborPriceText(r.amount, "THB"),
                    },
                  ]}
                />
                <Table<ExecutionEntry>
                  rowKey="id"
                  scroll={{ x: 1000 }}
                  dataSource={data.labor}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    stageColumn,
                    { title: "Nhân viên", dataIndex: "employee_name" },
                    {
                      title: "Ghi nhận",
                      render: (_, r) =>
                        r.direction === "INCREASE"
                          ? "Tăng tiền công"
                          : "Giảm tiền công",
                    },
                    {
                      title: "Tiền công",
                      render: (_, r) => laborPriceText(r.amount, "THB"),
                    },
                    {
                      title: "Đơn giá tham chiếu",
                      render: (_, r) =>
                        r.rate_per_15g == null
                          ? "—"
                          : laborPriceText(r.rate_per_15g, "THB") + " / 15g",
                    },
                    timeColumn,
                    { title: "Căn cứ", dataIndex: "calculation_note" },
                    { title: "Người ghi", dataIndex: "actor_name" },
                    {
                      title: "Thao tác",
                      render: (_, r) =>
                        can("production.labor.manage") &&
                        r.direction === "INCREASE" && (
                          <Button
                            size="small"
                            disabled={locked}
                            onClick={() =>
                              open({
                                kind: "labor",
                                stepId: r.step_id,
                                entry: r,
                                adjust: true,
                              })
                            }
                          >
                            Ghi giảm
                          </Button>
                        ),
                    },
                  ]}
                />
              </>
            )}
          </>
        )
      )}
      {form && (
        <ExecutionForm
          id={id}
          data={form.data}
          context={form.context}
          close={() => setForm(undefined)}
          saved={refresh}
        />
      )}
    </Flex>
  );
}
