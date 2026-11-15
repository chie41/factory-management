import { laborPriceText as currencyText } from "../features/catalog/laborPrice";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Dropdown,
  Input,
  Select,
  Spin,
  Tag,
  Typography,
} from "antd";
import { MoreOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageFrame } from "../components/common/PageFrame";
import { DataTable } from "../components/common/DataTable";
import { FilterRow } from "../components/common/FilterRow";
import { RequestError } from "../components/common/RequestError";
import { usePermissions } from "../features/auth/hooks/usePermissions";
import { decimalText, weightText } from "../utils/decimal";
import {
  catalogGet,
  catalogPrice,
  catalogPriceCurrency,
  catalogList,
  catalogWrite,
  type CatalogKind,
  type CatalogRow,
} from "../features/catalog/api";
import { CatalogForm } from "../features/catalog/CatalogForm";
import { CatalogImage } from "../features/catalog/CatalogImage";
import { BomPanel } from "../features/catalog/BomPanel";
import { ProductionWorkflow } from "../features/catalog/ProductionWorkflow";
import { errorText } from "../services/apiErrors";
import {
  DesignGroupManager,
  DesignGroupSelect,
} from "../features/catalog/DesignGroups";

export function CatalogPage({ kind }: { kind: CatalogKind }) {
  const design = kind === "design-models",
    module = design ? "design_models" : "components",
    title = design ? "Mẫu mã" : "Cấu kiện";
  const { can } = usePermissions(),
    cache = useQueryClient(),
    { message, modal } = App.useApp(),
    navigate = useNavigate();
  const [q, setQ] = useState(""),
    [status, setStatus] = useState<string>(),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10);
  const [groupId, setGroupId] = useState<string>(),
    [groupsOpen, setGroupsOpen] = useState(false);
  const [workflowDirty, setWorkflowDirty] = useState(false);
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<string | undefined>(
      params.get("detail") ?? undefined,
    ),
    [editing, setEditing] = useState<CatalogRow | "new">();
  const list = useQuery({
    queryKey: ["catalog", kind, q, status, groupId, page, pageSize],
    queryFn: () =>
      catalogList(kind, {
        q,
        status,
        page,
        page_size: pageSize,
        group_id: design ? groupId : undefined,
      }),
  });
  const detail = useQuery({
    queryKey: ["catalog", kind, selected],
    queryFn: () => catalogGet<CatalogRow>("/" + kind + "/" + selected),
    enabled: !!selected,
  });
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["catalog"] });
    message.success("Đã lưu danh mục");
  };
  const action = useMutation({
    mutationFn: ({ row, remove }: { row: CatalogRow; remove?: boolean }) =>
      catalogWrite(
        `/${kind}/${row.id}${remove ? "" : "/status"}`,
        remove
          ? { version: row.version }
          : {
              version: row.version,
              status: row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
            },
        remove ? "delete" : "patch",
      ),
    onSuccess: async () => {
      setSelected(undefined);
      await refresh();
    },
    onError: (e) => message.error(errorText(e)),
  });
  const run = async (row: CatalogRow, key: string) => {
    if (key === "view") {
      setSelected(row.id);
      return;
    }
    if (key === "edit") {
      try {
        setEditing(await catalogGet<CatalogRow>("/" + kind + "/" + row.id));
      } catch (e) {
        message.error(errorText(e));
      }
      return;
    }
    try {
      const latest = await catalogGet<CatalogRow>("/" + kind + "/" + row.id);
      modal.confirm({
        title:
          key === "delete"
            ? `Xóa ${design ? "mẫu mã" : "cấu kiện"} ${row.code}?`
            : `${row.status === "ACTIVE" ? "Ngừng" : "Tiếp tục"} sử dụng ${row.code}?`,
        content:
          key === "delete"
            ? "Chỉ xóa khi không có tham chiếu. Dữ liệu đang sử dụng sẽ được giữ lại."
            : undefined,
        okText: key === "delete" ? "Xóa" : "Lưu",
        okButtonProps: { danger: key === "delete" },
        cancelText: "Quay lại",
        onOk: () =>
          action.mutateAsync({ row: latest, remove: key === "delete" }),
      });
    } catch (e) {
      message.error(errorText(e));
    }
  };
  const row = detail.data;
  if (editing)
    return (
      <CatalogForm
        key={editing === "new" ? "new" : editing.id + editing.version}
        kind={kind}
        row={editing === "new" ? undefined : editing}
        close={() => setEditing(undefined)}
        saved={(saved) => {
          setEditing(undefined);
          setSelected(saved.id);
          void refresh();
        }}
      />
    );
  return (
    <PageFrame
      title={title}
      subtitle={
        design
          ? "Thiết kế, mẫu vật lý, giá công áp dụng và BOM"
          : "Danh mục cấu kiện tái sử dụng trong các mẫu mã"
      }
      action={
        can(module + ".create")
          ? `Thêm ${design ? "mẫu mã" : "cấu kiện"}`
          : undefined
      }
      onAction={() => setEditing("new")}
    >
      <FilterRow>
        <Input.Search
          allowClear
          placeholder="Tìm theo mã hoặc tên"
          onSearch={(value) => {
            setQ(value);
            setPage(1);
          }}
          style={{ maxWidth: 360 }}
        />
        {
          <Select
            allowClear
            placeholder="Trạng thái"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            style={{ width: 190 }}
            options={[
              { value: "ACTIVE", label: "Đang sử dụng" },
              { value: "INACTIVE", label: "Ngừng sử dụng" },
            ]}
          />
        }
        {design && (
          <div style={{ minWidth: 200 }}>
            <DesignGroupSelect
              value={groupId}
              onChange={(id) => {
                setGroupId(id);
                setPage(1);
              }}
              placeholder="Lọc nhóm mẫu mã"
              allowCreate={false}
            />
          </div>
        )}
        {design && can("design_models.read") && (
          <Button onClick={() => setGroupsOpen(true)}>Nhóm mẫu mã</Button>
        )}
      </FilterRow>
      <RequestError error={list.error} retry={() => void list.refetch()} />
      <DataTable<CatalogRow>
        rowKey="id"
        dataSource={list.data?.data ?? []}
        loading={list.isFetching}
        onRow={(r) => ({ onDoubleClick: () => setSelected(r.id) })}
        pagination={{
          current: page,
          pageSize,
          total: list.data?.meta.total ?? 0,
          showSizeChanger: true,
          onChange: (p, size) => {
            setPage(p);
            setPageSize(size);
          },
        }}
        columns={[
          {
            title: "Ảnh",
            width: 90,
            render: (_: unknown, r: CatalogRow) => (
              <CatalogImage value={r.image_url} />
            ),
          },
          {
            title: design ? "Mã mẫu" : "Mã cấu kiện",
            dataIndex: "code",
            width: 140,
          },
          {
            title: "Tên",
            dataIndex: "name",
            render: (_, r) => (
              <Button type="link" onClick={() => setSelected(r.id)}>
                {r.name}
              </Button>
            ),
          },
          {
            title: "Trọng lượng",
            width: 140,
            render: (_, r) => weightText(r.weight_g),
          },
          ...(design
            ? [
                {
                  title: "Giá công / 15g",
                  width: 160,
                  render: (_: unknown, r: CatalogRow) => <>{currencyText(catalogPrice(r),catalogPriceCurrency(r))}<div style={{fontSize:11,color:'#788494'}}>{r.labor_price_source === 'GROUP_DEFAULT' ? 'Theo nhóm' : r.labor_price_source === 'MODEL' ? 'Giá riêng' : 'Chưa thiết lập'}</div></>,
                },
              ]
            : ["length_mm", "width_mm", "height_mm"].map((key, i) => ({
                title: ["Chiều dài", "Chiều rộng", "Chiều cao"][i],
                width: 120,
                render: (_: unknown, r: CatalogRow) =>
                  r[key as keyof CatalogRow] != null
                    ? decimalText(r[key as "length_mm"]) + " mm"
                    : "—",
              }))),
          {
            title: "Trạng thái",
            width: 160,
            render: (_: unknown, r: CatalogRow) => (
              <Tag color={r.status === "ACTIVE" ? "green" : "default"}>
                {r.status === "ACTIVE" ? "Đang sử dụng" : "Ngừng sử dụng"}
              </Tag>
            ),
          },
          ...(design
            ? [
                {
                  title: "Nhóm mẫu mã",
                  dataIndex: "group_name",
                  width: 160,
                  render: (value: string | null) => value ?? "Chưa phân nhóm",
                },
              ]
            : []),
          {
            title: "Thao tác",
            width: 90,
            render: (_, r) => (
              <Dropdown
                trigger={["click", "hover"]}
                menu={{
                  items: [
                    { key: "view", label: "Xem chi tiết" },
                    ...(can(module + ".update")
                      ? [
                          { key: "edit", label: "Chỉnh sửa" },
                          {
                            key: "status",
                            label:
                              r.status === "ACTIVE"
                                ? "Ngừng sử dụng"
                                : "Tiếp tục sử dụng",
                          },
                        ]
                      : []),
                    ...(can(module + ".delete")
                      ? [{ key: "delete", label: "Xóa", danger: true }]
                      : []),
                  ],
                  onClick: ({ key }) => void run(r, key),
                }}
              >
                <Button
                  type="text"
                  icon={<MoreOutlined />}
                  aria-label={`Thao tác ${r.code}`}
                />
              </Dropdown>
            ),
          },
        ]}
      />
      <Drawer
        open={!!selected}
        title={
          row ? `${title} · ${row.code}` : `Chi tiết ${title.toLowerCase()}`
        }
        width={850}
        onClose={() => {
          if (workflowDirty) modal.confirm({title:'Bỏ thay đổi công đoạn chưa lưu?',okText:'Bỏ thay đổi',cancelText:'Tiếp tục sửa',onOk:()=>{setWorkflowDirty(false);setSelected(undefined);}});
          else setSelected(undefined);
        }}
      >
        <RequestError
          error={detail.error}
          retry={() => void detail.refetch()}
        />
        {detail.isPending && <Spin />}
        {row && (
          <>
            <CatalogImage value={row.image_url} size={220} />
            <Descriptions
              column={{ xs: 1, sm: 2 }}
              style={{ marginBlock: 16 }}
              items={[
                { key: "code", label: "Mã", children: row.code },
                { key: "name", label: "Tên", children: row.name },
                {
                  key: "weight",
                  label: design
                    ? "Trọng lượng mẫu vật lý"
                    : "Trọng lượng đơn vị",
                  children: weightText(row.weight_g),
                },
                ...(design
                  ? [
                      {
                        key: "price",
                        label: "Giá công / 15g",
                        children: currencyText(
                          catalogPrice(row),
                          catalogPriceCurrency(row),
                        ),
                      },
                      {
                        key: "status",
                        label: "Trạng thái",
                        children:
                          row.status === "ACTIVE"
                            ? "Đang sử dụng"
                            : "Ngừng sử dụng",
                      },
                      {
                        key: "description",
                        label: "Mô tả thiết kế",
                        children: row.design_description || "—",
                      },
                      {
                        key: "note",
                        label: "Ghi chú",
                        children: row.note || "—",
                      },
                    ]
                  : ["length_mm", "width_mm", "height_mm"].map((key, i) => ({
                      key,
                      label: ["Chiều dài", "Chiều rộng", "Chiều cao"][i],
                      children:
                        row[key as "length_mm"] != null
                          ? decimalText(row[key as "length_mm"]) + " mm"
                          : "—",
                    }))),
              ]}
            />
            {design ? (
              <Descriptions
                column={1}
                items={[
                  {
                    key: "group",
                    label: "Nhóm mẫu mã",
                    children: row.group_name ?? "Chưa phân nhóm",
                  },
                ]}
              />
            ) : (
              <Descriptions
                column={1}
                items={[
                  {
                    key: "component-status",
                    label: "Trạng thái",
                    children:
                      row.status === "ACTIVE"
                        ? "Đang hoạt động"
                        : "Ngừng sử dụng",
                  },
                  {
                    key: "component-description",
                    label: "Mô tả",
                    children: row.description || "—",
                  },
                ]}
              />
            )}
            {can(module + ".update") && (
              <Button disabled={workflowDirty} onClick={() => setEditing(row)}>Chỉnh sửa</Button>
            )}
            {design ? (
              <><BomPanel designId={row.id} /><ProductionWorkflow key={row.id} kind="model" id={row.id} onDirtyChange={setWorkflowDirty} /></>
            ) : (
              <>
                <Typography.Title level={5}>
                  Thuộc tính kỹ thuật
                </Typography.Title>
                <Descriptions
                  column={1}
                  items={Object.entries(row.attributes ?? {}).map(
                    ([key, value]) => ({
                      key,
                      label: key,
                      children:
                        value == null
                          ? "—"
                          : typeof value === "object"
                            ? JSON.stringify(value)
                            : typeof value === "boolean"
                              ? value
                                ? "Có"
                                : "Không"
                              : String(value),
                    }),
                  )}
                />
                <Typography.Title level={5}>
                  Mẫu mã đang sử dụng
                </Typography.Title>
                {row.used_by?.length
                  ? row.used_by.map((d) => (
                      <div key={d.id}>
                        {can("design_models.read") ? (
                          <Button
                            type="link"
                            onClick={() =>
                              navigate("/design-models?detail=" + d.id)
                            }
                          >
                            {d.code} · {d.name}
                          </Button>
                        ) : (
                          `${d.code} · ${d.name}`
                        )}
                      </div>
                    ))
                  : "Chưa được BOM sử dụng"}
              </>
            )}
          </>
        )}
      </Drawer>

      {groupsOpen && <DesignGroupManager close={() => setGroupsOpen(false)} />}
    </PageFrame>
  );
}

