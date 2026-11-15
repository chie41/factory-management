import { laborPriceText as currencyText } from "./laborPrice";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Select, Space, Typography } from "antd";
import { catalogGet, catalogList, catalogPrice, catalogPriceCurrency, type CatalogRow } from "./api";
import { CatalogImage } from "./CatalogImage";
import { RequestError } from "../../components/common/RequestError";
import { weightText } from "../../utils/decimal";
export function OrderDesignSelect({
  value,
  onChange,
  onPick,
}: {
  value?: string;
  onChange?: (id?: string) => void;
  onPick: (row?: CatalogRow) => void;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["catalog", "design-selector", q, page],
    queryFn: () =>
      catalogList("design-models", {
        q,
        status: "ACTIVE",
        page,
        page_size: 30,
      }),
  });
  const detail = useQuery({
    queryKey: ["catalog", "design-models", value],
    queryFn: () => catalogGet<CatalogRow>("/design-models/" + value),
    enabled: !!value,
  });
  const options = (list.data?.data ?? []).map((r) => ({
    value: r.id,
    label: r.code + " · " + r.name,
  }));
  if (value && detail.data && !options.some((o) => o.value === value))
    options.push({ value, label: detail.data.code + " · " + detail.data.name });
  return (
    <>
      <Select
        allowClear
        value={value}
        placeholder="Chọn mẫu đang sử dụng (nếu có)"
        showSearch={{
          filterOption: false,
          onSearch: (text) => {
            setQ(text);
            setPage(1);
          },
        }}
        loading={list.isFetching}
        options={options}
        onChange={(id) => {
          onChange?.(id);
          onPick(list.data?.data.find((r) => r.id === id));
        }}
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
                disabled={page * 30 >= (list.data?.meta.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
              </Button>
            </Space>
          </>
        )}
      />
      <RequestError error={list.error || detail.error} />
      {detail.data && (
        <Space style={{ marginTop: 8 }}>
          <CatalogImage value={detail.data.image_url} />
          <Typography.Text type="secondary">
            Mẫu: {weightText(detail.data.weight_g)} · Giá đề xuất:{" "}
            {currencyText(
              catalogPrice(detail.data),
              catalogPriceCurrency(detail.data),
            )}
            {catalogPriceCurrency(detail.data) &&
            catalogPriceCurrency(detail.data) !== "THB"
              ? " · Nhập giá công đơn bằng BAHT; không tự quy đổi giá đề xuất."
              : ""}
          </Typography.Text>
        </Space>
      )}
    </>
  );
}

