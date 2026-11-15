import { ManualDeliveryForm } from "./ManualDeliveryForm";
import { ReportDeliveryForm } from "./ReportDeliveryForm";
import { NewGoodsReturnForm } from "./WorkflowMoneyForms";
import { usePermissions } from "../../auth/hooks/usePermissions";
import { useId, useState } from "react";
import { Alert, App, Button, Form, Modal, Select } from "antd";
import { LedgerEntryForm } from "./LedgerEntryForm";

import { transactionLabels, type TransactionType } from "../types/ledger";

export function AddTransactionModal({
  customerId,
  close,
}: {
  customerId?: string;
  close: () => void;
}) {
  const { can } = usePermissions();
  const [type, setType] = useState<TransactionType>();
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const formId = useId();
  const { modal } = App.useApp();
  const cancel = () => {
    if (pending) return;
    if (!dirty) {
      close();
      return;
    }
    modal.confirm({
      title: "Đóng biểu mẫu chưa lưu?",
      content:
        type === "DELIVERY" || type === "RETURN_GOODS"
          ? "Thông tin chưa gửi sẽ bị bỏ khi đóng biểu mẫu."
          : "Bản nháp sẽ được giữ trong phiên này.",
      okText: "Đóng biểu mẫu",
      cancelText: "Tiếp tục chỉnh sửa",
      onOk: close,
    });
  };
  const select = (next: TransactionType) => {
    if (next === type || pending) return;
    const change = () => {
      try {
        if (type)
          sessionStorage.removeItem(
            `ledger-draft:${customerId ?? "summary"}:new-${type}`,
          );
      } catch {
        /* optional session persistence */
      }
      setDirty(false);
      setReady(false);
      setType(next);
    };
    if (dirty)
      modal.confirm({
        title: "Đổi loại giao dịch?",
        content:
          "Dữ liệu chưa lưu của loại hiện tại sẽ bị bỏ. Biểu mẫu mới bắt đầu với dữ liệu riêng.",
        okText: "Bỏ dữ liệu và chuyển",
        cancelText: "Tiếp tục nhập",
        onOk: change,
      });
    else change();
  };
  return (
    <Modal
      centered
      rootClassName="ledger-modal ledger-add-modal"
      open
      title="Thêm giao dịch"
      width={560}
      footer={
        <div className="ledger-form-actions">
          <Button onClick={cancel} disabled={pending}>
            Hủy
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            form={formId}
            loading={pending}
            disabled={!type || !ready}
          >
            Thêm giao dịch
          </Button>
        </div>
      }
      onCancel={cancel}
      maskClosable={false}
      keyboard={!pending}
      closable={!pending}
    >
      <Form layout="vertical">
        <Form.Item label="LOẠI GIAO DỊCH" required>
          <Select
            aria-label="Loại giao dịch"
            placeholder="Chọn loại giao dịch"
            value={type}
            disabled={pending}
            onChange={select}
            options={(
              [
                "DELIVERY",
                "RETURN_GOLD",
                "RETURN_GOODS",
                "RETURN_RECOVERED_GOLD",
                "GOLD_RETURN_TO_CUSTOMER",
              ] as const
            ).map((value) => ({
              value,
              label: transactionLabels[value],
              disabled:
                value === "DELIVERY"
                  ? !(
                      can("customer_ledger.create")
                    ) && !can("delivery.report")
                  : value === "RETURN_GOODS"
                    ? !can("customer_ledger.returns.manage")
                    : false,
            }))}
          />
        </Form.Item>
      </Form>
      <Alert
        type="info"
        title="Giao hàng trực tiếp hoặc theo đơn"
        description="Kế toán có thể nhập giao hàng trực tiếp tại sổ, không cần đơn hoặc chuyến giao. Trả hàng theo dòng vẫn dùng đơn nguồn."
      />
      {type === "DELIVERY" &&
      can("customer_ledger.create") ? (
        <ManualDeliveryForm
          formId={formId}
          customerId={customerId}
          close={close}
          onDirty={setDirty}
          onPending={setPending}
          onReady={setReady}
        />
      ) : type === "DELIVERY" ? (
        <ReportDeliveryForm
          key={type}
          formId={formId}
          customerId={customerId}
          close={close}
          onDirty={setDirty}
          onPending={setPending}
          onReady={setReady}
        />
      ) : type === "RETURN_GOODS" ? (
        <NewGoodsReturnForm
          key={type}
          formId={formId}
          customerId={customerId}
          close={close}
          onDirty={setDirty}
          onPending={setPending}
          onReady={setReady}
        />
      ) : (
        type && (
          <LedgerEntryForm
            key={type}
            formId={formId}
            createType={type}
            embedded
            customerId={customerId}
            close={close}
            onDirty={setDirty}
            onPending={setPending}
            onReady={setReady}
          />
        )
      )}
    </Modal>
  );
}
