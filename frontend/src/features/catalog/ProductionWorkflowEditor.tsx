import { LaborPriceInput } from "./LaborPriceInput";
import "./production-stage-handle.css";
import { laborPriceText as currencyText } from "./laborPrice";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  App,
  Button,
  Checkbox,
  Col,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  Row,
  Select,
  Tag,
  theme,
  Typography,
} from "antd";
import type { InputRef } from "antd";
import { HolderOutlined } from "@ant-design/icons";
import type {
  ProductionDefinition,
  ProductionStep,
} from "./ProductionWorkflow";
import { decimalPattern } from "../../utils/decimal";

function SortableStage({
  id,
  selected,
  error,
  disabled,
  index,
  children,
}: {
  id: string;
  selected: boolean;
  error: boolean;
  disabled: boolean;
  index: number;
  children: ReactNode;
}) {
  const { token } = theme.useToken();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id, disabled });
  return (
    <Flex
      ref={setNodeRef}
      align="center"
      style={{
        minWidth: 0,
        padding: token.paddingSM,
        gap: token.marginSM,
        minHeight: token.controlHeightLG * 2,
        position: "relative",
        zIndex: isDragging ? 1 : undefined,
        transform: transform
          ? CSS.Transform.toString({ ...transform, x: 0 })
          : undefined,
        transition,
        border:
          "1px solid " +
          (error
            ? token.colorError
            : isDragging || selected
              ? token.colorPrimary
              : token.colorBorderSecondary),
        borderRadius: token.borderRadius,
        background:
          selected || isDragging
            ? token.colorPrimaryBg
            : token.colorBgContainer,
        boxShadow: isDragging
          ? token.boxShadowSecondary
          : isOver
            ? "inset 0 3px 0 " + token.colorPrimary
            : undefined,
      }}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        disabled={disabled}
        type="button"
        className="production-stage-handle"
        aria-label="Kéo để sắp xếp công đoạn"
        onClick={(e) => e.stopPropagation()}
        style={{
          color: token.colorTextTertiary,
          fontSize: token.fontSizeLG,
          cursor: disabled ? "not-allowed" : isDragging ? "grabbing" : "grab",
        }}
      >
        <HolderOutlined />
      </button>
      <Tag
        color={error ? "error" : "processing"}
        style={{ marginInlineEnd: 0, flexShrink: 0 }}
      >
        {String(index + 1).padStart(2, "0")}
      </Tag>
      {children}
    </Flex>
  );
}

function reaches(
  steps: ProductionStep[],
  from: string,
  target: string,
  seen = new Set<string>(),
): boolean {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return (
    steps
      .find((s) => s.id === from)
      ?.dependencies.some((id) => reaches(steps, id, target, seen)) ?? false
  );
}
export function productionStepErrors(steps: ProductionStep[]) {
  const errors: Record<string, string[]> = {};
  for (const step of steps) {
    const messages: string[] = [];
    if (
      step.estimatedDurationMinutes != null &&
      (!Number.isInteger(step.estimatedDurationMinutes) ||
        step.estimatedDurationMinutes < 0)
    )
      messages.push("Thời lượng không hợp lệ");
    if (!step.name.trim()) messages.push("Nhập tên công đoạn");
    if (step.name.length > 180) messages.push("Tên tối đa 180 ký tự");
    if (
      step.laborRatePer15g != null &&
      !decimalPattern.test(step.laborRatePer15g)
    )
      messages.push("Giá công không âm, tối đa 4 số lẻ");
    if (steps.filter((s) => s.id === step.id).length > 1)
      messages.push("Trùng ID công đoạn");
    if (step.dependencies.some((id) => !steps.some((s) => s.id === id)))
      messages.push("Công đoạn phụ thuộc không tồn tại");
    if (step.dependencies.some((id) => reaches(steps, id, step.id)))
      messages.push("Quan hệ phụ thuộc tạo chu trình");
    if (new Set(step.dependencies).size !== step.dependencies.length)
      messages.push("Công đoạn phụ thuộc bị trùng");
    if (messages.length) errors[step.id] = messages;
  }
  return errors;
}

export function ProductionWorkflowEditor({
  value,
  onChange,
  disabled = false,
  validationAttempt = 0,
  protectedStepIds = [],
}: {
  value: ProductionDefinition;
  onChange: (value: ProductionDefinition) => void;
  disabled?: boolean;
  validationAttempt?: number;
  protectedStepIds?: string[];
}) {
  const { token } = theme.useToken(),
    { modal, message } = App.useApp(),
    screens = Grid.useBreakpoint();
  const steps = value.steps;
  const [selectedId, setSelectedId] = useState<string | undefined>(
      steps[0]?.id,
    ),
    [focusId, setFocusId] = useState<string>();
  const nameRef = useRef<InputRef>(null);
  const selected = steps.find((s) => s.id === selectedId) ?? steps[0];
  const errors = validationAttempt ? productionStepErrors(steps) : {};
  const currentErrors = selected ? (errors[selected.id] ?? []) : [];
  useEffect(() => {
    if (validationAttempt) {
      const invalid = Object.keys(productionStepErrors(value.steps))[0];
      if (invalid) {
        setSelectedId(invalid);
        setFocusId(invalid);
      }
    }
  }, [validationAttempt]); // Validate all steps only when the owner requests a save.
  useEffect(() => {
    if (focusId && selected?.id === focusId) {
      nameRef.current?.focus();
      setFocusId(undefined);
    }
  }, [focusId, selected?.id]);
  const change = (next: ProductionStep[]) =>
    onChange({ ...value, steps: next });
  const update = (data: Partial<ProductionStep>) => {
    if (selected)
      change(steps.map((s) => (s.id === selected.id ? { ...s, ...data } : s)));
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const add = () => {
    const step: ProductionStep = {
      id: crypto.randomUUID(),
      name: "",
      description: "",
      dependencies: [],
      laborRatePer15g: null,
      requiresEmployeeConfirmation: false,
    };
    change([...steps, step]);
    setSelectedId(step.id);
    setFocusId(step.id);
  };
  const removeSelected = () => {
    if (!selected) return;
    if (protectedStepIds.includes(selected.id)) {
      message.error("Công đoạn đã có dữ liệu nghiệp vụ, không thể xóa");
      return;
    }
    const step = selected,
      index = steps.findIndex((s) => s.id === step.id);
    const dependents = steps.filter((s) => s.dependencies.includes(step.id));
    if (dependents.length) {
      message.error(
        "Không thể xóa. Hãy gỡ phụ thuộc tại: " +
          dependents.map((s) => s.name || "Công đoạn chưa đặt tên").join(", "),
      );
      return;
    }
    modal.confirm({
      title: "Xóa công đoạn " + (step.name || "chưa đặt tên") + "?",
      okText: "Xóa",
      cancelText: "Hủy",
      okButtonProps: { danger: true },
      onOk: () => {
        change(steps.filter((s) => s.id !== step.id));
        setSelectedId((steps[index + 1] ?? steps[index - 1])?.id);
      },
    });
  };

  return (
    <Row gutter={[token.margin, token.margin]} style={{ minWidth: 0 }}>
      <Col xs={24} md={8} style={{ minWidth: 0 }}>
        <Flex vertical gap={token.marginSM} style={{ minWidth: 0 }}>
          <Flex justify="space-between" align="center">
            <Typography.Text strong>Công đoạn ({steps.length})</Typography.Text>
            <Button
              size="small"
              type="primary"
              disabled={disabled || steps.length >= 200}
              onClick={() => add()}
            >
              + Thêm
            </Button>
          </Flex>
          <div
            style={{
              maxHeight: screens.md ? "48dvh" : undefined,
              overflowY: screens.md ? "auto" : undefined,
              minWidth: 0,
            }}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              autoScroll
              onDragEnd={({ active, over }) => {
                if (disabled || !over || active.id === over.id) return;
                const from = steps.findIndex((s) => s.id === active.id),
                  to = steps.findIndex((s) => s.id === over.id);
                if (from >= 0 && to >= 0) change(arrayMove(steps, from, to));
              }}
            >
              <SortableContext
                items={steps.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <Flex vertical gap={token.marginXS}>
                  {!steps.length && (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="Chưa có công đoạn"
                    />
                  )}
                  {steps.map((step, index) => (
                    <SortableStage
                      index={index}
                      key={step.id}
                      id={step.id}
                      selected={selected?.id === step.id}
                      error={!!errors[step.id]}
                      disabled={disabled}
                    >
                      <button
                        type="button"
                        aria-pressed={selected?.id === step.id}
                        onClick={() => setSelectedId(step.id)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          appearance: "none",
                          border: 0,
                          background: "transparent",
                          textAlign: "start",
                          cursor: "pointer",
                          padding: 0,
                          font: "inherit",
                          color: token.colorText,
                        }}
                      >
                        <Flex gap={token.marginXS} align="start">
                          <Typography.Text
                            strong
                            style={{ minWidth: 0, overflowWrap: "anywhere" }}
                          >
                            {step.name || "Công đoạn mới"}
                          </Typography.Text>
                        </Flex>
                        {step.dependencies.length > 0 && (
                          <Typography.Paragraph
                            type="secondary"
                            ellipsis={{ rows: 2, tooltip: true }}
                            style={{
                              fontSize: token.fontSizeSM,
                              marginBlock: token.marginXXS,
                            }}
                          >
                            {"Sau: " +
                              step.dependencies
                                .map(
                                  (id) =>
                                    steps.find((s) => s.id === id)?.name ||
                                    "Công đoạn chưa đặt tên",
                                )
                                .join(", ")}
                          </Typography.Paragraph>
                        )}
                        <Typography.Text style={{ fontSize: token.fontSizeSM }}>
                          {step.laborRatePer15g == null
                            ? "Chưa cấu hình giá"
                            : decimalPattern.test(step.laborRatePer15g)
                              ? currencyText(step.laborRatePer15g, "THB") +
                                " / 15g"
                              : "Giá chưa hợp lệ"}
                        </Typography.Text>
                        <div></div>
                        {errors[step.id] && (
                          <div>
                            <Typography.Text
                              type="danger"
                              style={{ fontSize: token.fontSizeSM }}
                            >
                              {errors[step.id][0]}
                            </Typography.Text>
                          </div>
                        )}
                      </button>
                    </SortableStage>
                  ))}
                </Flex>
              </SortableContext>
            </DndContext>
          </div>
          <Typography.Text
            type="secondary"
            style={{ fontSize: token.fontSizeSM }}
          >
            Thứ tự hiển thị độc lập với quan hệ phụ thuộc.
          </Typography.Text>
        </Flex>
      </Col>
      <Col xs={24} md={16} style={{ minWidth: 0 }}>
        {!selected ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Thêm công đoạn để bắt đầu cấu hình"
          />
        ) : (
          <Form
            layout="vertical"
            disabled={disabled || protectedStepIds.includes(selected.id)}
            style={{ minWidth: 0 }}
          >
            <Flex
              justify="space-between"
              align="center"
              wrap
              gap={token.marginXS}
              style={{ marginBottom: token.margin }}
            >
              <Typography.Text strong>
                Chỉnh sửa công đoạn {steps.indexOf(selected) + 1}
              </Typography.Text>
              <Button
                danger
                size="small"
                disabled={disabled || protectedStepIds.includes(selected.id)}
                onClick={removeSelected}
              >
                Xóa công đoạn
              </Button>
            </Flex>
            {currentErrors.length > 0 && (
              <Typography.Paragraph type="danger">
                {currentErrors.join(" · ")}
              </Typography.Paragraph>
            )}
            <Row gutter={token.margin}>
              <Col xs={24} sm={14} style={{ minWidth: 0 }}>
                <Form.Item
                  label="Tên công đoạn"
                  required
                  validateStatus={
                    validationAttempt && !selected.name.trim()
                      ? "error"
                      : undefined
                  }
                >
                  <Input
                    ref={nameRef}
                    maxLength={180}
                    value={selected.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={10} style={{ minWidth: 0 }}>
                <Form.Item
                  label="Giá công / 15g (1B)"
                  tooltip="Đơn giá Baht trả thợ. Để trống là chưa cấu hình; giá 0 vẫn hợp lệ."
                  validateStatus={
                    selected.laborRatePer15g != null &&
                    !decimalPattern.test(selected.laborRatePer15g)
                      ? "error"
                      : undefined
                  }
                >
                  <LaborPriceInput
                    placeholder="Chưa cấu hình giá"
                    value={selected.laborRatePer15g ?? null}
                    onChange={(v) => update({ laborRatePer15g: v })}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              label="Phụ thuộc công đoạn"
              extra="Để trống nếu không phụ thuộc công đoạn nào. Các lựa chọn tạo chu trình đã bị khóa."
            >
              <Select
                mode="multiple"
                style={{ width: "100%", minWidth: 0 }}
                popupMatchSelectWidth
                value={selected.dependencies}
                options={steps
                  .filter((s) => s.id !== selected.id)
                  .map((s) => ({
                    value: s.id,
                    label: s.name || "Công đoạn chưa đặt tên",
                    disabled: reaches(steps, s.id, selected.id),
                  }))}
                onChange={(dependencies) => {
                  if (
                    dependencies.some((id) => reaches(steps, id, selected.id))
                  ) {
                    message.error("Quan hệ phụ thuộc tạo chu trình");
                    return;
                  }
                  update({ dependencies });
                }}
              />
            </Form.Item>
            <Form.Item extra="Công đoạn này sẽ yêu cầu nhân viên xác nhận hoàn thành khi chức năng xác nhận được triển khai.">
              <Checkbox
                checked={selected.requiresEmployeeConfirmation ?? false}
                onChange={(e) =>
                  update({ requiresEmployeeConfirmation: e.target.checked })
                }
              >
                Yêu cầu nhân viên xác nhận
              </Checkbox>
            </Form.Item>
            <Form.Item label="Hướng dẫn thực hiện">
              <Input.TextArea
                maxLength={10000}
                autoSize={{ minRows: 2, maxRows: 5 }}
                value={selected.description ?? ""}
                onChange={(e) => update({ description: e.target.value })}
              />
            </Form.Item>
          </Form>
        )}
      </Col>
    </Row>
  );
}
