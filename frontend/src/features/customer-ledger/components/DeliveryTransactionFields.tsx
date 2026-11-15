import type { ReactNode } from "react";
import { Alert, Button, Form, Input, Tooltip } from "antd";
import type { LedgerEntry } from "../types/ledger";

// Shared by create and edit. Unsupported source fields never enter the payload.
export function DeliveryTransactionFields({
  entry,
  customerField,
  dateField,
  weightField,
  laborFields,
}: {
  entry?: LedgerEntry;
  customerField: ReactNode;
  dateField: ReactNode;
  weightField: ReactNode;
  laborFields: ReactNode;
}) {
  return (
    <>
      <div className="ledger-field-grid">
        <Form.Item label="THAM CHIẾU">
          <Input
            readOnly
            value={entry?.reference_code ?? entry?.referenceId ?? ""}
            placeholder="Giao dịch thủ công"
          />
        </Form.Item>
        <Form.Item label="ĐƠN HÀNG">
          <Tooltip title="Bản ghi thủ công cũ chưa có đơn nguồn để đối chiếu">
            <Input disabled placeholder="Không có đơn nguồn" />
          </Tooltip>
        </Form.Item>
      </div>
      <div className="ledger-field-grid">
        {customerField}
        {dateField}
      </div>
      <div className="ledger-field-grid">
        <Form.Item label="NGƯỜI GIAO DỊCH">
          <Input
            disabled
            value={entry?.actor_name}
            placeholder="Chưa có dữ liệu"
          />
        </Form.Item>
        <Form.Item label="LOẠI GIAO DỊCH">
          <Input readOnly value="Giao hàng" />
        </Form.Item>
      </div>
      <section className="ledger-delivery-products">
        <div>
          <label>CHI TIẾT HÀNG</label>
          <Tooltip title="Bản ghi cũ không lưu dòng hàng nguồn">
            <Button type="link" disabled>
              + Thêm dòng hàng
            </Button>
          </Tooltip>
        </div>
        <Alert
          type="info"
          title="Giao dịch thủ công theo tổng vàng"
          description="Bản ghi cũ được giữ để đối chiếu. Giao hàng mới phải khai từ đơn hàng và chuyến giao thực tế."
        />
      </section>
      <div className="ledger-delivery-total">{weightField}</div>
      {laborFields}
    </>
  );
}
