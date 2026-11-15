import { LaborPriceInput } from "./LaborPriceInput";
import { laborPriceText as currencyText } from "./laborPrice";
import { useId, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Checkbox, Form, Input, Select, Space, Typography } from "antd";
import { RequestError } from "../../components/common/RequestError";
import { LedgerDecimalInput } from "../customer-ledger/components/LedgerDecimalInput";
import { decimalPattern } from "../../utils/decimal";
import { moneyOptions } from "../customer-ledger/services/workflowService";
import { catalogGet, catalogWrite, type CatalogKind, type CatalogRow } from "./api";
import { CatalogImageUpload } from "./CatalogImage";
import { CatalogAttributesFields } from "./CatalogAttributesFields";
import { InitialBomFields } from "./InitialBomFields";
import { BomPanel } from "./BomPanel";
import { usePermissions } from "../auth/hooks/usePermissions";
import { decimalUnits } from "../../utils/decimal";
import type { BomItem } from "./api";
import "./catalog-editor.css";
import { DesignGroupSelect, type Group } from "./DesignGroups";

type Attribute = { key: string; value: string; kind: string; unit?: string };
export function CatalogForm({
  kind,
  row,
  close,
  saved,
}: {
  kind: CatalogKind;
  row?: CatalogRow;
  close: () => void;
  saved: (row: CatalogRow) => void;
}) {
  const [form] = Form.useForm(),
    [uploading, setUploading] = useState(false),
    [version] = useState(row?.version);
  const design = kind === "design-models";
  const { can } = usePermissions(),
    formId = useId();
  const weight = Form.useWatch("weight_g", form),
    ownPrice = Form.useWatch("default_labor_price_per_15g", form),
    currency = Form.useWatch("default_labor_currency", form);
  const groupId = Form.useWatch('group_id',form), override = Form.useWatch('labor_override',form);
  const group = useQuery({queryKey:['design-group',groupId],queryFn:()=>catalogGet<Group>('/design-model-groups/'+groupId),enabled:design && !!groupId});
  const price = override ? ownPrice : group.data?.default_labor_price_per_15g;
  const effectiveCurrency = override ? currency : price != null ? 'THB' : undefined;
  let estimated = "—";
  try {
    if (weight && price) {
      const amount =
        (decimalUnits(weight) * decimalUnits(price) + 75000n) / 150000n;
      estimated = currencyText(
        (amount / 10000n).toString() +
          "." +
          (amount % 10000n).toString().padStart(4, "0"),
        effectiveCurrency,
      );
    }
  } catch {
    /* incomplete input */
  }

  const initial = {
    ...row,
    status: row?.status ?? "ACTIVE",
    labor_override: row?.default_labor_price_per_15g != null,
    default_labor_currency: row?.default_labor_currency ?? "THB",
    initial_bom_items: [],
    attribute_pairs: Object.entries(row?.attributes ?? {}).map(([key, raw]) => {
      const structured =
        raw &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        Object.hasOwn(raw, "value") &&
        Object.hasOwn(raw, "unit")
          ? (raw as { value: unknown; unit: unknown })
          : null;
      const value = structured ? structured.value : raw;
      return {
        key,
        unit: structured ? String(structured.unit) : "",
        kind: typeof value === "object" ? "json" : typeof value,
        value:
          typeof value === "object" ? JSON.stringify(value) : String(value),
      };
    }),
  };
  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      const fields = design
        ? [
            "group_id",
            "name",
            "status",
            "image_url",
            "weight_g",
            "default_labor_price_per_15g",
            "default_labor_currency",
            "design_description",
            "note",
          ]
        : [
            "name",
            "weight_g",
            "length_mm",
            "width_mm",
            "height_mm",
            "status",
            "image_url",
            "description",
          ];
      const payload: Record<string, unknown> = Object.fromEntries(
        fields.map((key) => [
          key,
          values[key] === "" ? null : (values[key] ?? null),
        ]),
      );
      if (design && !values.labor_override) {
        payload.default_labor_price_per_15g = null;
        payload.default_labor_currency = null;
      }
      if (!design) {
        const attrs: Record<string, unknown> = {};
        for (const a of (values.attribute_pairs ?? []) as Attribute[]) {
          const key = a.key.trim();
          if (!key || Object.hasOwn(attrs, key))
            throw new Error(
              "Tên thuộc tính phải có giá trị và không trùng nhau",
            );
          const v =
            a.kind === "number"
              ? Number(a.value)
              : a.kind === "boolean"
                ? a.value === "true"
                : a.kind === "json"
                  ? JSON.parse(a.value)
                  : a.value;
          if (
            a.kind === "number" &&
            (!a.value.trim() || !Number.isFinite(v as number))
          )
            throw new Error("Giá trị thuộc tính số không hợp lệ");
          Object.defineProperty(attrs, key, {
            value: a.unit?.trim() ? { value: v, unit: a.unit.trim() } : v,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        payload.attributes = attrs;
      }
      if (design && !row && can("boms.manage"))
        payload.initial_bom_items = (
          (values.initial_bom_items ?? []) as BomItem[]
        ).map((i) => ({
          item_type: i.item_type,
          component_id: i.item_type === "COMPONENT" ? i.component_id : null,
          name_snapshot:
            i.item_type === "AUX_MATERIAL" ? i.name_snapshot : null,
          quantity: i.quantity || null,
          weight_g: i.weight_g || null,
          unit: i.unit ?? null,
        }));
      if (row) payload.version = version;
      return catalogWrite(
        "/" + kind + (row ? "/" + row.id : ""),
        payload,
        row ? "patch" : "post",
      );
    },
    onSuccess: saved,
  });
  const section = (title: string, subtitle: string, children: ReactNode) => (
    <section className="catalog-editor-card">
      <h3>{title}</h3>
      <p className="catalog-card-description">{subtitle}</p>
      {children}
    </section>
  );
  return (
    <section className="workspace-page catalog-editor">
      <div className="catalog-editor-heading">
        <div>
          <div className="catalog-editor-breadcrumb">
            <button type="button" onClick={close}>
              {design ? "Mẫu mã" : "Cấu kiện"}
            </button>
            <span>/</span>
            {row ? "Chỉnh sửa" : "Thêm mới"}
          </div>
          <Typography.Title level={2}>
            {row ? "Chỉnh sửa" : "Thêm"} {design ? "mẫu mã" : "cấu kiện"}
          </Typography.Title>
          <p>
            {design
              ? "Tạo mẫu mã, thông tin thiết kế và công thức cấu thành."
              : "Tạo thành phần có thể sử dụng trong công thức sản phẩm."}
          </p>
        </div>
        <Space>
          <Button onClick={close} disabled={save.isPending || uploading}>
            Hủy
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            form={formId}
            loading={save.isPending}
            disabled={uploading}
          >
            Lưu {design ? "mẫu mã" : "cấu kiện"}
          </Button>
        </Space>
      </div>
      <RequestError error={save.error} />
      <Form
        name={design ? "design-model-form" : "component-form"}
        id={formId}
        form={form}
        layout="vertical"
        initialValues={initial}
        onFinish={(values) => save.mutate(values)}
        disabled={save.isPending}
      >
        <div className="catalog-editor-grid">
          <div className="catalog-editor-main">
            {section(
              "Thông tin cơ bản",
              design
                ? "Thông tin nhận diện và trọng lượng mẫu mã."
                : "Thông tin nhận diện và trọng lượng tham chiếu của cấu kiện.",
              <div className="catalog-basic-grid">
                <Form.Item
                  name="name"
                  className="catalog-name-field"
                  label={design ? "Tên mẫu mã" : "Tên cấu kiện"}
                  rules={[{ required: true, whitespace: true, max: 180 }]}
                >
                  <Input
                    placeholder={
                      design ? "Nhập tên mẫu mã" : "Nhập tên cấu kiện"
                    }
                    maxLength={180}
                  />
                </Form.Item>
                {design && (
                  <Form.Item name="group_id" label="Nhóm mẫu mã">
                    <DesignGroupSelect />
                  </Form.Item>
                )}
                <Form.Item
                  name="weight_g"
                  label={
                    design ? "Trọng lượng mẫu vật lý" : "Trọng lượng tham chiếu"
                  }
                  rules={[{ pattern: decimalPattern }]}
                >
                  <LedgerDecimalInput
                    suffix="g"
                    placeholder="Nhập trọng lượng"
                  />
                </Form.Item>
              </div>,
            )}
            {design && section('Thiết lập giá công','Mẫu kế thừa giá nhóm khi không bật giá riêng. Không tự sao chép giá nhóm vào mẫu mã.',<>
              <div className="catalog-inherited-price">
                <div><span>Nhóm mẫu mã</span><strong>{groupId ? group.data?.name ?? (group.isFetching ? 'Đang tải…' : 'Không tải được nhóm') : 'Chưa chọn nhóm'}</strong></div>
                <div><span>Giá công mặc định của nhóm /15g</span><strong>{groupId && group.isFetching ? 'Đang tải…' : group.error ? 'Không tải được giá nhóm' : group.data?.default_labor_price_per_15g != null ? currencyText(group.data.default_labor_price_per_15g,'THB') : 'Chưa thiết lập'}</strong></div>
              </div>
              <RequestError error={groupId ? group.error : undefined} retry={()=>void group.refetch()} />
              <Form.Item name="labor_override" valuePropName="checked"><Checkbox>Thiết lập giá công riêng cho mẫu mã này</Checkbox></Form.Item>
              {override && <Form.Item label="Giá công riêng /15g" extra="Giá 0 là cấu hình riêng hợp lệ. Đơn vị được giữ theo giá đã nhập.">
                <div className="catalog-price-input">
                  <Form.Item name="default_labor_price_per_15g" noStyle rules={[{required:true,message:'Nhập giá riêng, có thể bằng 0'},{pattern:decimalPattern,message:'Giá không âm, tối đa 4 số lẻ'}]}><LaborPriceInput placeholder="Nhập giá công riêng" /></Form.Item>
                  <Form.Item name="default_labor_currency" noStyle rules={[{required:true}]}><Select aria-label="Đơn vị tiền tệ giá công" options={moneyOptions} /></Form.Item>
                </div>
              </Form.Item>}
              <div className="catalog-price-estimate"><label>Giá công áp dụng /15g</label><strong>{!override && groupId && (group.isFetching || group.error) ? 'Chưa xác định' : price != null && price !== '' ? decimalPattern.test(price) ? currencyText(price,effectiveCurrency) : 'Chưa hợp lệ' : 'Chưa thiết lập'}</strong><small>{override ? 'Giá riêng của mẫu mã' : groupId ? 'Kế thừa giá nhóm hiện tại' : 'Chưa chọn nhóm; bật giá riêng để nhập trực tiếp cho mẫu'}</small></div>
              <div className="catalog-price-estimate"><label>Tạm tính giá công</label><strong>{estimated}</strong><small>Theo trọng lượng mẫu và giá công áp dụng /15g.</small></div>
            </>)}
            {!design &&
              section(
                "Thuộc tính kỹ thuật",
                "Khai báo linh hoạt theo đặc điểm của cấu kiện.",
                <CatalogAttributesFields />,
              )}
            {!design &&
              section(
                "Mô tả",
                "Ghi chú kỹ thuật hoặc mô tả cấu kiện.",
                <Form.Item name="description">
                  <Input.TextArea
                    rows={4}
                    placeholder="Nhập mô tả hoặc ghi chú kỹ thuật của cấu kiện."
                    maxLength={10000}
                  />
                </Form.Item>,
              )}
          </div>
          <aside className="catalog-editor-side">
            {section(
              design ? "Hình ảnh mẫu mã" : "Hình ảnh cấu kiện",
              design
                ? "Ảnh đại diện giúp nhận diện mẫu mã."
                : "Một ảnh đại diện cho cấu kiện.",
              <Form.Item name="image_url">
                <CatalogImageUpload
                  kind={kind}
                  designId={row?.id}
                  onPending={setUploading}
                  tile
                />
              </Form.Item>,
            )}
            {section(
              "Trạng thái",
              "Kiểm soát khả năng sử dụng trong nghiệp vụ mới.",
              <Form.Item name="status" label="Trạng thái hiện tại">
                <Select
                  options={[
                    { value: "ACTIVE", label: "Đang hoạt động" },
                    { value: "INACTIVE", label: "Ngừng sử dụng" },
                  ]}
                />
              </Form.Item>,
            )}
          </aside>
        </div>
        {design &&
          section(
            "BOM / Công thức mẫu mã",
            "Thiết lập các cấu kiện và nguyên liệu phụ cần để cấu thành sản phẩm.",
            row ? (
              <BomPanel designId={row.id} />
            ) : can("boms.manage") ? (
              <>
                <InitialBomFields />
                <Alert
                  type="info"
                  title="BOM là tùy chọn. Mẫu mã và công thức được lưu cùng lần lưu; trọng lượng BOM không ghi đè trọng lượng mẫu vật lý."
                />
              </>
            ) : (
              <Typography.Text type="secondary">
                Bạn có thể tạo mẫu mã trước. Quản lý công thức cần quyền BOM.
              </Typography.Text>
            ),
          )}
        {design &&
          section(
            "Mô tả",
            "Ghi chú thiết kế, đặc điểm và yêu cầu kỹ thuật.",
            <>
              <Form.Item name="design_description" label="Mô tả thiết kế">
                <Input.TextArea
                  rows={4}
                  placeholder="Nhập mô tả thiết kế của mẫu mã."
                  maxLength={10000}
                />
              </Form.Item>
              <Form.Item name="note" label="Ghi chú bổ sung">
                <Input.TextArea rows={2} maxLength={10000} />
              </Form.Item>
            </>,
          )}
      </Form>
    </section>
  );
}

