import { useEffect, useState } from "react";
import { Flex, Typography } from "antd";
import type { Batch } from "./api";
const stamp = (value: string) =>
  new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function remaining(milliseconds: number) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60000)),
    days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60),
    rest = minutes % 60;
  return [
    days ? days + " ngày" : "",
    hours ? hours + " giờ" : "",
    rest ? rest + " phút" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
export function BatchTimeline({ batch }: { batch: Batch }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (batch.status === "COMPLETED" || batch.status === "CANCELLED") return;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [batch.status]);
  const start = batch.planned_start_at
      ? Date.parse(batch.planned_start_at)
      : null,
    end = batch.planned_end_at ? Date.parse(batch.planned_end_at) : null;
  const done = batch.status === "COMPLETED",
    cancelled = batch.status === "CANCELLED";
  const at = done && batch.actual_end ? Date.parse(batch.actual_end) : now;
  const percent =
    start != null && end != null && end > start
      ? Math.max(0, Math.min(100, ((at - start) / (end - start)) * 100))
      : null;
  const overdue = !done && !cancelled && end != null && now > end;
  const label = done
    ? "Lô đã hoàn thành"
    : cancelled
      ? "Lô đã hủy"
      : start != null && now < start
        ? "Bắt đầu sau " + remaining(start - now)
        : end != null
          ? overdue
            ? "Quá hạn " + remaining(now - end)
            : "Còn " + remaining(end - now)
          : start != null
            ? "Đã đến thời điểm bắt đầu"
            : "Chưa có kế hoạch thời gian";
  return (
    <section className="production-surface production-timeline">
      <Typography.Text className="production-section-label">
        KẾ HOẠCH SẢN XUẤT
      </Typography.Text>
      <Flex
        align="center"
        justify="space-between"
        wrap
        gap={12}
        style={{ marginTop: 12 }}
      >
        <Typography.Text
          strong
          type={overdue ? "danger" : undefined}
          style={{ fontSize: 18 }}
        >
          {label}
        </Typography.Text>
        <Flex wrap gap={16}>
          <Typography.Text type="secondary">
            {start != null ? "Bắt đầu: " + stamp(batch.planned_start_at!) : ""}
          </Typography.Text>
          <Typography.Text type="secondary">
            {end != null ? "Dự kiến xong: " + stamp(batch.planned_end_at!) : ""}
          </Typography.Text>
        </Flex>
      </Flex>
      {percent != null && (
        <>
          <div
            className="production-time-track"
            role="progressbar"
            aria-label="Tiến độ thời gian kế hoạch"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="production-time-fill"
              style={{ width: percent + "%" }}
            />
            <span
              className="production-time-marker"
              style={{ left: `calc(${percent}% - ${percent * 0.12}px)` }}
            />
            <span className="production-time-end" />
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {done
              ? "Thời gian kế hoạch tại lúc hoàn thành"
              : cancelled
                ? "Kế hoạch đã dừng"
                : start != null && now < start
                  ? "Chưa tới thời điểm bắt đầu"
                  : overdue
                    ? "Đã qua thời điểm hoàn thành dự kiến"
                    : "Tiến độ thời gian kế hoạch · không thay thế sản lượng thực tế"}
          </Typography.Text>
        </>
      )}
    </section>
  );
}
