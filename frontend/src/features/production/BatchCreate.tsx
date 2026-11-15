import "./production-approved.css";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Form,
  InputNumber,
  Select,
  Space,
  Spin,
  Typography,
} from "antd";
import { useNavigate } from "react-router-dom";
import { PageFrame } from "../../components/common/PageFrame";
import { catalogList } from "../catalog/api";
import {
  ProductionSteps,
  useUnsavedProduction,
  validateProduction,
  type ProductionDefinition,
} from "../catalog/ProductionWorkflow";
import { RequestError } from "../../components/common/RequestError";
import { BatchPlanFields, serializeBatchPlan } from "./BatchPlanFields";
import { batchGet, batchWrite, type Preview } from "./api";
import { laborDecimalText } from "../catalog/laborPrice";
import { decimalUnits } from "../../utils/decimal";
export function BatchCreatePage() {
  const [form] = Form.useForm(),
    { modal } = App.useApp(),
    navigate = useNavigate();
  const [dirty, setDirty] = useState(false),
    [workflowDirty, setWorkflowDirty] = useState(false),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [modelId, setModelId] = useState<string>(),
    [modelLabel, setModelLabel] = useState<{ value: string; label: string }>(),
    [snapshot, setSnapshot] = useState<Preview>(),
    [draft, setDraft] = useState<ProductionDefinition>(),
    [loadedFor, setLoadedFor] = useState<string>(),
    [attempt, setAttempt] = useState(0),
    [validation, setValidation] = useState("");
  const request = useRef({ signature: "", id: crypto.randomUUID() });
  const [editorGeneration, setEditorGeneration] = useState(0);
  useUnsavedProduction(dirty);
  const quantity = Form.useWatch("planned_quantity", form) ?? 1;
  const models = useQuery({
    queryKey: ["catalog", "production-selector", q, page],
    queryFn: () =>
      catalogList("design-models", {
        q,
        page,
        page_size: 30,
        status: "ACTIVE",
      }),
  });
  const source = useQuery({
    queryKey: ["batch-preview", modelId],
    queryFn: () =>
      batchGet<Preview>("/workflow-preview?design_model_id=" + modelId),
    enabled: !!modelId,
    staleTime: 0,
  });
  useEffect(() => {
    if (modelId && source.data && !source.isFetching && loadedFor !== modelId) {
      setSnapshot(source.data);
      setDraft(structuredClone(source.data.effectiveWorkflow ?? { steps: [] }));
      setLoadedFor(modelId);
    }
  }, [modelId, source.data, source.isFetching, loadedFor]);
  const options = (models.data?.data ?? []).map((m) => ({
    value: m.id,
    label: m.code + " · " + m.name,
  }));
  if (modelLabel && !options.some((o) => o.value === modelLabel.value))
    options.push(modelLabel);
  const create = useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      const data = {
        ...serializeBatchPlan(values),
        design_model_id: modelId,
        source_version: snapshot!.version,
        workflow: draft,
      };
      const signature = JSON.stringify(data);
      if (signature !== request.current.signature)
        request.current = { signature, id: crypto.randomUUID() };
      return batchWrite(
        "",
        { ...data, request_id: request.current.id },
        "post",
      );
    },
    onSuccess: (batch) => {
      setDirty(false);
      navigate("/production-batches/" + batch.id);
    },
  });
  const back = () => {
    if (dirty)
      modal.confirm({
        title: "Bỏ dữ liệu lô chưa lưu?",
        okText: "Bỏ thay đổi",
        cancelText: "Tiếp tục nhập",
        onOk: () => navigate("/production-batches"),
      });
    else navigate("/production-batches");
  };
  const changeModel = (id: string) => {
    const apply = () => {
      setModelId(id);
      setModelLabel(options.find((o) => o.value === id));
      setLoadedFor(undefined);
      setSnapshot(undefined);
      setDraft(undefined);
      setWorkflowDirty(false);
      setDirty(true);
      setValidation("");
      setAttempt(0);
    };
    if (id === modelId) return;
    if (workflowDirty)
      modal.confirm({
        title: "Đổi mẫu mã và bỏ quy trình đang chỉnh sửa?",
        okText: "Đổi mẫu mã",
        cancelText: "Giữ bản nháp",
        onOk: apply,
      });
    else apply();
  };
  const restore = () => {
    const apply = async () => {
      const result = await source.refetch();
      if (result.data) {
        setEditorGeneration((n) => n + 1);
        setSnapshot(result.data);
        setDraft(
          structuredClone(result.data.effectiveWorkflow ?? { steps: [] }),
        );
        setWorkflowDirty(false);
        setDirty(true);
        setValidation("");
        setAttempt(0);
      }
    };
    if (workflowDirty)
      modal.confirm({
        title: "Khôi phục quy trình mới nhất từ mẫu mã?",
        content: "Các chỉnh sửa riêng trong bản nháp sẽ bị bỏ.",
        okText: "Khôi phục",
        cancelText: "Hủy",
        onOk: apply,
      });
    else void apply();
  };
  let weight = "Chưa có dữ liệu quy đổi";
  if (
    snapshot?.standard_weight_per_unit_g != null &&
    Number.isInteger(quantity)
  ) {
    const total =
      decimalUnits(snapshot.standard_weight_per_unit_g) * BigInt(quantity);
    weight =
      laborDecimalText(
        (total / 10000n).toString() +
          "." +
          (total % 10000n).toString().padStart(4, "0"),
      ) + " g";
  }
  return (
    <PageFrame
      title="Tạo lô sản xuất"
      subtitle="Chọn mẫu mã, chỉnh sửa quy trình riêng và nhập kế hoạch trên một trang"
    >
      <Flex
        className="production-create"
        vertical
        gap="middle"
        style={{ minWidth: 0 }}
      >
        <RequestError error={create.error} />
        <RequestError
          error={models.error}
          retry={() => void models.refetch()}
        />
        {validation && <Alert type="error" title={validation} />}
        <Card title="Thông tin lô">
          <Form
            form={form}
            layout="vertical"
            initialValues={{ planned_quantity: 1 }}
            disabled={create.isPending}
            onValuesChange={() => setDirty(true)}
            onFinish={(values) => {
              if (!draft || !snapshot?.effectiveWorkflow) return;
              setAttempt((n) => n + 1);
              const error = validateProduction(draft);
              setValidation(error);
              if (!error) create.mutate(values);
            }}
          >
            <div className="production-create-grid">
              <Form.Item label="Mẫu mã" required>
                <Select
                  value={modelId}
                  placeholder="Chọn mẫu mã"
                  loading={models.isFetching}
                  options={options}
                  showSearch={{
                    filterOption: false,
                    onSearch: (text) => {
                      setQ(text);
                      setPage(1);
                    },
                  }}
                  onChange={changeModel}
                  popupRender={(menu) => (
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
                          disabled={page * 30 >= (models.data?.meta.total ?? 0)}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Sau
                        </Button>
                      </Space>
                    </>
                  )}
                />
              </Form.Item>
              <Form.Item
                label="Số lượng sản phẩm"
                name="planned_quantity"
                rules={[
                  { required: true, message: "Nhập số lượng" },
                  {
                    type: "integer",
                    min: 1,
                    max: 2147483647,
                    message: "Số lượng nguyên dương",
                  },
                ]}
              >
                <InputNumber
                  min={1}
                  max={2147483647}
                  precision={0}
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <div className="production-create-weight">
                <Typography.Text>Trọng lượng dự kiến</Typography.Text>
                <Typography.Text strong style={{ fontSize: 20 }}>
                  {weight}
                </Typography.Text>
                {snapshot?.standard_weight_per_unit_g != null && (
                  <Typography.Text type="secondary">
                    {laborDecimalText(snapshot.standard_weight_per_unit_g)} g /
                    sản phẩm
                  </Typography.Text>
                )}
              </div>
            </div>
            <BatchPlanFields hideQuantity />
          </Form>
        </Card>
        <Card title="Quy trình sản xuất">
          <Typography.Paragraph type="secondary">
            Quy trình được sao chép từ mẫu mã. Thay đổi chỉ áp dụng cho lô này.
          </Typography.Paragraph>
          <RequestError
            error={source.error}
            retry={() => void source.refetch()}
          />
          {source.isFetching ? (
            <Spin />
          ) : snapshot?.effectiveWorkflow && draft ? (
            <ProductionSteps
              key={modelId + ":" + editorGeneration}
              value={draft}
              validationAttempt={attempt}
              disabled={create.isPending}
              onChange={(value) => {
                setDraft(value);
                setDirty(true);
                setWorkflowDirty(true);
                setValidation("");
              }}
            />
          ) : (
            <Alert
              type="info"
              title={
                modelId
                  ? "Mẫu mã chưa có quy trình hiệu lực. Cấu hình quy trình nguồn trước khi tạo lô."
                  : "Chọn mẫu mã để cấu hình công đoạn cho lô."
              }
            />
          )}
          <Flex
            justify="space-between"
            align="center"
            wrap
            gap={12}
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid var(--ant-color-border-secondary, #f0f0f0)",
            }}
          >
            <Button
              disabled={!modelId || create.isPending}
              loading={source.isFetching}
              onClick={restore}
            >
              Khôi phục từ Mẫu mã
            </Button>
            <Space>
              <Button disabled={create.isPending} onClick={back}>
                Hủy
              </Button>
              <Button
                type="primary"
                loading={create.isPending}
                disabled={
                  !snapshot?.effectiveWorkflow ||
                  source.isFetching ||
                  !!source.error
                }
                onClick={() => form.submit()}
              >
                Tạo lô sản xuất
              </Button>
            </Space>
          </Flex>
        </Card>
      </Flex>
    </PageFrame>
  );
}
