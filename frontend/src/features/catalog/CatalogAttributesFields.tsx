import { Button, Form, Input, Select } from "antd";
import { decimalPattern } from "../../utils/decimal";
import { LedgerDecimalInput } from "../customer-ledger/components/LedgerDecimalInput";
export function CatalogAttributesFields() {
  const form = Form.useFormInstance();
  return (
    <>
      <div className="catalog-attribute-head">
        <span>Tên thuộc tính</span>
        <span>Giá trị</span>
        <span>Đơn vị</span>
        <span />
      </div>
      {(["length_mm", "height_mm", "width_mm"] as const).map((key, i) => (
        <div className="catalog-attribute-row" key={key}>
          <Input
            value={["Chiều dài", "Chiều cao", "Bản rộng"][i]}
            readOnly
            aria-label="Tên kích thước"
          />
          <Form.Item name={key} rules={[{ pattern: decimalPattern }]}>
            <LedgerDecimalInput placeholder="Nhập giá trị" />
          </Form.Item>
          <Input value="mm" readOnly aria-label="Đơn vị kích thước" />
          <Button
            type="text"
            danger
            onClick={() => form.setFieldValue(key, undefined)}
          >
            Xóa
          </Button>
        </div>
      ))}
      <Form.List name="attribute_pairs">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field) => (
              <div className="catalog-attribute-row" key={field.key}>
                <Form.Item
                  name={[field.name, "key"]}
                  rules={[{ required: true, whitespace: true }]}
                >
                  <Input placeholder="Tên thuộc tính" />
                </Form.Item>
                <Form.Item noStyle shouldUpdate>
                  {() => {
                    const kind = form.getFieldValue([
                      "attribute_pairs",
                      field.name,
                      "kind",
                    ]);
                    return (
                      <div>
                        <Form.Item name={[field.name, "value"]}>
                          {kind === "boolean" ? (
                            <Select
                              options={[
                                { value: "true", label: "Có" },
                                { value: "false", label: "Không" },
                              ]}
                            />
                          ) : (
                            <Input
                              placeholder="Giá trị"
                              readOnly={kind === "json"}
                            />
                          )}
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "kind"]}
                          className="catalog-attribute-type"
                        >
                          <Select
                            variant="borderless"
                            size="small"
                            options={[
                              { value: "string", label: "Văn bản" },
                              { value: "number", label: "Số" },
                              { value: "boolean", label: "Có / Không" },
                              ...(kind === "json"
                                ? [{ value: "json", label: "Dữ liệu đã lưu" }]
                                : []),
                            ]}
                          />
                        </Form.Item>
                      </div>
                    );
                  }}
                </Form.Item>
                <Form.Item name={[field.name, "unit"]}>
                  <Input placeholder="—" />
                </Form.Item>
                <Button type="text" danger onClick={() => remove(field.name)}>
                  Xóa
                </Button>
              </div>
            ))}
            <Button onClick={() => add({ kind: "string", value: "" })}>
              + Thêm thuộc tính
            </Button>
          </>
        )}
      </Form.List>
    </>
  );
}
