import { dateText } from "../utils/format";
import { LedgerDateInput } from "../features/customer-ledger/components/LedgerDateInput";
import { usePermissions } from "../features/auth/hooks/usePermissions";
import { WorkflowReasonModal } from "../features/customer-ledger/components/WorkflowMoneyForms";
import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Button,
  Dropdown,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
} from "antd";
import { PageFrame } from "../components/common/PageFrame";
import { RequestError } from "../components/common/RequestError";
import {
  workflowGet,
  workflowWrite,
  localNow,
  type Order,
} from "../features/customer-ledger/services/workflowService";
import { apiClient } from "../services/apiClient";
import { ReportDeliveryForm } from "../features/customer-ledger/components/ReportDeliveryForm";
import { errorText } from "../services/apiErrors";
type Trip = {
  id: string;
  full_name: string;
  delivery_date: string;
  order_ids: string[];
};
type Employee = {
  id: string;
  name?: string;
  fullName?: string;
  code?: string;
  employeeCode?: string;
  status: string;
};
export function DeliveriesPage() {
  const { can } = usePermissions();
  const [event, setEvent] = useState<{
    title: string;
    url: string;
    extra: Record<string, string>;
  }>();
  const [form] = Form.useForm(),
    [create, setCreate] = useState(false),
    [reportId, setReportId] = useState<string>(),
    [reportTripId, setReportTripId] = useState<string>(),
    [ready, setReady] = useState(false),
    [pending, setPending] = useState(false),
    formId = useId(),
    cache = useQueryClient(),
    { message } = App.useApp();
  const trips = useQuery({
    queryKey: ["delivery-trips"],
    queryFn: () => workflowGet<Trip[]>("/delivery-trips"),
  });
  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () => workflowGet<Order[]>("/orders"),
  });
  const employees = useQuery({
    queryKey: ["delivery-employees"],
    queryFn: async () =>
      (
        await apiClient.get<{ data: Employee[] }>("/employees", {
          params: { page_size: 100, status: "ACTIVE" },
        })
      ).data.data,
    enabled: create,
  });
  const save = useMutation({
    mutationFn: (data: object) => workflowWrite("/delivery-trips", data),
    onSuccess: async () => {
      await Promise.all(
        ["orders", "delivery-trips", "delivery-orders"].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      message.success("Đã phân công chuyến giao");
      setCreate(false);
    },
    onError: (e) => message.error(errorText(e)),
  });
  return (
    <PageFrame
      title="Giao hàng"
      subtitle="Phân công chuyến và khai giao hàng chờ kế toán duyệt"
      action="Tạo chuyến giao"
      onAction={() => {
        form.resetFields();
        setCreate(true);
      }}
    >
      <RequestError error={trips.error || orders.error} />
      <Table
        rowKey="id"
        loading={trips.isFetching}
        dataSource={trips.data ?? []}
        columns={[
          { title: "Ngày giao", dataIndex: "delivery_date", render: dateText },
          { title: "Nhân viên", dataIndex: "full_name" },
          {
            title: "Đơn hàng",
            render: (_, trip) => (
              <Space wrap>
                {(trip.order_ids ?? []).map((id) => (
                  <Space key={id}>
                    <Button
                      disabled={
                        !can("delivery.report") ||
                        ![
                          "DELIVERING",
                          "READY",
                          "AWAITING_DELIVERY_ASSIGNMENT",
                          "DELIVERED_AWAITING_CONFIRMATION",
                        ].includes(
                          orders.data?.find((o) => o.id === id)?.status ?? "",
                        )
                      }
                      key={id}
                      onClick={() => {
                        setReady(false);
                        setReportTripId(trip.id);
                        setReportId(id);
                      }}
                    >
                      {orders.data?.find((o) => o.id === id)?.order_code ??
                        id.slice(0, 8)}{" "}
                      · Báo giao
                    </Button>
                    {can("delivery.report") &&
                      orders.data?.find((o) => o.id === id)?.status ===
                        "DELIVERING" && (
                        <Dropdown
                          trigger={["click"]}
                          menu={{
                            items: [
                              { key: "FAILED", label: "Giao thất bại" },
                              { key: "RESCHEDULED", label: "Hẹn giao lại" },
                            ],
                            onClick: ({ key }) =>
                              setEvent({
                                title:
                                  key === "FAILED"
                                    ? "Ghi nhận giao thất bại"
                                    : "Ghi nhận hẹn lại",
                                url: `/delivery-trips/${trip.id}/events`,
                                extra: { order_id: id, event_type: key },
                              }),
                          }}
                        >
                          <Button>Khác</Button>
                        </Dropdown>
                      )}
                  </Space>
                ))}
              </Space>
            ),
          },
        ]}
      />
      {event && (
        <WorkflowReasonModal
          {...event}
          reasonField="note"
          close={() => setEvent(undefined)}
        />
      )}
      <Modal
        open={create}
        title="Tạo chuyến giao"
        onCancel={() => setCreate(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        okText="Phân công"
        cancelText="Hủy"
      >
        <RequestError error={employees.error || save.error} />
        <Form
          form={form}
          layout="vertical"
          initialValues={{ delivery_date: localNow().slice(0, 10) }}
          onFinish={(values) => save.mutate(values)}
        >
          <Form.Item
            name="employee_id"
            label="Nhân viên phụ trách"
            rules={[{ required: true }]}
          >
            <Select
              loading={employees.isFetching}
              options={(employees.data ?? []).map((e) => ({
                value: e.id,
                label: `${e.code ?? e.employeeCode} · ${e.name ?? e.fullName}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="delivery_date"
            label="Ngày giao"
            rules={[{ required: true }]}
          >
            <LedgerDateInput />
          </Form.Item>
          <Form.Item
            name="order_ids"
            label="Đơn hàng"
            rules={[{ required: true }]}
          >
            <Select
              mode="multiple"
              options={(orders.data ?? [])
                .filter((o) =>
                  [
                    "READY",
                    "AWAITING_DELIVERY_ASSIGNMENT",
                    "DELIVERING",
                  ].includes(o.status),
                )
                .map((o) => ({ value: o.id, label: o.order_code }))}
            />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!reportId}
        title="Khai giao hàng"
        onCancel={() => setReportId(undefined)}
        destroyOnHidden
        footer={
          <Button
            type="primary"
            form={formId}
            htmlType="submit"
            disabled={!ready}
            loading={pending}
          >
            Gửi kế toán duyệt
          </Button>
        }
      >
        {reportId && (
          <ReportDeliveryForm
            source="DELIVERY"
            orderId={reportId}
            tripId={reportTripId}
            formId={formId}
            close={() => setReportId(undefined)}
            onReady={setReady}
            onPending={setPending}
          />
        )}
      </Modal>
    </PageFrame>
  );
}
