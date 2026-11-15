import { laborPriceText as currencyText } from "./laborPrice";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Empty,
  Space,
  Spin,
  Tag,
  theme,
  Typography,
} from "antd";
import { catalogGet, catalogWrite } from "./api";
import { ProductionWorkflowEditor } from "./ProductionWorkflowEditor";
import { decimalPattern } from "../../utils/decimal";
import { RequestError } from "../../components/common/RequestError";
import { usePermissions } from "../auth/hooks/usePermissions";
import { errorText } from "../../services/apiErrors";

export type ProductionStep = {
  estimatedDurationMinutes?: number | null;
  id: string;
  name: string;
  description?: string;
  dependencies: string[];
  laborRatePer15g?: string | null;
  requiresEmployeeConfirmation?: boolean;
};
export type ProductionDefinition = {
  name?: string;
  description?: string;
  steps: ProductionStep[];
};
export type ResolvedWorkflow = {
  id: string;
  mode: "GROUP" | "INHERIT" | "CUSTOM";
  group_name: string | null;
  revision: number | null;
  version: string;
  effectiveWorkflow: ProductionDefinition | null;
};
export const workflowPath = (kind: "group" | "model", id: string) =>
  "/" +
  (kind === "group" ? "design-model-groups" : "design-models") +
  "/" +
  id +
  "/production-workflow";
export function validateProduction(definition: ProductionDefinition) {
  if (
    definition.steps.some(
      (s) =>
        s.estimatedDurationMinutes != null &&
        (!Number.isInteger(s.estimatedDurationMinutes) ||
          s.estimatedDurationMinutes < 0),
    )
  )
    return "Thời lượng công đoạn không hợp lệ";
  const steps = new Map(definition.steps.map((s) => [s.id, s]));
  if (steps.size !== definition.steps.length) return "Trùng ID công đoạn";
  if (definition.steps.some((s) => !s.name.trim()))
    return "Nhập tên cho từng công đoạn";
  if (
    definition.steps.some(
      (s) =>
        s.laborRatePer15g != null && !decimalPattern.test(s.laborRatePer15g),
    )
  )
    return "Giá công phải không âm, tối đa 4 số lẻ";
  const visiting = new Set<string>(),
    done = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id) || !steps.has(id)) return false;
    if (done.has(id)) return true;
    visiting.add(id);
    for (const dep of steps.get(id)!.dependencies)
      if (!visit(dep)) return false;
    visiting.delete(id);
    done.add(id);
    return true;
  };
  return definition.steps.every((s) => visit(s.id))
    ? ""
    : "Dependency không tồn tại, tự phụ thuộc hoặc có chu trình";
}
export function useUnsavedProduction(dirty: boolean) {
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
export function ProductionSteps({
  value,
  onChange,
  disabled = false,
  validationAttempt = 0,
  protectedStepIds,
}: {
  value: ProductionDefinition | null;
  onChange?: (value: ProductionDefinition) => void;
  disabled?: boolean;
  validationAttempt?: number;
  protectedStepIds?: string[];
}) {
  const { token } = theme.useToken();
  if (onChange)
    return (
      <ProductionWorkflowEditor
        protectedStepIds={protectedStepIds}
        value={value ?? { steps: [] }}
        onChange={onChange}
        disabled={disabled}
        validationAttempt={validationAttempt}
      />
    );
  const steps = value?.steps ?? [];
  return (
    <Flex vertical gap={token.marginSM}>
      <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
        Số thứ tự để hiển thị; dependency xác định luồng thực hiện.
      </Typography.Text>
      {!steps.length && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa cấu hình quy trình sản xuất"
        />
      )}
      {steps.map((step, index) => (
        <Card
          key={step.id}
          size="small"
          styles={{ body: { padding: token.paddingSM } }}
        >
          <Flex vertical gap={token.marginXS}>
            <Flex
              justify="space-between"
              align="center"
              wrap
              gap={token.marginXS}
              style={{ width: "100%" }}
            >
              <Space size="small">
                <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                  {String(index + 1).padStart(2, "0")}
                </Tag>
                <Typography.Text strong style={{ overflowWrap: "anywhere" }}>
                  {step.name || "Công đoạn mới"}
                </Typography.Text>
              </Space>
              <Typography.Text
                strong={step.laborRatePer15g != null}
                type={step.laborRatePer15g == null ? "secondary" : undefined}
                style={{
                  color:
                    step.laborRatePer15g == null
                      ? undefined
                      : token.colorPrimary,
                }}
              >
                {step.laborRatePer15g == null
                  ? "Chưa cấu hình giá"
                  : currencyText(step.laborRatePer15g, "THB") + " / 15g"}
              </Typography.Text>
            </Flex>
            <Flex wrap gap={token.marginXS}>
              {step.dependencies.length > 0 && (
                <Tag style={{ marginInlineEnd: 0, whiteSpace: "normal" }}>
                  Sau:{" "}
                  {step.dependencies
                    .map(
                      (id) =>
                        steps.find((s) => s.id === id)?.name ||
                        "Công đoạn chưa đặt tên",
                    )
                    .join(", ")}
                </Tag>
              )}
              <Tag
                color={step.requiresEmployeeConfirmation ? "gold" : "default"}
                style={{ marginInlineEnd: 0 }}
              >
                {step.requiresEmployeeConfirmation
                  ? "Yêu cầu xác nhận"
                  : "Không yêu cầu xác nhận"}
              </Tag>
            </Flex>
            {step.description && (
              <Typography.Paragraph
                type="secondary"
                style={{
                  whiteSpace: "pre-wrap",
                  marginBottom: 0,
                  fontSize: token.fontSizeSM,
                }}
              >
                {step.description}
              </Typography.Paragraph>
            )}
          </Flex>
        </Card>
      ))}
    </Flex>
  );
}

export function ProductionWorkflow({
  kind,
  id,
  onDirtyChange,
}: {
  kind: "group" | "model";
  id: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const path = workflowPath(kind, id),
    { can } = usePermissions(),
    cache = useQueryClient(),
    { message, modal } = App.useApp(),
    { token } = theme.useToken();
  const [draft, setDraft] = useState<ProductionDefinition>(),
    [base, setBase] = useState<ResolvedWorkflow>(),
    [dirty, setDirty] = useState(false),
    [validation, setValidation] = useState("");
  const canRead = can("design_models.read"),
    canEdit = can(
      kind === "group" ? "design_models.groups.manage" : "design_models.update",
    );
  useUnsavedProduction(dirty);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const query = useQuery({
    queryKey: ["production-workflow", kind, id],
    queryFn: () => catalogGet<ResolvedWorkflow>(path),
    enabled: canRead,
    refetchInterval: 15000,
  });
  const save = useMutation({
    mutationFn: (action: "SAVE" | "CUSTOMIZE" | "INHERIT") =>
      catalogWrite<ResolvedWorkflow>(
        path,
        {
          action,
          version: (base ?? query.data)!.version,
          ...(action === "SAVE" ? { workflow: draft } : {}),
        },
        "patch",
      ),
    onSuccess: async (data, action) => {
      setDraft(
        action === "CUSTOMIZE"
          ? structuredClone(data.effectiveWorkflow ?? { steps: [] })
          : undefined,
      );
      setBase(action === "CUSTOMIZE" ? data : undefined);
      setDirty(false);
      setValidation("");
      cache.setQueryData(["production-workflow", kind, id], data);
      await cache.invalidateQueries({ queryKey: ["production-workflow"] });
      message.success("Đã lưu quy trình sản xuất");
    },
    onError: (e) => message.error(errorText(e)),
  });
  const cancel = () => {
    const discard = () => {
      setDraft(undefined);
      setBase(undefined);
      setDirty(false);
      setValidation("");
    };
    if (dirty)
      modal.confirm({
        title: "Bỏ thay đổi chưa lưu?",
        okText: "Bỏ thay đổi",
        cancelText: "Tiếp tục sửa",
        onOk: discard,
      });
    else discard();
  };
  if (!canRead)
    return (
      <Alert type="warning" title="Bạn không có quyền xem quy trình sản xuất" />
    );
  return (
    <Card title="Quy trình sản xuất" style={{ marginTop: token.marginLG }}>
      <RequestError error={query.error} retry={() => void query.refetch()} />
      <RequestError error={save.error} />
      {validation && <Alert type="error" title={validation} />}
      {query.isPending ? (
        <Spin />
      ) : (
        query.data && (
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <Space wrap>
              <Tag
                color={query.data.mode === "CUSTOM" ? "orange" : "processing"}
              >
                {query.data.mode}
              </Tag>
              <Typography.Text type="secondary">
                {query.data.mode === "CUSTOM"
                  ? "Quy trình riêng · Không tự nhận thay đổi của nhóm"
                  : "Nguồn: " + (query.data.group_name ?? "Chưa phân nhóm")}
                {query.data.revision
                  ? " · Revision " + query.data.revision
                  : ""}
              </Typography.Text>
            </Space>
            {!canEdit && (
              <Alert
                type="info"
                title="Chỉ đọc — bạn chưa có quyền chỉnh sửa"
              />
            )}
            {dirty && (
              <Typography.Text type="warning">
                Có thay đổi chưa lưu
              </Typography.Text>
            )}
            <ProductionSteps
              value={draft ?? query.data.effectiveWorkflow}
              disabled={save.isPending}
              onChange={
                draft
                  ? (value) => {
                      setDraft(value);
                      setDirty(true);
                      setValidation("");
                    }
                  : undefined
              }
            />
            <Space wrap>
              {draft ? (
                <>
                  <Button disabled={save.isPending} onClick={cancel}>
                    Hủy
                  </Button>
                  <Button
                    type="primary"
                    loading={save.isPending}
                    disabled={!dirty}
                    onClick={() => {
                      const error = validateProduction(draft);
                      setValidation(error);
                      if (!error) save.mutate("SAVE");
                    }}
                  >
                    Lưu thay đổi
                  </Button>
                </>
              ) : (
                canEdit && (
                  <>
                    {query.data.mode === "INHERIT" ? (
                      <Button
                        type="primary"
                        loading={save.isPending}
                        onClick={() => save.mutate("CUSTOMIZE")}
                      >
                        Tùy chỉnh quy trình
                      </Button>
                    ) : (
                      <Button
                        type="primary"
                        disabled={save.isPending}
                        onClick={() => {
                          setBase(query.data);
                          setDraft(
                            structuredClone(
                              query.data!.effectiveWorkflow ?? { steps: [] },
                            ),
                          );
                        }}
                      >
                        Chỉnh sửa công đoạn
                      </Button>
                    )}
                    {query.data.mode === "CUSTOM" && (
                      <Button
                        disabled={save.isPending}
                        onClick={() =>
                          modal.confirm({
                            title: "Khôi phục quy trình nhóm?",
                            content:
                              "Sử dụng quy trình nhóm mới nhất. Revision riêng vẫn được giữ.",
                            okText: "Khôi phục",
                            cancelText: "Hủy",
                            onOk: () => save.mutateAsync("INHERIT"),
                          })
                        }
                      >
                        Khôi phục quy trình nhóm
                      </Button>
                    )}
                  </>
                )
              )}
            </Space>
          </Space>
        )
      )}
    </Card>
  );
}
