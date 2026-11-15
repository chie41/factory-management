import { Col, DatePicker, Form, Input, InputNumber, Row, theme } from "antd";
export function serializeBatchPlan(values: Record<string, any>) {
  return {
    planned_quantity: values.planned_quantity,
    planned_start_at: values.planned_start_at?.toISOString?.() ?? null,
    planned_end_at: values.planned_end_at?.toISOString?.() ?? null,
    note: values.note ?? null,
  };
}
export function BatchPlanFields({
  quantityLocked = false,
  hideQuantity = false,
}: {
  quantityLocked?: boolean;
  hideQuantity?: boolean;
}) {
  const { token } = theme.useToken();
  return (
    <>
      {!hideQuantity && (
        <>
          <Form.Item
            label="Số lượng sản phẩm dự kiến"
            name="planned_quantity"
            rules={[{ required: true, message: "Nhập số lượng dự kiến" }]}
          >
            <InputNumber
              min={1}
              max={2147483647}
              precision={0}
              disabled={quantityLocked}
            />
          </Form.Item>
        </>
      )}
      <Row gutter={token.margin}>
        <Col xs={24} sm={12}>
          <Form.Item label="Ngày giờ bắt đầu dự kiến" name="planned_start_at">
            <DatePicker
              showTime
              format="DD/MM/YYYY HH:mm"
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label="Ngày giờ hoàn thành dự kiến"
            name="planned_end_at"
            dependencies={["planned_start_at"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const start = getFieldValue("planned_start_at");
                  return !start || !value || value.isAfter(start)
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error(
                          "Thời điểm hoàn thành phải sau thời điểm bắt đầu",
                        ),
                      );
                },
              }),
            ]}
          >
            <DatePicker
              showTime
              format="DD/MM/YYYY HH:mm"
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="Ghi chú" name="note">
        <Input.TextArea
          maxLength={10000}
          autoSize={{ minRows: 2, maxRows: 5 }}
        />
      </Form.Item>
    </>
  );
}
