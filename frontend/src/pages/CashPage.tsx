import { dateText } from "../utils/format";
import { LedgerDateInput } from "../features/customer-ledger/components/LedgerDateInput";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
} from "antd";
import { PageFrame } from "../components/common/PageFrame";
import { RequestError } from "../components/common/RequestError";
import { usePermissions } from "../features/auth/hooks/usePermissions";
import {
  CollectPaymentModal,
  PaymentReviewModal,
  WorkflowReasonModal,
} from "../features/customer-ledger/components/WorkflowMoneyForms";
import { LedgerDecimalInput } from "../features/customer-ledger/components/LedgerDecimalInput";
import { currencyText, decimalPattern } from "../utils/decimal";
import {
  approvalLabels,
  workflowGet,
  workflowWrite,
  localNow,
  type DeliverySource,
  type Receipt,
} from "../features/customer-ledger/services/workflowService";
import { errorText } from "../services/apiErrors";
type Cash = {
  id: string;
  direction: string;
  amount: string;
  currency: string;
  business_date: string;
  category_name: string;
  reference_type: string;
  reference_id: string;
};
type Period = {
  id: string;
  name: string;
  from_date: string;
  to_date: string;
  closed_at?: string;
  income_baht?: string;
  expense_baht?: string;
  net_baht?: string;
  version: string;
  kip_per_baht?: string;
  vnd_per_baht?: string;
};
export function CashPage() {
  const { can } = usePermissions(),
    cache = useQueryClient(),
    { message, modal } = App.useApp(),
    [form] = Form.useForm();
  const [voiding, setVoiding] = useState<{
    title: string;
    url: string;
    version: string;
  }>();
  const [selecting, setSelecting] = useState(false),
    [ledgerId, setLedgerId] = useState<string>(),
    [collect, setCollect] = useState<string>(),
    [review, setReview] = useState<{ receipt: Receipt; revise: boolean }>(),
    [periodOpen, setPeriodOpen] = useState(false),
    [periodEdit, setPeriodEdit] = useState<Period>(),
    [reportId, setReportId] = useState<string>();
  const cash = useQuery({
    queryKey: ["cash", "transactions"],
    queryFn: () => workflowGet<Cash[]>("/cash/transactions"),
  });
  const payments = useQuery({
    queryKey: ["cash", "payments"],
    queryFn: () => workflowGet<Receipt[]>("/cash/payments"),
  });
  const outstanding = useQuery({
    queryKey: ["cash", "outstanding"],
    queryFn: () => workflowGet<DeliverySource[]>("/cash/outstanding"),
    enabled: selecting,
  });
  const periods = useQuery({
    queryKey: ["cash", "periods"],
    queryFn: () => workflowGet<Period[]>("/cash/periods"),
    enabled: can("cash.periods.manage"),
  });
  const report = useQuery({
    queryKey: ["cash", "report", reportId],
    queryFn: () => workflowGet<Period>(`/cash/periods/${reportId}/report`),
    enabled: !!reportId,
  });
  const save = useMutation({
    mutationFn: ({ url, data }: { url: string; data: object }) =>
      workflowWrite(url, data, url.endsWith("/fx") ? "patch" : "post"),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["cash"] });
      setPeriodOpen(false);
      message.success("Đã lưu kỳ báo cáo");
    },
    onError: (e) => message.error(errorText(e)),
  });
  const closePeriod = async (id: string) => {
    try {
      const snapshot = await workflowGet<Period>(`/cash/periods/${id}/report`);
      modal.confirm({
        title: "Chốt kỳ báo cáo?",
        content: `Thu ${currencyText(snapshot.income_baht, "THB")} · Chi ${currencyText(snapshot.expense_baht, "THB")}. Sau chốt không sửa tỷ giá hoặc ghi thêm chứng từ vào kỳ.`,
        onOk: () =>
          save.mutateAsync({
            url: `/cash/periods/${id}/close`,
            data: { version: snapshot.version },
          }),
      });
    } catch (e) {
      message.error(errorText(e));
    }
  };
  return (
    <PageFrame
      title="Thu / Chi"
      subtitle="Tiền thực thu / thực chi đã duyệt, giữ nguyên nguyên tệ"
      action={can("cash.collect") ? "Thu bổ sung" : undefined}
      onAction={() => {
        setLedgerId(undefined);
        setSelecting(true);
      }}
    >
      <RequestError error={cash.error || payments.error || periods.error} />
      <Tabs
        items={[
          {
            key: "cash",
            label: "Đã hạch toán",
            children: (
              <Table
                rowKey="id"
                dataSource={cash.data ?? []}
                loading={cash.isFetching}
                scroll={{ x: 700 }}
                columns={[
                  {
                    title: "Ngày nghiệp vụ",
                    dataIndex: "business_date",
                    render: dateText,
                  },
                  {
                    title: "Thu / Chi",
                    render: (_, r) => (r.direction === "IN" ? "Thu" : "Chi"),
                  },
                  { title: "Danh mục", dataIndex: "category_name" },
                  {
                    title: "Nguyên tệ",
                    render: (_, r) => currencyText(r.amount, r.currency),
                  },
                  { title: "Nguồn", dataIndex: "reference_type" },
                ]}
              />
            ),
          },
          {
            key: "pending",
            label: "Các lần thu / chờ duyệt",
            children: (
              <Table
                rowKey="id"
                dataSource={payments.data ?? []}
                loading={payments.isFetching}
                columns={[
                  {
                    title: "Số thực thu",
                    render: (_, p) => currencyText(p.amount, p.currency),
                  },
                  {
                    title: "Trạng thái",
                    render: (_, p) => approvalLabels[p.status],
                  },
                  {
                    title: "BAHT đã xác nhận",
                    render: (_, p) =>
                      p.paid_baht
                        ? currencyText(p.paid_baht, "THB")
                        : "Chưa hạch toán",
                  },
                  {
                    title: "Thao tác",
                    render: (_, p) => (
                      <Space>
                        {p.status === "PENDING" &&
                          p.ledger_status === "APPROVED" &&
                          can("cash.approve") && (
                            <>
                              <Button
                                onClick={() =>
                                  setReview({ receipt: p, revise: false })
                                }
                              >
                                Duyệt thu
                              </Button>
                              {p.source !== "DELIVERY" && (
                                <Button
                                  danger
                                  onClick={() =>
                                    setVoiding({
                                      title: "Bản khai thu sai",
                                      url: `/cash/payments/${p.id}/void`,
                                      version: p.version,
                                    })
                                  }
                                >
                                  Khai sai
                                </Button>
                              )}
                            </>
                          )}
                        {p.status === "PENDING" &&
                          p.ledger_status !== "APPROVED" && (
                            <span>Duyệt cùng giao hàng ở sổ</span>
                          )}
                        {p.status === "APPROVED" &&
                          can("customer_ledger.fx.manage") && (
                            <Button
                              onClick={() =>
                                setReview({ receipt: p, revise: true })
                              }
                            >
                              Sửa tỷ giá
                            </Button>
                          )}
                      </Space>
                    ),
                  },
                ]}
              />
            ),
          },
          ...(can("cash.periods.manage")
            ? [
                {
                  key: "periods",
                  label: "Kỳ báo cáo",
                  children: (
                    <>
                      <Button
                        onClick={() => {
                          setPeriodEdit(undefined);
                          form.resetFields();
                          setPeriodOpen(true);
                        }}
                      >
                        Tạo kỳ
                      </Button>
                      <Table
                        rowKey="id"
                        dataSource={periods.data ?? []}
                        columns={[
                          { title: "Tên kỳ", dataIndex: "name" },
                          {
                            title: "Từ ngày",
                            dataIndex: "from_date",
                            render: dateText,
                          },
                          {
                            title: "Đến ngày",
                            dataIndex: "to_date",
                            render: dateText,
                          },
                          {
                            title: "Thao tác",
                            render: (_: unknown, p: Period) => (
                              <Space>
                                <Button onClick={() => setReportId(p.id)}>
                                  Xem báo cáo
                                </Button>
                                {!p.closed_at && (
                                  <>
                                    <Button
                                      onClick={() => {
                                        setPeriodEdit(p);
                                        form.setFieldsValue(p);
                                        setPeriodOpen(true);
                                      }}
                                    >
                                      Tỷ giá kỳ
                                    </Button>
                                    <Button
                                      onClick={() => void closePeriod(p.id)}
                                    >
                                      Chốt kỳ
                                    </Button>
                                  </>
                                )}
                              </Space>
                            ),
                          },
                        ]}
                      />
                    </>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Modal
        open={selecting}
        title="Chọn khoản nợ tiền công"
        onCancel={() => setSelecting(false)}
        onOk={() => {
          setSelecting(false);
          setCollect(ledgerId);
        }}
        okButtonProps={{ disabled: !ledgerId }}
        okText="Tiếp tục"
        cancelText="Hủy"
      >
        <RequestError error={outstanding.error} />
        <Select
          style={{ width: "100%" }}
          value={ledgerId}
          onChange={setLedgerId}
          loading={outstanding.isFetching}
          options={(outstanding.data ?? []).map((s) => ({
            value: s.id,
            label: s.order_code + " · " + s.customer_name,
          }))}
        />
      </Modal>
      {voiding && (
        <WorkflowReasonModal {...voiding} close={() => setVoiding(undefined)} />
      )}{" "}
      {collect && (
        <CollectPaymentModal
          ledgerId={collect}
          source="CASH"
          close={() => setCollect(undefined)}
        />
      )}{" "}
      {review && (
        <PaymentReviewModal {...review} close={() => setReview(undefined)} />
      )}
      <Modal
        open={periodOpen}
        title={
          periodEdit ? "Sửa tỷ giá kỳ chưa chốt" : "Tạo kỳ báo cáo Thu/Chi"
        }
        onCancel={() => setPeriodOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        okText="Lưu kỳ"
        cancelText="Hủy"
      >
        <RequestError error={save.error} />
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            from_date: localNow().slice(0, 10),
            to_date: localNow().slice(0, 10),
          }}
          onFinish={(values) =>
            save.mutate({
              url: periodEdit
                ? `/cash/periods/${periodEdit.id}/fx`
                : "/cash/periods",
              data: periodEdit
                ? {
                    version: periodEdit.version,
                    ...(values.kip_per_baht
                      ? { kip_per_baht: values.kip_per_baht }
                      : {}),
                    ...(values.vnd_per_baht
                      ? { vnd_per_baht: values.vnd_per_baht }
                      : {}),
                  }
                : Object.fromEntries(
                    Object.entries(values).filter(
                      ([, v]) => v !== "" && v !== undefined,
                    ),
                  ),
            })
          }
        >
          <Form.Item
            name="name"
            label="Tên kỳ"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input disabled={!!periodEdit} />
          </Form.Item>
          <Form.Item
            name="from_date"
            label="Từ ngày"
            rules={[{ required: true }]}
          >
            <LedgerDateInput disabled={!!periodEdit} />
          </Form.Item>
          <Form.Item
            name="to_date"
            label="Đến ngày"
            rules={[{ required: true }]}
          >
            <LedgerDateInput disabled={!!periodEdit} />
          </Form.Item>
          <Form.Item
            name="kip_per_baht"
            label="Tỷ giá kỳ KIP / BAHT"
            rules={[{ pattern: decimalPattern }]}
          >
            <LedgerDecimalInput />
          </Form.Item>
          <Form.Item
            name="vnd_per_baht"
            label="Tỷ giá kỳ VND / BAHT"
            rules={[{ pattern: decimalPattern }]}
          >
            <LedgerDecimalInput />
          </Form.Item>
          <Alert
            type="info"
            title="Tỷ giá cấp kỳ báo cáo"
            description="Không dùng tỷ giá duyệt khoản thu để quy đổi báo cáo; nguyên tệ trên chứng từ không đổi."
          />
        </Form>
      </Modal>
      <Modal
        open={!!reportId}
        title="Báo cáo theo tỷ giá kỳ"
        onCancel={() => setReportId(undefined)}
        footer={null}
      >
        <RequestError error={report.error} />
        {report.data && (
          <Descriptions
            column={1}
            items={[
              {
                key: "in",
                label: "Tổng thu",
                children: currencyText(report.data.income_baht, "THB"),
              },
              {
                key: "out",
                label: "Tổng chi",
                children: currencyText(report.data.expense_baht, "THB"),
              },
              {
                key: "net",
                label: "Chênh lệch",
                children: currencyText(report.data.net_baht, "THB"),
              },
            ]}
          />
        )}
      </Modal>
    </PageFrame>
  );
}
