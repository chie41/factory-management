import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Descriptions, Space, Table, Typography } from "antd";
import { RequestError } from "../../components/common/RequestError";
import {
  ProductionSteps,
  type ProductionDefinition,
} from "../catalog/ProductionWorkflow";
import { batchHistory, batchStatuses, type HistoryEntry } from "./api";
const actions: Record<string, string> = {
  "execution.stage.start": "Bắt đầu công đoạn",
  "execution.stage.pause": "Tạm dừng công đoạn",
  "execution.stage.resume": "Tiếp tục công đoạn",
  "execution.stage.complete": "Hoàn thành công đoạn",
  "execution.assignment.save": "Lưu/điều chỉnh phân công",
  "execution.output.record": "Ghi nhận sản lượng",
  "execution.material.record": "Giao/nhận nguyên liệu",
  "execution.material.transfer": "Chuyển nguyên liệu nội bộ",
  "execution.material.reverse": "Đảo bút toán nguyên liệu",
  "execution.loss.record": "Ghi nhận/điều chỉnh hao hụt",
  "execution.labor.record": "Ghi nhận/điều chỉnh tiền công",
  "batch.create": "Tạo lô",
  "batch.plan.update": "Sửa thông tin kế hoạch",
  "batch.workflow.update": "Sửa quy trình riêng",
};
function AuditState({ value }: { value?: Record<string, unknown> }) {
  if (!value)
    return (
      <Typography.Text type="secondary">
        Chưa có dữ liệu trước thay đổi
      </Typography.Text>
    );
  const snapshot = value.workflow_snapshot as
    { definition?: ProductionDefinition } | undefined;
  const definition = value.definition as ProductionDefinition | undefined;
  const workflow = definition ?? snapshot?.definition;
  const result = value.result;
  if (Array.isArray(result))
    return (
      <Space orientation="vertical">
        {result.map((entry, index) => (
          <AuditState key={index} value={entry as Record<string, unknown>} />
        ))}
      </Space>
    );
  if (result && typeof result === "object")
    return <AuditState value={result as Record<string, unknown>} />;
  if (value.after && typeof value.after === "object")
    return (
      <Space orientation="vertical">
        <Typography.Text strong>Phân công trước</Typography.Text>
        <AuditState
          value={value.before as Record<string, unknown> | undefined}
        />
        <Typography.Text strong>Phân công sau</Typography.Text>
        <AuditState value={value.after as Record<string, unknown>} />
      </Space>
    );
  const fields: Record<string, string> = {
    code: "Mã lô",
    model_code_snapshot: "Mã mẫu",
    model_name_snapshot: "Tên mẫu",
    planned_quantity: "Số lượng",
    planned_start: "Dự kiến bắt đầu",
    planned_end: "Dự kiến kết thúc",
    note: "Ghi chú",
    name: "Tên công đoạn",
    execution_status: "Trạng thái thực thi",
    completed_quantity: "Sản lượng hoàn thành",
    remaining_quantity: "Sản lượng còn lại",
    work_reference: "Mã phiếu sản lượng",
    quantity: "Sản lượng / số lượng nguyên liệu",
    material_name: "Nguyên liệu",
    unit: "Đơn vị",
    kind: "Nghiệp vụ giao nhận",
    direction: "Tăng / giảm",
    amount: "Tiền công (B)",
    calculation_note: "Căn cứ tiền công",
    reason: "Lý do",
    status: "Trạng thái phân công / ghi nhận",
    assigned_at: "Ngày phân công",
    occurred_at: "Ngày giờ nghiệp vụ",
  };
  return (
    <>
      {
        <Descriptions
          size="small"
          column={1}
          items={Object.entries(fields)
            .filter(([key]) => key in value)
            .map(([key, label]) => ({
              key,
              label,
              children: value[key] == null ? "—" : String(value[key]),
            }))}
        />
      }{" "}
      {workflow && Array.isArray(workflow.steps) && (
        <ProductionSteps value={workflow} />
      )}
    </>
  );
}
export function BatchHistory({
  id,
  kind,
}: {
  id: string;
  kind: "status" | "audit";
}) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: ["production-history", id, kind, page],
    queryFn: () => batchHistory(id, kind, page),
  });
  return (
    <>
      <RequestError
        error={history.error}
        retry={() => void history.refetch()}
      />
      <Table<HistoryEntry>
        rowKey="id"
        loading={history.isFetching}
        dataSource={history.data?.data ?? []}
        pagination={false}
        scroll={{ x: 550 }}
        columns={[
          {
            title: "Thời điểm",
            render: (_, row) =>
              new Date(row.created_at).toLocaleString("vi-VN"),
          },
          { title: "Người thực hiện", dataIndex: "actor_name" },
          ...(kind === "audit"
            ? [
                {
                  title: "Thay đổi",
                  render: (_: unknown, row: HistoryEntry) =>
                    actions[row.action ?? ""] ?? row.action,
                },
              ]
            : [
                {
                  title: "Trạng thái",
                  render: (_: unknown, row: HistoryEntry) =>
                    (row.from_status
                      ? (batchStatuses[row.from_status] ?? row.from_status) +
                        " → "
                      : "") +
                    (batchStatuses[row.to_status ?? ""] ?? row.to_status),
                },
                { title: "Lý do", dataIndex: "reason" },
              ]),
        ]}
        expandable={
          kind === "audit"
            ? {
                expandedRowRender: (row) => (
                  <Space orientation="vertical" style={{ width: "100%" }}>
                    <Typography.Text strong>Trước thay đổi</Typography.Text>
                    <AuditState value={row.before_state} />
                    <Typography.Text strong>Sau thay đổi</Typography.Text>
                    <AuditState value={row.after_state} />
                  </Space>
                ),
              }
            : undefined
        }
      />
      <Space>
        <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Trước
        </Button>
        <Typography.Text>Trang {page}</Typography.Text>
        <Button
          disabled={!history.data?.meta.has_more}
          onClick={() => setPage((p) => p + 1)}
        >
          Sau
        </Button>
      </Space>
    </>
  );
}
