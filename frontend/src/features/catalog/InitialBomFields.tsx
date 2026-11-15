import { Button, Form, Input, Select } from "antd";
import { decimalPattern } from "../../utils/decimal";
import { LedgerDecimalInput } from "../customer-ledger/components/LedgerDecimalInput";
import { ComponentSelect } from "./BomPanel";
export function InitialBomFields() {
  const form = Form.useFormInstance();
  return (
    <Form.List name="initial_bom_items">
      {(fields, { add, remove }) => (
        <div className="catalog-bom-columns">
          {(["COMPONENT", "AUX_MATERIAL"] as const).map((type) => (
            <section className="catalog-bom-group" key={type}>
              <h4>{type === "COMPONENT" ? "Cấu kiện" : "Nguyên liệu phụ"}</h4>
              <p>
                {type === "COMPONENT"
                  ? "Các thành phần cấu tạo có thể dùng lại."
                  : "Vật liệu dùng cho hàn, pha và lắp ráp."}
              </p>
              <div className="catalog-bom-row catalog-bom-head">
                <span>{type === "COMPONENT" ? "Cấu kiện" : "Nguyên liệu"}</span>
                <span>Số lượng</span>
                <span>TL (g)</span>
                <span>Đơn vị</span>
                <span />
              </div>
              {fields
                .filter(
                  (f) =>
                    form.getFieldValue([
                      "initial_bom_items",
                      f.name,
                      "item_type",
                    ]) === type,
                )
                .map((f) => (
                  <div className="catalog-bom-row" key={f.key}>
                    <Form.Item name={[f.name, "item_type"]} hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[
                        f.name,
                        type === "COMPONENT" ? "component_id" : "name_snapshot",
                      ]}
                      rules={[
                        {
                          required: true,
                          ...(type === "AUX_MATERIAL"
                            ? { whitespace: true, max: 180 }
                            : {}),
                        },
                      ]}
                    >
                      {type === "COMPONENT" ? (
                        <ComponentSelect />
                      ) : (
                        <Input placeholder="Tên nguyên liệu" />
                      )}
                    </Form.Item>
                    <Form.Item
                      name={[f.name, "quantity"]}
                      rules={[{ pattern: decimalPattern }]}
                    >
                      <LedgerDecimalInput placeholder="0" />
                    </Form.Item>
                    <Form.Item
                      name={[f.name, "weight_g"]}
                      rules={[{ pattern: decimalPattern }]}
                    >
                      <LedgerDecimalInput placeholder="0" />
                    </Form.Item>
                    <Form.Item name={[f.name, "unit"]}>
                      <Select
                        options={[
                          { value: "PCS", label: "PCS" },
                          { value: "G", label: "G" },
                          { value: "CM", label: "CM" },
                        ]}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      onClick={() => remove(f.name)}
                      aria-label="Xóa dòng BOM"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              <Button
                disabled={fields.length >= 200}
                onClick={() =>
                  add({
                    item_type: type,
                    unit: type === "COMPONENT" ? "PCS" : "G",
                  })
                }
              >
                + Thêm {type === "COMPONENT" ? "cấu kiện" : "nguyên liệu phụ"}
              </Button>
            </section>
          ))}
        </div>
      )}
    </Form.List>
  );
}
