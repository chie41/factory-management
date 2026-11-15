import { laborPriceText as currencyText } from "./laborPrice";
import { LaborPriceInput } from "./LaborPriceInput";
import { decimalPattern } from "../../utils/decimal";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input, Modal, Select, Space, Table } from "antd";
import { apiClient } from "../../services/apiClient";
import { RequestError } from "../../components/common/RequestError";
import { errorText } from "../../services/apiErrors";
import { usePermissions } from "../auth/hooks/usePermissions";
import { catalogGet, catalogWrite } from "./api";
import { DesignGroupDetail } from "./DesignGroupDetail";
export type Group = {
  default_labor_price_per_15g?: string | null;
  id: string;
  name: string;
  version: string;
  used_count: number;
};
type GroupList = { data: Group[]; meta: { total: number } };
const fetchGroups = async (q: string, page: number, size = 30) =>
  (
    await apiClient.get<GroupList>("/design-model-groups", {
      params: { q, page, page_size: size },
    })
  ).data;
function GroupForm({
  row,
  close,
  saved,
}: {
  row?: Group;
  close: () => void;
  saved: (row: Group) => void;
}) {
  const [form] = Form.useForm(),
    [version] = useState(row?.version);
  const save = useMutation({
    mutationFn: (values: {
      name: string;
      default_labor_price_per_15g?: string | null;
    }) =>
      catalogWrite<Group>(
        "/design-model-groups" + (row ? "/" + row.id : ""),
        {
          name: values.name,
          default_labor_price_per_15g:
            values.default_labor_price_per_15g || null,
          ...(row ? { version } : {}),
        },
        row ? "patch" : "post",
      ),
    onSuccess: saved,
  });
  return (
    <div onSubmit={(event) => event.stopPropagation()}>
      <Modal
        open
        title={row ? "Chỉnh sửa nhóm mẫu mã" : "Thêm nhóm mẫu mã"}
        onCancel={close}
        closable={!save.isPending}
        maskClosable={false}
        footer={
          <Button
            type="primary"
            loading={save.isPending}
            onClick={() => form.submit()}
          >
            Lưu nhóm
          </Button>
        }
      >
        <RequestError error={save.error} />
        <Form
          name="design-group-form"
          form={form}
          layout="vertical"
          initialValues={{
            name: row?.name,
            default_labor_price_per_15g: row?.default_labor_price_per_15g,
          }}
          onFinish={(values) => save.mutate(values)}
        >
          <Form.Item
            name="name"
            label="Tên nhóm"
            rules={[{ required: true, whitespace: true, max: 180 }]}
          >
            <Input placeholder="Ví dụ: Dây XO" maxLength={180} />
          </Form.Item>
          <Form.Item
            name="default_labor_price_per_15g"
            label="Giá công mặc định /15g (B)"
            rules={[
              {
                pattern: decimalPattern,
                message: "Giá không âm, tối đa 4 số lẻ",
              },
            ]}
            extra="Để trống nếu chưa thiết lập. Mẫu không có giá riêng sẽ kế thừa giá này; giá 0 vẫn hợp lệ."
          >
            <LaborPriceInput placeholder="Chưa thiết lập giá công" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
export function DesignGroupSelect({
  value,
  onChange,
  placeholder = "Chọn nhóm mẫu mã",
  allowCreate = true,
}: {
  value?: string | null;
  onChange?: (id?: string) => void;
  placeholder?: string;
  allowCreate?: boolean;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [creating, setCreating] = useState(false),
    cache = useQueryClient(),
    { can } = usePermissions();
  const list = useQuery({
    queryKey: ["design-groups", q, page],
    queryFn: () => fetchGroups(q, page),
  });
  const selected = useQuery({
    queryKey: ["design-group", value],
    queryFn: () => catalogGet<Group>("/design-model-groups/" + value),
    enabled: !!value,
  });
  const options = (list.data?.data ?? []).map((g) => ({
    value: g.id,
    label: g.name,
  }));
  if (value && selected.data && !options.some((o) => o.value === value))
    options.push({ value, label: selected.data.name });
  return (
    <>
      <Select
        value={value ?? undefined}
        onChange={onChange}
        allowClear
        placeholder={placeholder}
        loading={list.isFetching}
        options={options}
        showSearch={{
          filterOption: false,
          onSearch: (text) => {
            setQ(text);
            setPage(1);
          },
        }}
        popupRender={(menu) => (
          <>
            {menu}
            <Space wrap style={{ padding: 8 }}>
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
                disabled={page * 30 >= (list.data?.meta.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
              </Button>
              {allowCreate && can("design_models.groups.manage") && (
                <Button type="link" onClick={() => setCreating(true)}>
                  + Thêm nhóm mẫu mã
                </Button>
              )}
            </Space>
          </>
        )}
      />
      <RequestError error={list.error || selected.error} />
      {creating && (
        <GroupForm
          close={() => setCreating(false)}
          saved={(group) => {
            setCreating(false);
            void cache.invalidateQueries({ queryKey: ["design-groups"] });
            onChange?.(group.id);
          }}
        />
      )}
    </>
  );
}
export function DesignGroupManager({ close }: { close: () => void }) {
  const [detailId, setDetailId] = useState<string>();
  const { can } = usePermissions();
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<Group | "new">(),
    cache = useQueryClient(),
    { message, modal } = App.useApp();
  const list = useQuery({
    queryKey: ["design-groups", "manager", q, page],
    queryFn: () => fetchGroups(q, page, 10),
  });
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["design-groups"] });
    await cache.invalidateQueries({ queryKey: ["design-group"] });
    await cache.invalidateQueries({ queryKey: ["catalog"] });
    await cache.invalidateQueries({ queryKey: ["customer-labor-prices"] });
    await cache.invalidateQueries({
      queryKey: ["customer-labor-price-models"],
    });
    await cache.invalidateQueries({ queryKey: ["quick-options", "models"] });
    await cache.invalidateQueries({ queryKey: ["quick-effective-prices"] });
  };
  const remove = useMutation({
    mutationFn: (group: Group) =>
      catalogWrite(
        "/design-model-groups/" + group.id,
        { version: group.version },
        "delete",
      ),
    onSuccess: refresh,
    onError: (e) => message.error(errorText(e)),
  });
  return (
    <Modal open title="Nhóm mẫu mã" width={680} onCancel={close} footer={null}>
      <Space style={{ marginBlock: 16 }}>
        <Input.Search
          allowClear
          placeholder="Tìm tên nhóm"
          onSearch={(text) => {
            setQ(text);
            setPage(1);
          }}
        />
        <Button type="primary" disabled={!can('design_models.groups.manage')} onClick={() => setEditing("new")}>
          Thêm nhóm
        </Button>
      </Space>
      <RequestError error={list.error} retry={() => void list.refetch()} />
      <Table
        rowKey="id"
        dataSource={list.data?.data ?? []}
        loading={list.isFetching}
        pagination={{
          current: page,
          pageSize: 10,
          total: list.data?.meta.total ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
        columns={[
          {
            title: "Tên nhóm",
            render: (_, group) => (
              <Button type="link" onClick={() => setDetailId(group.id)}>
                {group.name}
              </Button>
            ),
          },
          { title: "Số mẫu mã", dataIndex: "used_count", width: 90 },
          {
            title: "Giá công /15g",
            align: "right",
            render: (_, group) =>
              currencyText(group.default_labor_price_per_15g, "THB"),
          },
          {
            title: "Thao tác",
            render: (_, group) => (
              <Space>
                <Button type="link" onClick={() => setDetailId(group.id)}>
                  Xem chi tiết
                </Button>
                <Button
                  type="link"
                  danger
                  disabled={
                    !can("design_models.groups.manage") || group.used_count > 0
                  }
                  onClick={() =>
                    modal.confirm({
                      title: "Xóa nhóm " + group.name + "?",
                      content: "Chỉ xóa nhóm không có mẫu mã sử dụng.",
                      okText: "Xóa",
                      cancelText: "Quay lại",
                      onOk: () => remove.mutateAsync(group),
                    })
                  }
                >
                  Xóa
                </Button>
              </Space>
            ),
          },
        ]}
      />
      {detailId && (
        <DesignGroupDetail id={detailId} close={() => setDetailId(undefined)} />
      )}
      {editing && (
        <GroupForm
          key={editing === "new" ? "new" : editing.id + editing.version}
          row={editing === "new" ? undefined : editing}
          close={() => setEditing(undefined)}
          saved={() => {
            setEditing(undefined);
            void refresh();
            message.success("Đã lưu nhóm mẫu mã");
          }}
        />
      )}
    </Modal>
  );
}

