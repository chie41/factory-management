import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Select, Space, Table, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { PageFrame } from "../components/common/PageFrame";
import { RequestError } from "../components/common/RequestError";
import { usePermissions } from "../features/auth/hooks/usePermissions";
import {
  batchList,
  batchStatuses,
  type Batch,
} from "../features/production/api";

export function ProductionBatchesPage() {
  const { can } = usePermissions(),
    navigate = useNavigate();
  const [q, setQ] = useState(""),
    [status, setStatus] = useState<string>(),
    [page, setPage] = useState(1),
    [size, setSize] = useState(20),
    [sort, setSort] = useState("created_at"),
    [direction, setDirection] = useState("desc");
  const list = useQuery({
    queryKey: ["production-batches", q, status, page, size, sort, direction],
    queryFn: () =>
      batchList({ q, status, page, page_size: size, sort, direction }),
  });
  return (
    <PageFrame
      title="Lô sản xuất"
      subtitle="Lô độc lập với đơn hàng, sử dụng bản sao quy trình tại thời điểm tạo"
      action={
        can("production.create") && can("design_models.read")
          ? "Tạo lô sản xuất"
          : undefined
      }
      onAction={() => navigate("/production-batches/new")}
    >
      <Space wrap>
        <Input.Search
          placeholder="Mã lô, mã hoặc tên mẫu mã"
          allowClear
          onSearch={(text) => {
            setQ(text);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="Trạng thái"
          style={{ minWidth: 180 }}
          value={status}
          options={Object.entries(batchStatuses).map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <Select
          value={sort + ":" + direction}
          options={[
            { value: "created_at:desc", label: "Mới tạo trước" },
            { value: "created_at:asc", label: "Cũ nhất trước" },
            { value: "code:asc", label: "Mã lô tăng dần" },
            { value: "planned_start:asc", label: "Ngày dự kiến bắt đầu" },
            { value: "planned_quantity:desc", label: "Số lượng giảm dần" },
          ]}
          onChange={(v) => {
            const [field, order] = v.split(":");
            setSort(field);
            setDirection(order);
            setPage(1);
          }}
        />
      </Space>
      <RequestError error={list.error} retry={() => void list.refetch()} />
      <Table<Batch>
        rowKey="id"
        loading={list.isFetching}
        dataSource={list.data?.data ?? []}
        scroll={{ x: 850 }}
        pagination={{
          current: page,
          pageSize: size,
          total: list.data?.meta.total,
          showSizeChanger: true,
          onChange: (p, s) => {
            setPage(p);
            setSize(s);
          },
        }}
        columns={[
          {
            title: "Mã lô",
            render: (_, b) => (
              <Button
                type="link"
                onClick={() => navigate("/production-batches/" + b.id)}
              >
                {b.code}
              </Button>
            ),
          },
          {
            title: "Mẫu mã",
            render: (_, b) =>
              b.model_code_snapshot + " · " + b.model_name_snapshot,
          },
          {
            title: "Số lượng dự kiến",
            render: (_, b) =>
              b.planned_quantity.toLocaleString("vi-VN") + " SP",
          },
          {
            title: "Trạng thái",
            render: (_, b) => <Tag>{batchStatuses[b.status] ?? b.status}</Tag>,
          },
          {
            title: "Ngày dự kiến bắt đầu",
            dataIndex: "planned_start",
            render: (v) => v ?? "—",
          },
          {
            title: "Ngày tạo",
            render: (_, b) => new Date(b.created_at).toLocaleString("vi-VN"),
          },
          { title: "Người tạo", dataIndex: "created_by_name" },
        ]}
      />
    </PageFrame>
  );
}
