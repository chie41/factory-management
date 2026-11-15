import { laborPriceText as currencyText } from "./laborPrice";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Flex,
  Row,
  Col,
  Statistic,
  theme,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Typography,
} from "antd";
import { catalogGet, catalogWrite } from "./api";
import type { Group } from "./DesignGroups";
import {
  ProductionSteps,
  useUnsavedProduction,
  validateProduction,
  workflowPath,
  type ProductionDefinition,
  type ResolvedWorkflow,
} from "./ProductionWorkflow";
import { LaborPriceInput } from "./LaborPriceInput";
import { decimalPattern } from "../../utils/decimal";
import { RequestError } from "../../components/common/RequestError";
import { usePermissions } from "../auth/hooks/usePermissions";

type GroupDetail = Group & {
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};
type Draft = {
  group: GroupDetail;
  workflow: ResolvedWorkflow;
  definition: ProductionDefinition;
  stepsDirty: boolean;
};
export function DesignGroupDetail({
  id,
  close,
}: {
  id: string;
  close: () => void;
}) {
  const { token } = theme.useToken();
  const { can } = usePermissions(),
    { modal, message } = App.useApp(),
    cache = useQueryClient();
  const [draft, setDraft] = useState<Draft>(),
    [dirty, setDirty] = useState(false),
    [validation, setValidation] = useState("");
  const [validationAttempt, setValidationAttempt] = useState(0);
  useUnsavedProduction(dirty);
  const group = useQuery({
    queryKey: ["design-group", id],
    queryFn: () => catalogGet<GroupDetail>("/design-model-groups/" + id),
  });
  const workflow = useQuery({
    queryKey: ["production-workflow", "group", id],
    queryFn: () => catalogGet<ResolvedWorkflow>(workflowPath("group", id)),
    refetchInterval: 15000,
  });
  const save = useMutation({
    mutationFn: () =>
      catalogWrite<ResolvedWorkflow>(
        workflowPath("group", id),
        {
          version: draft!.workflow.version,
          action: "SAVE",
          groupInfo: {
            version: draft!.group.version,
            name: draft!.group.name,
            default_labor_price_per_15g:
              draft!.group.default_labor_price_per_15g ?? null,
          },
          ...(draft!.stepsDirty ? { workflow: draft!.definition } : {}),
        },
        "patch",
      ),
    onSuccess: async () => {
      setDraft(undefined);
      setDirty(false);
      setValidation("");
      await Promise.all(
        [
          "design-groups",
          "design-group",
          "catalog",
          "production-workflow",
          "customer-labor-prices",
          "customer-labor-price-models",
          "quick-options",
          "quick-effective-prices",
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
      message.success("Đã lưu thông tin nhóm và công đoạn");
    },
  });
  const discard = (exit: boolean) => {
    const finish = () => {
      setDraft(undefined);
      setDirty(false);
      setValidation("");
      save.reset();
      if (exit) close();
    };
    if (dirty)
      modal.confirm({
        title: "Bỏ thay đổi chưa lưu?",
        content: "Thông tin nhóm và các công đoạn chưa lưu sẽ bị bỏ.",
        okText: "Bỏ thay đổi",
        cancelText: "Tiếp tục sửa",
        onOk: finish,
      });
    else finish();
  };
  const current = draft?.group ?? group.data;
  const update = (values: Partial<GroupDetail>) => {
    setDraft((d) => (d ? { ...d, group: { ...d.group, ...values } } : d));
    setDirty(true);
    setValidation("");
  };
  const submit = () => {
    if (!draft) return;
    setValidationAttempt((value) => value + 1);
    const rate = draft.group.default_labor_price_per_15g;
    const error = !draft.group.name.trim()
      ? "Nhập tên nhóm"
      : rate != null && !decimalPattern.test(rate)
        ? "Giá công nhóm phải không âm, tối đa 4 số lẻ"
        : validateProduction(draft.definition);
    setValidation(error);
    if (!error) save.mutate();
  };
  return (
    <Modal
      open
      width={draft ? 1060 : 960}
      styles={{
        body: {
          maxHeight: "70dvh",
          overflowY: "auto",
          overflowX: "hidden",
          minWidth: 0,
        },
      }}
      style={{ maxWidth: "calc(100vw - " + token.marginLG + "px)" }}
      title={
        <Flex vertical gap={token.marginXXS}>
          <Typography.Text
            strong
            style={{ fontSize: token.fontSizeLG, overflowWrap: "anywhere" }}
          >
            {current?.name || "Nhóm mẫu mã"}
          </Typography.Text>
          <Typography.Text
            type="secondary"
            style={{
              fontSize: token.fontSizeSM,
            }}
          >
            Chi tiết nhóm mẫu mã
          </Typography.Text>
        </Flex>
      }
      maskClosable={false}
      closable={!save.isPending}
      onCancel={() => discard(true)}
      footer={
        draft ? (
          <Space>
            <Button disabled={save.isPending} onClick={() => discard(false)}>
              Hủy
            </Button>
            <Button
              type="primary"
              disabled={!dirty}
              loading={save.isPending}
              onClick={submit}
            >
              Lưu thay đổi
            </Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={close}>Đóng</Button>
            {can("design_models.groups.manage") && (
              <Button
                type="primary"
                disabled={
                  !group.data ||
                  !workflow.data ||
                  !!group.error ||
                  !!workflow.error
                }
                onClick={() => {
                  save.reset();
                  setDraft({
                    group: structuredClone(group.data!),
                    workflow: structuredClone(workflow.data!),
                    definition: structuredClone(
                      workflow.data!.effectiveWorkflow ?? { steps: [] },
                    ),
                    stepsDirty: false,
                  });
                }}
              >
                Chỉnh sửa nhóm
              </Button>
            )}
          </Space>
        )
      }
    >
      <RequestError error={group.error} retry={() => void group.refetch()} />
      <RequestError
        error={workflow.error}
        retry={() => void workflow.refetch()}
      />
      <RequestError error={save.error} />
      {validation && <Alert type="error" title={validation} />}
      {dirty && (
        <Typography.Text type="warning">Có thay đổi chưa lưu</Typography.Text>
      )}
      {!current || workflow.isPending ? (
        <Spin />
      ) : (
        <Flex vertical gap={token.marginLG}>
          <div
            style={{
              background: token.colorFillAlter,
              borderRadius: token.borderRadiusLG,
              padding: token.padding,
            }}
          >
            <Row gutter={[token.margin, token.marginSM]}>
              <Col xs={24} sm={12}>
                <Statistic
                  title="Giá công nhóm / 15g"
                  value={current.default_labor_price_per_15g ?? ""}
                  formatter={() =>
                    current.default_labor_price_per_15g == null
                      ? "Chưa cấu hình"
                      : currencyText(current.default_labor_price_per_15g, "THB")
                  }
                  styles={{
                    content: {
                      color: token.colorPrimary,
                      fontSize: token.fontSizeHeading3,
                      fontWeight: token.fontWeightStrong,
                    },
                  }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="Số mẫu mã" value={current.used_count} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="Số công đoạn"
                  value={
                    (draft?.definition ?? workflow.data?.effectiveWorkflow)
                      ?.steps.length ?? 0
                  }
                />
              </Col>
            </Row>
          </div>
          {draft && (
            <Form layout="vertical" disabled={save.isPending}>
              <Row gutter={token.margin}>
                <Col xs={24} sm={15}>
                  <Form.Item
                    label="Tên nhóm"
                    required
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      maxLength={180}
                      value={current.name}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={9}>
                  <Form.Item
                    label="Giá công nhóm / 15g (B)"
                    tooltip="Giá công áp dụng cho khách hàng, độc lập với đơn giá trả thợ từng công đoạn."
                    style={{ marginBottom: 0 }}
                  >
                    <LaborPriceInput
                      value={current.default_labor_price_per_15g ?? ""}
                      placeholder="Chưa cấu hình giá"
                      onChange={(value) =>
                        update({ default_labor_price_per_15g: value || null })
                      }
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          )}
          <section aria-label="Quy trình sản xuất">
            <Flex
              justify="space-between"
              align="center"
              style={{ marginBottom: token.marginSM }}
            >
              <Typography.Text strong>Quy trình sản xuất</Typography.Text>
              {workflow.data?.revision && (
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: token.fontSizeSM }}
                >
                  Revision {workflow.data.revision}
                </Typography.Text>
              )}
            </Flex>
            <ProductionSteps
              validationAttempt={validationAttempt}
              value={
                draft?.definition ?? workflow.data?.effectiveWorkflow ?? null
              }
              disabled={save.isPending}
              onChange={
                draft
                  ? (definition) => {
                      setDraft((d) =>
                        d ? { ...d, definition, stepsDirty: true } : d,
                      );
                      setDirty(true);
                      setValidation("");
                    }
                  : undefined
              }
            />
          </section>
          <Flex
            wrap
            gap={token.marginSM}
            style={{
              borderTop: "1px solid " + token.colorBorderSecondary,
              paddingTop: token.paddingSM,
            }}
          >
            {current.created_at && (
              <Typography.Text
                type="secondary"
                style={{ fontSize: token.fontSizeSM }}
              >
                Ngày tạo: {new Date(current.created_at).toLocaleString("vi-VN")}
              </Typography.Text>
            )}
            {current.updated_at && (
              <Typography.Text
                type="secondary"
                style={{ fontSize: token.fontSizeSM }}
              >
                Cập nhật: {new Date(current.updated_at).toLocaleString("vi-VN")}
              </Typography.Text>
            )}
          </Flex>
        </Flex>
      )}
    </Modal>
  );
}

