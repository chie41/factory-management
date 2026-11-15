import type { CSSProperties } from "react";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { BatchTimeline } from "../features/production/BatchTimeline";
import "../features/production/production-approved.css";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Descriptions,
  Flex,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  theme,
} from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { RequestError } from "../components/common/RequestError";
import { usePermissions } from "../features/auth/hooks/usePermissions";
import {
  ProductionSteps,
  useUnsavedProduction,
  validateProduction,
  type ProductionDefinition,
} from "../features/catalog/ProductionWorkflow";
import {
  laborDecimalText,
  laborPriceText,
} from "../features/catalog/laborPrice";
import {
  batchGet,
  batchWrite,
  batchStatuses,
  type Batch,
} from "../features/production/api";
import {
  getExecution,
  executionStatuses,
} from "../features/production/executionApi";
import { BatchPlanEdit } from "../features/production/BatchPlanEdit";
import { BatchHistory } from "../features/production/BatchHistory";
import {
  ExecutionForm,
  type ExecutionFormContext,
} from "../features/production/ExecutionForm";
import type { Execution } from "../features/production/executionApi";
import {
  StageOperations,
  sumPlannedLabor,
} from "../features/production/StageOperations";
export function ProductionBatchDetailPage() {
  const { id } = useParams();
  return id ? <BatchDetail key={id} id={id} /> : null;
}
function BatchDetail({ id }: { id: string }) {
  const { can } = usePermissions(),
    { modal, message } = App.useApp(),
    { token } = theme.useToken(),
    navigate = useNavigate(),
    cache = useQueryClient();
  const [planEdit, setPlanEdit] = useState<Batch>(),
    [draft, setDraft] = useState<ProductionDefinition>(),
    [baseVersion, setBaseVersion] = useState(""),
    [dirty, setDirty] = useState(false),
    [validation, setValidation] = useState(""),
    [attempt, setAttempt] = useState(0),
    [entryForm, setEntryForm] = useState<{
      context: ExecutionFormContext;
      data: Execution;
    }>();
  useUnsavedProduction(dirty);
  const query = useQuery({
      queryKey: ["production-batch", id],
      queryFn: () => batchGet<Batch>("/" + id),
    }),
    batch = query.data;
  const execution = useQuery({
      queryKey: ["production-execution", id],
      queryFn: () => getExecution(id),
      refetchInterval: 15000,
    }),
    data = execution.data;
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["production-batch", id] }),
      cache.invalidateQueries({ queryKey: ["production-batches"] }),
      cache.invalidateQueries({ queryKey: ["production-history", id] }),
      cache.invalidateQueries({ queryKey: ["production-execution", id] }),
    ]);
  };
  const save = useMutation({
    mutationFn: () =>
      batchWrite("/" + id + "/workflow", {
        version: baseVersion,
        workflow: draft,
      }),
    onSuccess: async () => {
      setDraft(undefined);
      setDirty(false);
      setValidation("");
      await refresh();
      message.success("Đã lưu quy trình riêng của lô");
    },
  });
  const discard = (back = false) => {
    const finish = () => {
      setDraft(undefined);
      setDirty(false);
      setValidation("");
      save.reset();
      if (back) navigate("/production-batches");
    };
    if (dirty)
      modal.confirm({
        title: "Bỏ thay đổi quy trình chưa lưu?",
        okText: "Bỏ thay đổi",
        cancelText: "Tiếp tục sửa",
        onOk: finish,
      });
    else finish();
  };
  const stamp = (value?: string | null) =>
    value ? new Date(value).toLocaleString("vi-VN") : "Chưa cấu hình";
  const open = (context: ExecutionFormContext) => {
    if (data) setEntryForm({ context, data: structuredClone(data) });
  };
  const completed =
      data?.stages.filter((s) => s.execution_status === "COMPLETED").length ??
      0,
    total = data?.stages.length ?? 0;
  const plannedLabor = data ? sumPlannedLabor(data.assignments) : null;
  return (
    <section
      className="workspace-page production-detail"
      style={
        {
          "--production-border": token.colorBorderSecondary,
          "--production-surface": token.colorBgContainer,
          "--production-primary": token.colorPrimary,
          "--production-primary-bg": token.colorPrimaryBg,
          "--production-muted": token.colorTextSecondary,
          "--production-fill": token.colorFillSecondary,
        } as CSSProperties
      }
    >
      <Flex vertical gap="middle" style={{ minWidth: 0 }}>
        <RequestError error={query.error} retry={() => void query.refetch()} />
        <RequestError
          error={execution.error}
          retry={() => void execution.refetch()}
        />
        {query.isPending ? (
          <Spin />
        ) : (
          batch && (
            <>
              <header className="production-detail-header">
                <div className="production-detail-heading">
                  <Button
                    icon={<ArrowLeftOutlined />}
                    aria-label="Quay về danh sách lô"
                    disabled={save.isPending}
                    onClick={() => discard(true)}
                  />
                  <div>
                    <Typography.Title level={2}>{batch.code}</Typography.Title>
                    <Typography.Text type="secondary">
                      {batch.model_code_snapshot} · {batch.model_name_snapshot}
                    </Typography.Text>
                    <div>
                      <Tag
                        color={
                          batch.status === "COMPLETED"
                            ? "success"
                            : batch.status === "IN_PROGRESS"
                              ? "processing"
                              : "default"
                        }
                      >
                        {batchStatuses[batch.status] ?? batch.status}
                      </Tag>
                    </div>
                  </div>
                </div>
                <Space wrap>
                  {can("production.update") && (
                    <Button
                      disabled={!!draft}
                      onClick={() => setPlanEdit(structuredClone(batch))}
                    >
                      Sửa kế hoạch
                    </Button>
                  )}
                  {can("production.workflow.update") && !draft && (
                    <Button
                      disabled={["COMPLETED", "CANCELLED"].includes(
                        batch.status,
                      )}
                      onClick={() => {
                        setBaseVersion(batch.version);
                        setDraft(
                          structuredClone(
                            batch.workflow_snapshot?.definition ?? {
                              steps: [],
                            },
                          ),
                        );
                        setAttempt(0);
                      }}
                    >
                      Sửa quy trình lô
                    </Button>
                  )}
                </Space>
              </header>
              <section className="production-surface">
                <Typography.Text className="production-section-label">
                  TỔNG QUAN LÔ
                </Typography.Text>
                <div className="production-overview-grid">
                  <div className="production-overview-cell">
                    <Typography.Text type="secondary">
                      Số lượng sản xuất
                    </Typography.Text>
                    <span className="production-overview-value">
                      {batch.planned_quantity.toLocaleString("vi-VN")} SP
                    </span>
                  </div>
                  <div className="production-overview-cell">
                    <Typography.Text type="secondary">
                      Trọng lượng dự kiến
                    </Typography.Text>
                    {data?.planned_weight_g != null ? (
                      <span className="production-overview-value">
                        {laborDecimalText(data.planned_weight_g)} g
                      </span>
                    ) : (
                      <Typography.Text type="secondary">
                        Chưa có định mức trọng lượng
                      </Typography.Text>
                    )}
                    {data?.standard_weight_per_unit_g != null && (
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        {laborDecimalText(data.standard_weight_per_unit_g)} g /
                        SP
                      </Typography.Text>
                    )}
                  </div>
                  <div className="production-overview-cell">
                    <Typography.Text type="secondary">
                      Công đoạn hoàn thành
                    </Typography.Text>
                    {data ? (
                      <span className="production-overview-value">
                        {completed} / {total}
                      </span>
                    ) : (
                      <Spin size="small" />
                    )}
                  </div>
                  <div className="production-overview-cell">
                    <Typography.Text type="secondary">
                      Tiền công dự kiến
                    </Typography.Text>
                    {data?.assignments.length && plannedLabor != null ? (
                      <span className="production-overview-value">
                        {plannedLabor}
                      </span>
                    ) : (
                      <Typography.Text type="secondary">
                        {data?.assignments.length
                          ? "Chưa đủ định mức"
                          : "Chưa phân công"}
                      </Typography.Text>
                    )}
                  </div>
                </div>
              </section>
              <BatchTimeline batch={batch} />
              {draft ? (
                <Card title="Chỉnh sửa quy trình riêng của lô">
                  <Flex vertical gap="middle">
                    <Alert
                      type="info"
                      title="Công đoạn đã có nghiệp vụ được bảo vệ. Có thể sắp xếp hiển thị và cấu hình công đoạn chưa phát sinh; backend kiểm tra trước khi lưu."
                    />
                    <RequestError error={save.error} />
                    {validation && <Alert type="error" title={validation} />}
                    <ProductionSteps
                      value={draft}
                      validationAttempt={attempt}
                      disabled={save.isPending}
                      protectedStepIds={data?.stages
                        .filter(
                          (s) =>
                            s.execution_locked_at || s.execution_started_at,
                        )
                        .map((s) => s.step_id)}
                      onChange={(value) => {
                        setDraft(value);
                        setDirty(true);
                        setValidation("");
                      }}
                    />
                    <Flex justify="end" gap={token.marginSM}>
                      <Button
                        disabled={save.isPending}
                        onClick={() => discard()}
                      >
                        Hủy
                      </Button>
                      <Button
                        type="primary"
                        disabled={!dirty}
                        loading={save.isPending}
                        onClick={() => {
                          setAttempt((n) => n + 1);
                          const error = validateProduction(draft);
                          setValidation(error);
                          if (!error) save.mutate();
                        }}
                      >
                        Lưu quy trình
                      </Button>
                    </Flex>
                  </Flex>
                </Card>
              ) : (
                <>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    Quy trình sản xuất
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    Mở công đoạn để quản lý nhân viên, nguyên liệu và đối soát
                  </Typography.Text>
                  {execution.isPending ? (
                    <Spin />
                  ) : (
                    data && (
                      <Collapse
                        className="production-stage-list"
                        expandIconPlacement="end"
                        size="small"
                        defaultActiveKey={
                          data.stages[0] ? [data.stages[0].step_id] : []
                        }
                        items={data.stages.map((stage) => {
                          const workers = data.assignments.filter(
                            (w) => w.step_id === stage.step_id,
                          );
                          return {
                            key: stage.step_id,
                            label: (
                              <div className="production-stage-label">
                                <span className="production-stage-number">
                                  {String(stage.display_order + 1).padStart(
                                    2,
                                    "0",
                                  )}
                                </span>
                                <div>
                                  <Typography.Text
                                    strong
                                    className="production-stage-name"
                                  >
                                    {stage.name}
                                  </Typography.Text>
                                  <div className="production-stage-meta">
                                    {stage.dependencies.length > 0 && (
                                      <span>
                                        Sau:{" "}
                                        {stage.dependencies
                                          .map(
                                            (id) =>
                                              data.stages.find(
                                                (s) => s.step_id === id,
                                              )?.name ?? id,
                                          )
                                          .join(", ")}
                                      </span>
                                    )}
                                    {stage.labor_rate_per_15g != null && (
                                      <span>
                                        {laborPriceText(
                                          stage.labor_rate_per_15g,
                                          "THB",
                                        )}{" "}
                                        / 15g
                                      </span>
                                    )}
                                    {workers.length > 0 && (
                                      <span>
                                        {workers.length} thợ ·{" "}
                                        {stage.completed_quantity}/
                                        {data.planned_quantity} SP
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Tooltip
                                  title={
                                    stage.waiting_for.length
                                      ? "Đang chờ: " +
                                        stage.waiting_for
                                          .map((s) => s.name)
                                          .join(", ")
                                      : undefined
                                  }
                                >
                                  <Tag
                                    className="production-stage-status"
                                    color={
                                      stage.execution_status === "COMPLETED"
                                        ? "success"
                                        : stage.execution_status ===
                                            "IN_PROGRESS"
                                          ? "processing"
                                          : stage.execution_status === "PAUSED"
                                            ? "warning"
                                            : "default"
                                    }
                                  >
                                    <span>
                                      {stage.waiting_for.length &&
                                      stage.execution_status === "NOT_STARTED"
                                        ? "Chờ: " +
                                          stage.waiting_for
                                            .map((s) => s.name)
                                            .join(", ")
                                        : executionStatuses[
                                            stage.execution_status
                                          ]}
                                    </span>
                                  </Tag>
                                </Tooltip>
                              </div>
                            ),

                            children: (
                              <StageOperations
                                stage={stage}
                                data={data}
                                open={open}
                                locked={!!draft}
                              />
                            ),
                          };
                        })}
                      />
                    )
                  )}
                </>
              )}
              <Collapse
                size="small"
                ghost
                items={[
                  {
                    key: "info",
                    label: "Thông tin lô · Nhật ký",
                    children: (
                      <Flex vertical gap="middle">
                        <Descriptions
                          column={{ xs: 1, sm: 2 }}
                          items={[
                            {
                              key: "source",
                              label: "Quy trình nguồn",
                              children:
                                (batch.source_metadata.mode === "CUSTOM"
                                  ? "Mẫu mã"
                                  : (batch.source_metadata.group_name ??
                                    "Nhóm mẫu mã")) +
                                " · " +
                                batch.source_metadata.revision,
                            },
                            {
                              key: "actualStart",
                              label: "Bắt đầu thực tế",
                              children: batch.actual_start
                                ? stamp(batch.actual_start)
                                : "Chưa ghi nhận",
                            },
                            {
                              key: "actualEnd",
                              label: "Kết thúc thực tế",
                              children: batch.actual_end
                                ? stamp(batch.actual_end)
                                : "Chưa chốt toàn lô",
                            },
                            {
                              key: "note",
                              label: "Ghi chú",
                              children: batch.note || "—",
                            },
                          ]}
                        />
                        <BatchHistory id={id} kind="audit" />
                      </Flex>
                    ),
                  },
                ]}
              />
              {planEdit && (
                <BatchPlanEdit
                  batch={planEdit}
                  close={() => setPlanEdit(undefined)}
                  saved={refresh}
                />
              )}
              {entryForm && (
                <ExecutionForm
                  id={id}
                  data={entryForm.data}
                  context={entryForm.context}
                  close={() => setEntryForm(undefined)}
                  saved={refresh}
                />
              )}
            </>
          )
        )}
      </Flex>
    </section>
  );
}
