import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Image, Space, Spin, Upload } from "antd";
import {
  PictureOutlined,
  UploadOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { API_BASE, apiClient } from "../../services/apiClient";
import { errorText } from "../../services/apiErrors";

function catalogImageSource(value?: string | null) {
  const source = value?.trim();
  if (!source) return {};
  // Uploaded images use an authenticated API resource, not a public file URL.
  if (/^\/?catalog-images\//.test(source))
    return { resource: "/" + source.replace(/^\//, "") };
  try {
    const base = new URL(API_BASE.replace(/\/+$/, "") + "/", window.location.href);
    const resolved = new URL(source, base);
    if (resolved.origin === base.origin && resolved.pathname.startsWith(base.pathname)) {
      const relative = resolved.pathname.slice(base.pathname.length);
      if (relative.startsWith("catalog-images/"))
        return { resource: "/" + relative };
    }
    return /^https?:$/.test(resolved.protocol) ? { publicUrl: resolved.href } : {};
  } catch {
    return {};
  }
}

export function CatalogImage({
  value,
  size = 64,
  thumbnail = false,
}: {
  value?: string | null;
  size?: number;
  thumbnail?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const [image, setImage] = useState<{ blob: Blob; url: string }>();
  const { resource, publicUrl } = catalogImageSource(value);
  const query = useQuery({
    queryKey: ["catalog-image", resource],
    queryFn: async () =>
      (await apiClient.get<Blob>(resource!, { responseType: "blob" })).data,
    enabled: !!resource,
    staleTime: 3600000,
  });
  useEffect(() => {
    if (!query.data) return;
    // Setup and cleanup must own the same URL, including StrictMode remounts.
    const url = URL.createObjectURL(query.data);
    setImage({ blob: query.data, url });
    return () => URL.revokeObjectURL(url);
  }, [query.data]);
  const url = resource ? (image?.blob === query.data ? image?.url : undefined) : publicUrl;
  if (query.isFetching && !url) return <Spin size="small" />;
  const failed = !!query.error || (!!url && failedUrl === url);
  return url && !failed ? (
    <Image
      width={size}
      height={size}
      style={{ objectFit: thumbnail ? "cover" : "contain" }}
      src={url}
      alt="Ảnh mẫu mã"
      preview={!thumbnail}
      onError={() => setFailedUrl(url)}
    />
  ) : (
    <span title={failed ? "Không tải được ảnh" : "Chưa có ảnh"} role="img" aria-label={failed ? "Không tải được ảnh" : "Chưa có ảnh"}>
      <PictureOutlined />
      {failed && !thumbnail ? " Lỗi tải ảnh" : ""}
    </span>
  );
}
export function CatalogImageUpload({
  value,
  onChange,
  designId,
  onPending,
  kind = "design-models",
  tile = false,
}: {
  value?: string | null;
  onChange?: (value: string | null) => void;
  designId?: string;
  onPending?: (value: boolean) => void;
  kind?: "design-models" | "components";
  tile?: boolean;
}) {
  const [loading, setLoading] = useState(false),
    { message } = App.useApp();
  const props = {
    accept: "image/png,image/jpeg,image/webp",
    showUploadList: false,
    disabled: loading,
    beforeUpload: async (file: File) => {
      if (file.size > 5 * 1024 * 1024) {
        message.error("Ảnh tối đa 5 MB");
        return Upload.LIST_IGNORE;
      }
      setLoading(true);
      onPending?.(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await apiClient.post<{ data: { image_url: string } }>(
          designId
            ? "/" + kind + "/" + designId + "/images"
            : "/" + kind + "/images",
          body,
        );
        onChange?.(response.data.data.image_url);
      } catch (e) {
        message.error(errorText(e));
      } finally {
        setLoading(false);
        onPending?.(false);
      }
      return Upload.LIST_IGNORE;
    },
  };
  const label = kind === "components" ? "cấu kiện" : "mẫu mã";
  if (tile)
    return (
      <div className="catalog-image-upload">
        {value ? (
          <>
            <div className="catalog-image-preview">
              <CatalogImage value={value} size={220} />
            </div>
            <Space>
              <Upload {...props}>
                <Button loading={loading}>Thay ảnh</Button>
              </Upload>
              <Button
                type="text"
                danger
                disabled={loading}
                onClick={() => onChange?.(null)}
              >
                Bỏ ảnh
              </Button>
            </Space>
          </>
        ) : (
          <Upload.Dragger {...props}>
            <div className="catalog-upload-content">
              {loading ? <Spin /> : <PlusOutlined />}
              <strong>Tải ảnh {label}</strong>
              <small>PNG, JPG, WebP · Tối đa 5 MB</small>
            </div>
          </Upload.Dragger>
        )}
      </div>
    );
  return (
    <Space wrap>
      <CatalogImage value={value} size={100} />
      <Upload {...props}>
        <Button icon={<UploadOutlined />} loading={loading}>
          Tải ảnh {label}
        </Button>
      </Upload>
      {value && (
        <Button disabled={loading} onClick={() => onChange?.(null)}>
          Bỏ ảnh
        </Button>
      )}
    </Space>
  );
}
