import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import { RequestError } from "../../components/common/RequestError";
import { usePermissions } from "../auth/hooks/usePermissions";
import { decimalPattern, decimalText, weightText } from "../../utils/decimal";
import { LedgerDecimalInput } from "../customer-ledger/components/LedgerDecimalInput";
import {
  catalogGet,
  catalogList,
  catalogWrite,
  type Bom,
  type BomItem,
} from "./api";

export function ComponentSelect({
  value,
  onChange,
  snapshot,
}: {
  value?: string;
  onChange?: (id: string) => void;
  snapshot?: string | null;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: ["catalog", "components", "selector", q, page],
    queryFn: () =>
      catalogList("components", { q, page, page_size: 30, status: "ACTIVE" }),
  });
  const options = (result.data?.data ?? []).map((r) => ({
    value: r.id,
    label: r.code + " · " + r.name,
  }));
  if (value && !options.some((o) => o.value === value))
    options.push({ value, label: snapshot ?? "Cấu kiện đã chọn" });
  return (
    <>
      <Select
        value={value}
        onChange={onChange}
        showSearch={{
          filterOption: false,
          onSearch: (text) => {
            setQ(text);
            setPage(1);
          },
        }}
        loading={result.isFetching}
        options={options}
        placeholder="Chọn cấu kiện"
        popupRender={(menu) => (
          <>
            {menu}
            <Space style={{ padding: 8 }}>
              <Button
                size="small"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Trước
              </Button>
              <span>Trang {page}</span>
              <Button
                size="small"
                disabled={page * 30 >= (result.data?.meta.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
              </Button>
            </Space>
          </>
        )}
      />
      <RequestError error={result.error} />
    </>
  );
}
function BomEditor({
  designId,
  bom,
  close,
  saved,
}: {
  designId: string;
  bom?: Bom;
  close: () => void;
  saved: () => void;
}) {
  const [form] = Form.useForm(),
    [version] = useState(bom?.version);
  const save = useMutation({
    mutationFn: (values: { items: BomItem[] }) =>
      catalogWrite(
        bom ? "/boms/" + bom.id : `/design-models/${designId}/boms`,
        {
          items: (values.items ?? []).map((i) => ({
            ...(i.id ? { id: i.id } : {}),
            item_type: i.item_type,
            component_id: i.item_type === "COMPONENT" ? i.component_id : null,
            name_snapshot: i.name_snapshot ?? null,
            quantity: i.quantity || null,
            weight_g: i.weight_g || null,
            unit: i.unit ?? null,
          })),
          ...(bom ? { version } : {}),
        },
        bom ? "patch" : "post",
      ),
    onSuccess: saved,
  });
  return (
    <div onSubmit={(event) => event.stopPropagation()}>
      <Modal
        open
        title={bom ? "Chỉnh sửa BOM" : "Tạo BOM"}
        width={850}
        maskClosable={false}
        onCancel={close}
        closable={!save.isPending}
        footer={
          <Button
            type="primary"
            loading={save.isPending}
            onClick={() => form.submit()}
          >
            Lưu
          </Button>
        }
      >
        <RequestError error={save.error} />
        <Typography.Paragraph>
          Trọng lượng cấu thành không thay thế trọng lượng mẫu vật lý. Tên cấu
          kiện được lưu tại thời điểm thêm vào BOM.
        </Typography.Paragraph>
        <Form
          name="bom-editor-form"
          form={form}
          layout="vertical"
          initialValues={{ items: bom?.items ?? [] }}
          onFinish={(values) => save.mutate(values)}
          disabled={save.isPending}
        >
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card
                    size="small"
                    key={field.key}
                    style={{ marginBottom: 12 }}
                    extra={
                      <Button danger onClick={() => remove(field.name)}>
                        Xóa dòng
                      </Button>
                    }
                  >
                    <Form.Item
                      name={[field.name, "item_type"]}
                      label="Loại dòng"
                      rules={[{ required: true }]}
                    >
                      <Select
                        onChange={(type) => {
                          if (type === "AUX_MATERIAL")
                            form.setFieldValue(
                              ["items", field.name, "component_id"],
                              null,
                            );
                        }}
                        options={[
                          { value: "COMPONENT", label: "Cấu kiện" },
                          { value: "AUX_MATERIAL", label: "Nguyên liệu phụ" },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate>
                      {() =>
                        form.getFieldValue([
                          "items",
                          field.name,
                          "item_type",
                        ]) === "COMPONENT" ? (
                          <>
                            <Form.Item
                              name={[field.name, "component_id"]}
                              label="Cấu kiện"
                              rules={[{ required: true }]}
                            >
                              <ComponentSelect
                                snapshot={form.getFieldValue([
                                  "items",
                                  field.name,
                                  "name_snapshot",
                                ])}
                              />
                            </Form.Item>
                            {form.getFieldValue([
                              "items",
                              field.name,
                              "id",
                            ]) && (
                              <Typography.Text type="secondary">
                                Tên đã lưu:{" "}
                                {form.getFieldValue([
                                  "items",
                                  field.name,
                                  "name_snapshot",
                                ])}
                              </Typography.Text>
                            )}
                          </>
                        ) : (
                          <Form.Item
                            name={[field.name, "name_snapshot"]}
                            label="Tên nguyên liệu phụ"
                            rules={[
                              { required: true, whitespace: true, max: 180 },
                            ]}
                          >
                            <Input />
                          </Form.Item>
                        )
                      }
                    </Form.Item>
                    <Space wrap align="start">
                      <Form.Item
                        name={[field.name, "quantity"]}
                        label="Số lượng"
                        rules={[{ pattern: decimalPattern }]}
                      >
                        <LedgerDecimalInput />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "weight_g"]}
                        label="Trọng lượng (g)"
                        rules={[{ pattern: decimalPattern }]}
                      >
                        <LedgerDecimalInput />
                      </Form.Item>
                      <Form.Item name={[field.name, "unit"]} label="Đơn vị">
                        <Select
                          allowClear
                          style={{ width: 140 }}
                          options={[
                            { value: "PCS", label: "PCS (cái)" },
                            { value: "G", label: "G (gram)" },
                            { value: "CM", label: "CM (cm)" },
                          ]}
                        />
                      </Form.Item>
                    </Space>
                  </Card>
                ))}
                <Button
                  disabled={fields.length >= 200}
                  onClick={() => add({ item_type: "COMPONENT", unit: "PCS" })}
                >
                  Thêm dòng cấu thành
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
export function BomPanel({ designId }: { designId: string }) {
  const { can } = usePermissions(),
    cache = useQueryClient(),
    { message } = App.useApp();
  const [editing, setEditing] = useState<Bom | "new">();
  const result = useQuery({
    queryKey: ["catalog-boms", designId],
    queryFn: () => catalogGet<Bom[]>(`/design-models/${designId}/boms`),
  });
  return (
    <Space orientation="vertical" style={{ width: "100%" }}>
      <Space>
        <Typography.Title level={5}>Cấu thành sản phẩm (BOM)</Typography.Title>
        {can("boms.manage") && (
          <Button onClick={() => setEditing("new")}>Tạo BOM</Button>
        )}
      </Space>
      <RequestError error={result.error} retry={() => void result.refetch()} />
      {!result.isFetching && !result.data?.length && (
        <Typography.Text type="secondary">
          Chưa có BOM. Không bắt buộc tạo công thức khi thêm mẫu mã.
        </Typography.Text>
      )}
      {(result.data ?? []).map((bom, index) => (
        <Card
          key={bom.id}
          size="small"
          title={`BOM ${index + 1}`}
          extra={
            can("boms.manage") ? (
              <Button onClick={() => setEditing(bom)}>Chỉnh sửa</Button>
            ) : undefined
          }
        >
          <Table
            rowKey={(r) => r.id!}
            size="small"
            pagination={false}
            dataSource={bom.items}
            scroll={{ x: 550 }}
            columns={[
              {
                title: "Loại",
                render: (_, i) =>
                  i.item_type === "COMPONENT" ? "Cấu kiện" : "Nguyên liệu phụ",
              },
              { title: "Tên đã lưu", dataIndex: "name_snapshot" },
              { title: "Số lượng", render: (_, i) => decimalText(i.quantity) },
              {
                title: "Trọng lượng",
                render: (_, i) => weightText(i.weight_g),
              },
              { title: "Đơn vị", render: (_, i) => i.unit ?? "—" },
            ]}
          />
        </Card>
      ))}
      {editing && (
        <BomEditor
          key={editing === "new" ? "new" : editing.id}
          designId={designId}
          bom={editing === "new" ? undefined : editing}
          close={() => setEditing(undefined)}
          saved={() => {
            setEditing(undefined);
            void cache.invalidateQueries({
              queryKey: ["catalog-boms", designId],
            });
            void cache.invalidateQueries({ queryKey: ["catalog"] });
            message.success("Đã lưu BOM");
          }}
        />
      )}
    </Space>
  );
}
