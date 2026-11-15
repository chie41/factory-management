import dayjs from "dayjs";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { App, Button, Form, Modal, Space } from "antd";
import { BatchPlanFields, serializeBatchPlan } from "./BatchPlanFields";
import { batchWrite, type Batch, type BatchPlan } from "./api";
import { RequestError } from "../../components/common/RequestError";
import { useUnsavedProduction } from "../catalog/ProductionWorkflow";
export function BatchPlanEdit({
  batch,
  close,
  saved,
}: {
  batch: Batch;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [form] = Form.useForm(),
    { modal, message } = App.useApp(),
    [dirty, setDirty] = useState(false);
  useUnsavedProduction(dirty);
  const save = useMutation({
    mutationFn: (plan: BatchPlan) =>
      batchWrite("/" + batch.id, {
        ...serializeBatchPlan(plan),

        version: batch.version,
      }),
    onSuccess: async () => {
      await saved();
      message.success("Đã lưu kế hoạch lô");
      close();
    },
  });
  const cancel = () => {
    if (save.isPending) return;
    if (dirty)
      modal.confirm({
        title: "Bỏ thay đổi kế hoạch chưa lưu?",
        okText: "Bỏ thay đổi",
        cancelText: "Tiếp tục sửa",
        onOk: close,
      });
    else close();
  };
  return (
    <Modal
      open
      title={"Kế hoạch · " + batch.code}
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
            disabled={!dirty}
            loading={save.isPending}
            onClick={() => form.submit()}
          >
            Lưu thay đổi
          </Button>
        </Space>
      }
    >
      <RequestError error={save.error} />
      <Form
        form={form}
        layout="vertical"
        disabled={save.isPending}
        initialValues={{
          planned_quantity: batch.planned_quantity,
          planned_start_at: batch.planned_start_at
            ? dayjs(batch.planned_start_at)
            : null,
          planned_end_at: batch.planned_end_at
            ? dayjs(batch.planned_end_at)
            : null,
          note: batch.note ?? "",
        }}
        onValuesChange={() => setDirty(true)}
        onFinish={(plan) => save.mutate(plan)}
      >
        <BatchPlanFields quantityLocked={batch.has_execution} />
      </Form>
    </Modal>
  );
}
