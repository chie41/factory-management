import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { RequestError } from "../../components/common/RequestError";
import { EllipsisOutlined } from "@ant-design/icons";
import { transactionLabel, transactionSummary } from "./TransactionChangeForm";
import { laborTotalsText } from "./grantPlannedLabor";
import { fixedDecimalText } from "../../utils/decimal";
import type { ReactNode } from "react";
import {
  App,
  Button,
  Popconfirm,
  Dropdown,
  Flex,
  Popover,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { usePermissions } from "../auth/hooks/usePermissions";
import { laborDecimalText } from "../catalog/laborPrice";
import type {
  Assignment,
  Execution,
  ExecutionEntry,
  ExecutionTransaction,
  StageExecution,
} from "./executionApi";
import { movementKinds, writeExecution } from "./executionApi";
import type { ExecutionFormContext } from "./ExecutionForm";
export const sumPlannedLabor = laborTotalsText;
export function HaoHeo({
  worker,
  previous = false,
}: {
  worker: Assignment;
  previous?: boolean;
}) {
  if (!previous && worker.reconciliation_status !== "CLOSED")
    return (
      <Typography.Text
        type={
          worker.reconciliation_status === "ADJUSTING" ? "warning" : "secondary"
        }
      >
        {worker.reconciliation_status === "ADJUSTING"
          ? "Đang điều chỉnh"
          : "Chưa chốt"}
      </Typography.Text>
    );
  const value = worker.closed_difference_gold_g;
  if (value == null)
    return <Typography.Text type="secondary">Chưa chốt</Typography.Text>;
  const zero = /^-?0(?:\.0+)?$/.test(value);
  return (
    <Typography.Text
      type={!zero && value.startsWith("-") ? "danger" : undefined}
    >
      {zero
        ? "Cân bằng"
        : value.startsWith("-")
          ? "Hao " + laborDecimalText(value.slice(1)) + " g"
          : "Heo " + laborDecimalText(value) + " g"}
    </Typography.Text>
  );
}

type Props = {
  stage: StageExecution;
  data: Execution;
  open: (context: ExecutionFormContext) => void;
  locked: boolean;
};
type Transaction = {
  id: string;
  at: string;
  operation: string;
  quantity: ReactNode;
  gold: ReactNode;
  note: ReactNode;
  material?: ExecutionEntry;
  labor?: ExecutionEntry;
  business?: ExecutionTransaction;
};
function WorkerDetail({
  stage,
  data,
  open,
  locked,
  worker,
}: Props & { worker: Assignment }) {
  const { can } = usePermissions(),
    closed = worker.reconciliation_status === "CLOSED";
  const { id } = useParams(),
    cache = useQueryClient(),
    { message } = App.useApp();
  const [pendingDelete, setPendingDelete] = useState<ExecutionTransaction>();
  const deleteRequest = useRef({ signature: "", id: crypto.randomUUID() });
  const deletion = useMutation({
    mutationFn: async (tx: ExecutionTransaction) => {
      if (!id) throw new Error("Không xác định được lô sản xuất");
      const payload = {
        version: data.version,
        transaction_version: tx.transaction_version,
      };
      const signature = JSON.stringify({ id: tx.id, ...payload });
      if (signature !== deleteRequest.current.signature)
        deleteRequest.current = { signature, id: crypto.randomUUID() };
      return writeExecution(id, "transactions/" + tx.id + "/delete", {
        ...payload,
        request_id: deleteRequest.current.id,
      });
    },
    onSuccess: async () => {
      setPendingDelete(undefined);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["production-batch", id] }),
        cache.invalidateQueries({ queryKey: ["production-batches"] }),
        cache.invalidateQueries({ queryKey: ["production-history", id] }),
        cache.invalidateQueries({ queryKey: ["production-execution", id] }),
      ]);
      message.success("Đã xóa giao dịch và cập nhật số liệu");
    },
  });
  const materials = data.materials.filter(
    (m) =>
      !m.correction_generated &&
      m.step_id === stage.step_id &&
      m.employee_id === worker.employee_id,
  );
  const transactions = new Map<string, Transaction>();
  for (const e of data.assignment_events.filter(
    (e) =>
      e.assignment_id === worker.id && !e.after_state?.transaction_adjustment,
  )) {
    const id =
      typeof e.after_state?.request_id === "string"
        ? e.after_state.request_id
        : e.id;
    const grant = e.after_state?.labor_grant as
      | {
          rate_per_15g?: string | null;
          planned_labor_delta?: string | null;
          currency?: string;
        }
      | undefined;
    transactions.set(id, {
      id,
      at: e.created_at,
      operation: e.kind === "ADD" ? "Giao thêm việc" : "Điều chỉnh phân công",
      quantity: (e.quantity_delta > 0 ? "+" : "") + e.quantity_delta + " SP",
      gold: "—",
      note: [
        e.actor_name,
        grant?.rate_per_15g != null
          ? "Đơn giá: " +
            laborDecimalText(grant.rate_per_15g) +
            " " +
            (grant.currency ?? "THB") +
            " / 15g"
          : "",
        grant?.planned_labor_delta != null
          ? "Công lần giao: " +
            fixedDecimalText(grant.planned_labor_delta, 0) +
            " " +
            (grant.currency ?? "THB")
          : "",
        typeof e.after_state?.note === "string" ? e.after_state.note : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  for (const m of materials) {
    const id = m.effect === 1 ? (m.group_id ?? m.id) : m.id;
    const combined = transactions.get(id);
    const isGold = m.material_type === "GOLD";
    transactions.set(id, {
      id,
      at: m.occurred_at,
      operation: combined
        ? "Giao việc & giao vàng"
        : (m.effect === -1 ? "Đảo: " : "") + (movementKinds[m.kind] ?? m.kind),
      quantity: combined?.quantity ?? "—",
      gold: isGold
        ? (m.effect === -1 ? "−" : "") + laborDecimalText(m.quantity) + " g"
        : "—",
      note: [
        combined?.note,
        combined ? "" : m.note,
        !isGold
          ? m.material_name + ": " + laborDecimalText(m.quantity) + " " + m.unit
          : "",
        m.actor_name,
      ]
        .filter(Boolean)
        .join(" · "),
      material: m,
    });
  }
  for (const o of data.outputs.filter(
    (o) =>
      !o.correction_generated &&
      o.contributors.some((c) => c.assignment_id === worker.id),
  )) {
    const id =
      /^GOLD-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        o.work_reference,
      )
        ? o.work_reference.slice(5)
        : o.id;
    const existing = transactions.get(id);
    const quantity = o.contributors
      .filter((c) => c.assignment_id === worker.id)
      .reduce((sum, c) => sum + c.quantity, 0);
    transactions.set(id, {
      ...existing,
      id,
      at: o.occurred_at,
      operation: existing ? "Nhận vàng & sản phẩm" : "Nhận sản phẩm",
      quantity: quantity + " SP",
      gold: existing?.gold ?? "—",
      note: existing?.note ?? o.note,
    });
  }
  for (const e of data.reconciliation_events.filter(
    (e) => e.assignment_id === worker.id,
  )) {
    const difference = e.after_state?.difference_gold_g;
    transactions.set(e.id, {
      id: e.id,
      at: e.created_at,
      operation: e.action === "REOPEN" ? "Mở lại đối soát" : "Chốt đối soát",
      quantity: "—",
      gold:
        difference == null
          ? "—"
          : laborDecimalText(String(difference)) + " g (nhận − giao)",
      note: [e.reason, e.actor_name].filter(Boolean).join(" · "),
    });
  }
  for (const e of data.labor.filter(
    (l) => l.step_id === stage.step_id && l.employee_id === worker.employee_id,
  ))
    transactions.set(e.id, {
      id: e.id,
      at: e.occurred_at,
      operation:
        e.direction === "DECREASE"
          ? "Điều chỉnh giảm tiền công"
          : "Ghi nhận tiền công",
      quantity: "—",
      gold: "—",
      note: [
        fixedDecimalText(e.amount, 0) + " THB",
        e.calculation_note,
        e.reason,
        e.note,
        e.actor_name,
      ]
        .filter(Boolean)
        .join(" · "),
      labor: e,
    });
  for (const e of data.losses.filter(
    (l) => l.step_id === stage.step_id && l.employee_id === worker.employee_id,
  ))
    transactions.set(e.id, {
      id: e.id,
      at: e.occurred_at,
      operation: "Điều chỉnh hao hụt",
      quantity: "—",
      gold:
        e.material_type === "GOLD" ? laborDecimalText(e.quantity) + " g" : "—",
      note: [e.material_name, e.direction, e.reason, e.note, e.actor_name]
        .filter(Boolean)
        .join(" · "),
    });
  for (const tx of data.transactions ?? []) {
    if (tx.assignment_id !== worker.id || tx.kind === "OTHER") continue;
    if (tx.state.voided) {
      transactions.delete(tx.id);
      continue;
    }
    const display = tx.state;
    const last = tx.changes.at(-1);
    transactions.set(tx.id, {
      id: tx.id,
      at: tx.occurred_at,
      operation: transactionLabel(tx),
      quantity: tx.has_work
        ? display.quantity + " SP giao"
        : tx.has_output
          ? display.completed_quantity + " SP xong"
          : "—",
      gold: tx.has_gold
        ? fixedDecimalText(display.gold_weight_g, 2) + " g"
        : "—",
      business: tx,
      note: (
        <Space orientation="vertical" size={2}>
          <span>
            {display.note || "—"}
            {tx.has_work && display.planned_labor != null
              ? " · Tiền công: " +
                fixedDecimalText(display.planned_labor, 0) +
                " " +
                display.currency
              : ""}
          </span>
          {last && (
            <span>
              {last.action === "VOID" ? "Hủy" : "Sửa"}: {last.reason} ·{" "}
              {last.actor_name} ·{" "}
              {new Date(last.created_at).toLocaleString("vi-VN")}
            </span>
          )}
          {!!tx.changes.length && (
            <Popover
              trigger="click"
              title="Lịch sử điều chỉnh"
              content={
                <Flex
                  vertical
                  gap={12}
                  style={{
                    maxWidth: "min(480px, calc(100vw - 60px))",
                    maxHeight: 360,
                    overflowY: "auto",
                    overflowWrap: "anywhere",
                  }}
                >
                  {tx.changes.map((change) => (
                    <div key={change.id}>
                      <Typography.Text strong>
                        {change.action === "VOID" ? "Hủy" : "Sửa"} ·{" "}
                        {change.actor_name} ·{" "}
                        {new Date(change.created_at).toLocaleString("vi-VN")}
                      </Typography.Text>
                      <div>Lý do: {change.reason}</div>
                      <div>
                        Trước: {transactionSummary(change.before_state)}
                      </div>
                      <div>Sau: {transactionSummary(change.after_state)}</div>
                    </div>
                  ))}
                </Flex>
              }
            >
              <Button type="link" size="small">
                Xem lịch sử ({tx.changes.length})
              </Button>
            </Popover>
          )}
        </Space>
      ),
    });
  }
  return (
    <div className="production-worker-detail">
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Text strong>
          Chi tiết · {worker.employee_name}
        </Typography.Text>
        <Tag
          color={
            closed
              ? "success"
              : worker.reconciliation_status === "ADJUSTING"
                ? "warning"
                : "default"
          }
        >
          {closed
            ? "Đã chốt đối soát"
            : worker.reconciliation_status === "ADJUSTING"
              ? "Đang điều chỉnh"
              : "Chưa chốt"}
        </Tag>
      </Flex>
      <Flex wrap gap={16} className="production-worker-summary">
        <span>
          Đơn giá hiện hành:{" "}
          <strong>
            {worker.applied_rate == null
              ? "Chưa cấu hình"
              : laborDecimalText(worker.applied_rate) +
                " " +
                worker.applied_currency +
                " / 15g"}
          </strong>
        </span>
        <span>
          SL giao / xong:{" "}
          <strong>
            {worker.planned_quantity ?? "Chưa chia"} /{" "}
            {worker.completed_quantity}
          </strong>
        </span>
        <span>
          Vàng giao / nhận:{" "}
          <strong>
            {laborDecimalText(worker.gold_issued_g)} /{" "}
            {laborDecimalText(worker.gold_received_g)} g
          </strong>
        </span>
        <span>
          Tiền công dự kiến:{" "}
          <strong>{laborTotalsText([worker]) ?? "Chưa đủ định mức"}</strong>
        </span>
        {worker.reconciliation_status === "ADJUSTING" && (
          <span>
            Kết quả chốt trước: <HaoHeo worker={worker} previous />
          </span>
        )}
      </Flex>
      <RequestError error={deletion.error} />
      <Table<Transaction>
        size="small"
        rowKey="id"
        dataSource={[...transactions.values()]
          .filter((row) => !row.business?.state.voided)
          .sort(
            (a, b) =>
              Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id),
          )}
        locale={{ emptyText: "Chưa có giao dịch" }}
        scroll={{ x: 900 }}
        pagination={{
          defaultPageSize: 5,
          showSizeChanger: true,
          pageSizeOptions: [5, 10, 20, 50],
          hideOnSinglePage: true,
          showTotal: (n) => n + " giao dịch",
        }}
        columns={[
          {
            title: "Thời gian",
            dataIndex: "at",
            width: 155,
            render: (value: string) => new Date(value).toLocaleString("vi-VN"),
          },
          {
            title: "Nghiệp vụ",
            width: 175,
            render: (_, t) => (
              <Space orientation="vertical" size={2}>
                <span>{t.operation}</span>
                {!!t.business?.changes.length && <Tag color="blue">Đã sửa</Tag>}
              </Space>
            ),
          },
          { title: "Số lượng SP", dataIndex: "quantity", width: 110 },
          { title: "Vàng (g)", dataIndex: "gold", width: 135 },
          { title: "Ghi chú", render: (_, t) => t.note || "—" },
          {
            title: "Thao tác",
            width: 70,
            fixed: "right",
            render: (_, row) => {
              const t = row.business;
              if (t) {
                if (t.state.voided || !can("production.adjustments.manage"))
                  return null;
                const allowed =
                  (!t.has_work || can("production.assignments.manage")) &&
                  (!t.has_gold || can("production.materials.manage")) &&
                  (!t.has_output || can("production.output.manage"));
                const reason = locked
                  ? "Đang sửa quy trình"
                  : (t.blocked_reason ??
                    (!allowed
                      ? "Chưa đủ quyền điều chỉnh các phần của giao dịch"
                      : undefined));
                return (
                  <Tooltip title={reason}>
                    <span>
                      <Popconfirm
                        trigger={[]}
                        open={pendingDelete?.id === t.id}
                        title="Xóa vĩnh viễn giao dịch?"
                        description={
                          <div
                            style={{ maxWidth: 360, overflowWrap: "anywhere" }}
                          >
                            <div>
                              {transactionLabel(pendingDelete ?? t)} ·{" "}
                              {(pendingDelete ?? t).employee_name}
                            </div>
                            <div>
                              {transactionSummary((pendingDelete ?? t).state)}
                            </div>
                          </div>
                        }
                        okText="Xóa"
                        cancelText="Đóng"
                        okButtonProps={{
                          danger: true,
                          loading: deletion.isPending,
                        }}
                        cancelButtonProps={{ disabled: deletion.isPending }}
                        onConfirm={() =>
                          pendingDelete
                            ? deletion.mutateAsync(pendingDelete)
                            : Promise.reject(
                                new Error("Chọn giao dịch cần xóa"),
                              )
                        }
                        onCancel={() => {
                          if (!deletion.isPending) setPendingDelete(undefined);
                        }}
                      >
                        <Dropdown
                          trigger={["click"]}
                          disabled={!!reason}
                          menu={{
                            items: [
                              { key: "edit", label: "Sửa giao dịch" },
                              {
                                key: "delete",
                                label: "Xóa giao dịch",
                                danger: true,
                              },
                            ],
                            onClick: ({ key }) => {
                              if (key === "delete") {
                                deletion.reset();
                                setPendingDelete(t);
                              } else
                                open({
                                  kind: "transaction-edit",
                                  stepId: stage.step_id,
                                  transaction: t,
                                  assignment: worker,
                                });
                            },
                          }}
                        >
                          <Button
                            type="text"
                            size="small"
                            icon={<EllipsisOutlined />}
                            disabled={!!reason}
                            aria-label="Thao tác giao dịch"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Dropdown>
                      </Popconfirm>
                    </span>
                  </Tooltip>
                );
              }
              const items = [];
              if (
                row.material &&
                can("production.adjustments.manage") &&
                row.material.effect === 1 &&
                !data.materials.some((m) => m.reverses_id === row.material!.id)
              )
                items.push({
                  key: "reverse",
                  label: "Đảo bút toán nguyên liệu",
                  danger: true,
                });
              if (
                row.labor?.direction === "INCREASE" &&
                can("production.labor.manage")
              )
                items.push({ key: "labor", label: "Ghi giảm tiền công" });
              return items.length ? (
                <Dropdown
                  trigger={["click"]}
                  disabled={locked || closed}
                  menu={{
                    items,
                    onClick: ({ key }) =>
                      key === "reverse"
                        ? open({ kind: "reverse", entry: row.material })
                        : open({
                            kind: "labor",
                            stepId: stage.step_id,
                            entry: row.labor,
                            adjust: true,
                          }),
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<EllipsisOutlined />}
                    aria-label="Thao tác bút toán"
                    disabled={locked || closed}
                  />
                </Dropdown>
              ) : null;
            },
          },
        ]}
      />
    </div>
  );
}
export function StageOperations({ stage, data, open, locked }: Props) {
  const { can } = usePermissions(),
    workers = data.assignments.filter((a) => a.step_id === stage.step_id);
  const assign = (
    <Button
      type="primary"
      disabled={
        locked ||
        !can("employees.read") ||
        stage.execution_status === "COMPLETED"
      }
      onClick={() => open({ kind: "work-gold", stepId: stage.step_id })}
    >
      Giao việc
    </Button>
  );
  return (
    <Flex vertical gap={12} style={{ minWidth: 0 }}>
      {stage.description && (
        <Typography.Paragraph
          style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}
        >
          {stage.description}
        </Typography.Paragraph>
      )}
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Text strong>Phân công & kết quả</Typography.Text>
        <Space wrap>
          {can("production.materials.manage") && (
            <Button
              disabled={
                !workers.length ||
                locked ||
                workers.every((w) => w.reconciliation_status === "CLOSED")
              }
              onClick={() =>
                open({ kind: "gold-receipt", stepId: stage.step_id })
              }
            >
              Giao / nhận
            </Button>
          )}
          {can("production.assignments.manage") && assign}
        </Space>
      </Flex>
      {workers.length ? (
        <Table<Assignment>
          className="production-workers"
          size="small"
          rowKey="id"
          dataSource={workers}
          pagination={false}
          scroll={{ x: 780 }}
          columns={[
            {
              title: "Nhân viên",
              render: (_, w) => (
                <Space orientation="vertical" size={0}>
                  <Typography.Text strong>{w.employee_name}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {w.employee_code}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: "SL giao / xong",
              render: (_, w) =>
                (w.planned_quantity ?? "Chưa chia") +
                " / " +
                w.completed_quantity,
            },
            {
              title: "Vàng giao / nhận",
              render: (_, w) =>
                laborDecimalText(w.gold_issued_g) +
                " / " +
                laborDecimalText(w.gold_received_g) +
                " g",
            },
            { title: "Hao / Heo", render: (_, w) => <HaoHeo worker={w} /> },
            {
              title: "Tiền công dự kiến",
              align: "right",
              render: (_, w) => laborTotalsText([w]) ?? "Chưa đủ định mức",
            },
          ]}
          expandable={{
            expandRowByClick: true,
            expandedRowRender: (worker) => (
              <WorkerDetail
                stage={stage}
                data={data}
                open={open}
                locked={locked}
                worker={worker}
              />
            ),
          }}
        />
      ) : (
        <Flex
          align="center"
          justify="space-between"
          wrap
          gap={12}
          className="production-worker-empty"
        >
          <Typography.Text type="secondary">
            Chưa có nhân viên được phân công
          </Typography.Text>
        </Flex>
      )}
      {workers.length > 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {stage.completed_quantity} / {data.planned_quantity} SP ·{" "}
          {workers.filter((w) => w.reconciliation_status === "CLOSED").length} /{" "}
          {workers.length} thợ đã chốt
          {sumPlannedLabor(workers) != null
            ? " · Tiền công dự kiến: " + sumPlannedLabor(workers)
            : ""}
        </Typography.Text>
      )}
    </Flex>
  );
}
