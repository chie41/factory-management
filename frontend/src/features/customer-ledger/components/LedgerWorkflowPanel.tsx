import { ledgerPaidText } from '../utils/ledgerLaborText';
import { QuickTransactionsModal } from './QuickTransactionsModal';
import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { usePermissions } from "../../auth/hooks/usePermissions";
import { RequestError } from "../../../components/common/RequestError";
import { currencyText, decimalPattern, weightText } from "../../../utils/decimal";
import {
  approvalLabels,
  workflowGet,
  workflowWrite,
  type Receipt,
  type Workflow,
} from "../services/workflowService";
import {
  ApproveGoodsReturnModal,
  CollectPaymentModal,
  NewGoodsReturnForm,
  PaymentReviewModal,
  WorkflowReasonModal,
} from "./WorkflowMoneyForms";
import { LedgerDecimalInput } from "./LedgerDecimalInput";
import { ReportDeliveryForm } from "./ReportDeliveryForm";
export function LedgerWorkflowPanel({ ledgerId }: { ledgerId: string }) {
  const { can } = usePermissions(),
    cache = useQueryClient(),
    { message } = App.useApp(),
    [approveForm] = Form.useForm(),
    reportFormId = useId(),
    returnFormId = useId();
  const [manualEdit,setManualEdit] = useState(false),
    [approve, setApprove] = useState(false),
    [reject, setReject] = useState(false),
    [reason, setReason] = useState(""),
    [report, setReport] = useState(false),
    [collect, setCollect] = useState(false),
    [returning, setReturning] = useState(false),
    [returnId, setReturnId] = useState<string>(),
    [review, setReview] = useState<{ receipt: Receipt; revise: boolean }>();
  const [voiding, setVoiding] = useState<{
    title: string;
    url: string;
    version: string;
  }>();
  const [pending, setPending] = useState(false),
    [ready, setReady] = useState(false);
  const detail = useQuery({
    queryKey: ["ledger-workflow", ledgerId],
    queryFn: () =>
      workflowGet<Workflow>(`/customer-ledger/entries/${ledgerId}/workflow`),
  });
  const save = useMutation({
    mutationFn: ({ path, data }: { path: string; data: object }) =>
      workflowWrite(`/customer-ledger/entries/${ledgerId}/${path}`, {
        ...data,
        version: detail.data?.version,
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          "ledger",
          "ledger-entry",
          "ledger-workflow",
          "cash",
          "orders",
          "delivery-orders",
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
      message.success("Đã cập nhật nghiệp vụ");
      setApprove(false);
      setReject(false);
    },
  });
  const data = detail.data,
    initial = data?.payments.find(
      (p) => p.source === "DELIVERY" && p.status === "PENDING",
    );
  return (
    <section>
      <Typography.Title level={5}>
        Đối soát giao hàng / tiền công
      </Typography.Title>
      <RequestError
        error={detail.error || save.error}
        retry={() => void detail.refetch()}
      />
      {data && (
        <>
          <Tag
            color={
              data.ledger.approval_status === "INCORRECT"
                ? "red"
                : data.ledger.approval_status === "PENDING"
                  ? "orange"
                  : "green"
            }
          >
            {approvalLabels[data.ledger.approval_status]}
          </Tag>
          <Descriptions
            column={1}
            size="small"
            items={[
              {
                key: "o",
                label: "Đơn gốc",
                children: data.order?.order_code ?? "Giao trực tiếp",
              },
              {
                key: "b",
                label: "Tiền công gốc",
                children: currencyText(
                  data.submission.original_labor_baht,
                  "THB",
                ),
              },
              {
                key: "d",
                label: "Giảm giá",
                children: currencyText(data.submission.discount_baht, "THB"),
              },
              {
                key: "n",
                label: "Tiền công sau giảm",
                children: currencyText(data.submission.net_labor_baht, "THB"),
              },
              {
                key: "p",
                label: "Đã thu hợp lệ sau hoàn",
                children: ledgerPaidText(data.due_baht, data.paid_baht, "THB"),
              },
              {
                key: "r",
                label: "Còn phải thu",
                children: currencyText(data.outstanding_baht, "THB"),
              },
            ]}
          />
          {data.submission.review_note && (
            <Alert
              type="warning"
              title="Lý do đối soát"
              description={data.submission.review_note}
            />
          )}
          <Space wrap style={{ marginBlock: 12 }}>
            {data.ledger.approval_status === "PENDING" &&
              can("customer_ledger.approve") && (
                <>
                  <Button
                    type="primary"
                    disabled={!!initial && !can("cash.approve")}
                    onClick={() => {
                      approveForm.resetFields();
                      setApprove(true);
                    }}
                  >
                    Duyệt giao hàng
                  </Button>
                  <Button
                    danger
                    onClick={() => {
                      setReason("");
                      setReject(true);
                    }}
                  >
                    Đơn hàng sai
                  </Button>
                </>
              )}
            {!!data.order &&
              ["PENDING", "INCORRECT"].includes(data.ledger.approval_status) &&
              can("delivery.report") && (
                <Button
                  onClick={() => {
                    setReady(false);
                    setReport(true);
                  }}
                >
                  Sửa khai báo / gửi duyệt lại
                </Button>
              )}
            {!data.order && ["PENDING","INCORRECT"].includes(data.ledger.approval_status) && can("customer_ledger.update") && can("customer_ledger.create") && <Button onClick={()=>setManualEdit(true)}>Sửa phiếu / ghi nhận lại</Button>}
            {data.ledger.approval_status === "APPROVED" &&
              can("customer_ledger.collect") && (
                <Button onClick={() => setCollect(true)}>Thu bổ sung</Button>
              )}
            {data.ledger.approval_status === "APPROVED" &&
              !!data.items.length &&
              can("customer_ledger.returns.manage") && (
                <Button
                  onClick={() => {
                    setReady(false);
                    setReturning(true);
                  }}
                >
                  Khách trả hàng
                </Button>
              )}
          </Space>
          {!!data.items.length && <Table rowKey="id" size="small" pagination={false} scroll={{x:700}} dataSource={data.items} columns={[
            {title:'Mẫu mã',render:(_,i)=>`${i.design_code_snapshot??''} · ${i.item_name}`},
            {title:'Số lượng',dataIndex:'quantity'},
            {title:'Trọng lượng / SP',render:(_,i)=>weightText(i.unit_weight_g)},
            {title:'Giá công / 15g',render:(_,i)=>currencyText(i.labor_price_per_15g,'THB')},
            {title:'Tiền công',render:(_,i)=>currencyText(i.line_labor_amount,'THB')}
          ]}/>}
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 500 }}
            dataSource={data.payments}
            columns={[
              {
                title: "Thực thu",
                render: (_, p) => currencyText(p.amount, p.currency),
              },
              {
                title: "Ngày thu",
                render: (_,p)=>p.business_date?.split('-').reverse().join('/')??'—',
              },
              {title:'Người thu',render:(_,p)=>p.collector?.name??'—'},
              {title:'Ghi chú thu',dataIndex:'note'},
              {
                title: "Trạng thái",
                render: (_, p) => approvalLabels[p.status] ?? p.status,
              },
              {
                title: "BAHT xác nhận",
                render: (_, p) =>
                  p.status === "APPROVED"
                    ? currencyText(p.paid_baht, "THB")
                    : "Chưa hạch toán",
              },
              {
                title: "Thao tác",
                render: (_, p) => (
                  <Space>
                    {p.status === "PENDING" &&
                      data.ledger.approval_status === "APPROVED" &&
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
          {!!data.fx_revisions?.length && (
            <>
              <Typography.Title level={5}>
                Lịch sử xác nhận / sửa tỷ giá
              </Typography.Title>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 700 }}
                dataSource={data.fx_revisions}
                columns={[
                  {
                    title: "Thời gian",
                    render: (_, r) =>
                      new Date(r.created_at).toLocaleString("vi-VN"),
                  },
                  {
                    title: "Khoản thu",
                    render: (_, r) => r.payment_id.slice(0, 8),
                  },
                  {
                    title: "Tỷ giá cũ → mới",
                    render: (_, r) => `${r.old_fx ?? "—"} → ${r.new_fx}`,
                  },
                  {
                    title: "BAHT sau xác nhận",
                    render: (_, r) => currencyText(r.new_paid_baht, "THB"),
                  },
                  { title: "Người xác nhận", dataIndex: "actor_id" },
                  { title: "Lý do", dataIndex: "reason" },
                ]}
              />
            </>
          )}
          {data.returns.length > 0 && (
            <>
              <Typography.Title level={5}>Các lần trả hàng</Typography.Title>
              <Table
                rowKey="id"
                size="small"
                dataSource={data.returns}
                columns={[
                  { title: "Mã", render: (_, r) => r.id.slice(0, 8) },
                  {
                    title: "Trạng thái",
                    render: (_, r) => approvalLabels[r.status] ?? r.status,
                  },
                  {
                    title: "Thao tác",
                    render: (_, r) =>
                      r.status === "PENDING" &&
                      can("cash.refund.approve") &&
                      can("customer_ledger.returns.manage") ? (
                        <Space>
                          <Button onClick={() => setReturnId(r.id)}>
                            Duyệt / hoàn tiền
                          </Button>
                          <Button
                            danger
                            onClick={() =>
                              setVoiding({
                                title: "Hủy bản khai hàng trả chưa duyệt",
                                url: `/customer-ledger/goods-returns/${r.id}/void`,
                                version: r.version,
                              })
                            }
                          >
                            Hủy bản khai
                          </Button>
                        </Space>
                      ) : (
                        "—"
                      ),
                  },
                ]}
              />
            </>
          )}
          <Modal
            open={approve}
            title="Kế toán duyệt giao hàng"
            onCancel={() => setApprove(false)}
            onOk={() => approveForm.submit()}
            confirmLoading={save.isPending}
            okText="Duyệt và ghi Thu/Chi"
            cancelText="Hủy"
          >
            <RequestError error={save.error} />
            <Form
              form={approveForm}
              layout="vertical"
              initialValues={{
                confirmed_fx_per_baht:
                  initial?.currency === "THB" ? "1" : undefined,
              }}
              onFinish={(values) =>
                save.mutate({ path: "approve", data: values })
              }
            >
              {initial ? (
                <>
                  <Typography.Paragraph>
                    Thực thu: {currencyText(initial.amount, initial.currency)}
                  </Typography.Paragraph>
                  <Form.Item
                    name="confirmed_fx_per_baht"
                    label={`Tỷ giá xác nhận (${initial.fx_unit ?? "nguyên tệ / BAHT"})`}
                    rules={[{ required: true, pattern: decimalPattern }]}
                  >
                    <LedgerDecimalInput readOnly={initial.currency === "THB"} />
                  </Form.Item>
                  {initial.currency !== "THB" && (
                    <Alert
                      type="info"
                      title={`Gợi ý giả định thu đủ: ${initial.suggested_fx_per_baht ?? "Không có số dư dương"}`}
                      description="Không tự xem gợi ý là tỷ giá đã xác nhận. Nhập tỷ giá thực tế; thu vượt sẽ bị chặn."
                    />
                  )}
                </>
              ) : (
                <Alert
                  type="info"
                  title="Chưa khai khoản thực thu"
                  description="Duyệt giao hàng không tự tạo giao dịch thu tiền."
                />
              )}
            </Form>
          </Modal>
          <Modal
            open={reject}
            title="Đánh dấu đơn hàng gốc sai"
            onCancel={() => setReject(false)}
            onOk={() => save.mutate({ path: "incorrect", data: { reason } })}
            confirmLoading={save.isPending}
            okButtonProps={{ disabled: !reason.trim() }}
            okText="Đánh dấu sai"
            cancelText="Hủy"
          >
            <RequestError error={save.error} />
            <Input.TextArea
              placeholder="Lý do sai"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
            />
            <Alert
              type="info"
              title="Giữ nguyên bản khai tiền đã thu"
              description="Giao hàng bị loại khỏi số dư; chưa ghi Thu/Chi. Nhân viên sửa và gửi duyệt lại trên cùng đơn."
            />
          </Modal>
          <Modal
            open={report}
            title="Sửa khai báo giao hàng"
            onCancel={() => setReport(false)}
            footer={
              <Button
                type="primary"
                form={reportFormId}
                htmlType="submit"
                loading={pending}
                disabled={!ready}
              >
                Ghi nhận lại
              </Button>
            }
            destroyOnHidden
          >
            {report && (
              <ReportDeliveryForm
                customerId={data.order?.customer_id}
                orderId={data.order?.id}
                tripId={data.submission.trip_id}
                formId={reportFormId}
                close={() => setReport(false)}
                onPending={setPending}
                onReady={setReady}
              />
            )}
          </Modal>
          <Modal
            open={returning}
            title="Khách trả hàng"
            onCancel={() => setReturning(false)}
            footer={
              <Button
                type="primary"
                htmlType="submit"
                form={returnFormId}
                loading={pending}
                disabled={!ready}
              >
                Ghi nhận
              </Button>
            }
            destroyOnHidden
          >
            {returning && (
              <NewGoodsReturnForm
                ledgerId={ledgerId}
                formId={returnFormId}
                close={() => setReturning(false)}
                onPending={setPending}
                onReady={setReady}
              />
            )}
          </Modal>
        </>
      )}
      {manualEdit && detail.data && <QuickTransactionsModal customerId={(detail.data.ledger as {customer_id?:string}).customer_id} initialWorkflow={detail.data} close={()=>setManualEdit(false)}/>}
      {voiding && (
        <WorkflowReasonModal {...voiding} close={() => setVoiding(undefined)} />
      )}{" "}
      {collect && (
        <CollectPaymentModal
          ledgerId={ledgerId}
          close={() => setCollect(false)}
        />
      )}{" "}
      {review && (
        <PaymentReviewModal {...review} close={() => setReview(undefined)} />
      )}{" "}
      {returnId && (
        <ApproveGoodsReturnModal
          returnId={returnId}
          close={() => setReturnId(undefined)}
        />
      )}
    </section>
  );
}
