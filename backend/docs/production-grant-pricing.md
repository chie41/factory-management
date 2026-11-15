# Tinh gọn công đoạn và đơn giá từng lần giao — 2026-10-29

## Các file thay đổi

Frontend:
- `frontend/src/features/production/StageOperations.tsx`: bỏ thanh thao tác trạng thái cạnh tiêu đề và toàn bộ dãy nút dưới chi tiết nhân viên; chỉ giữ Giao / nhận và Giao việc ở góc phải. Giữ cấu trúc bảng nhân viên, expandable row, lịch sử và các thao tác điều chỉnh nằm trong lịch sử. Ghi chú lịch sử bổ sung đơn giá và tiền công của lần giao khi có snapshot.
- `frontend/src/features/production/CombinedGoldForm.tsx`: thêm đơn giá có thể sửa, mặc định đơn giá hiện hành của phân công hoặc đơn giá công đoạn. Thêm tiền công chỉ đọc cho đúng số lượng đang giao; cập nhật khi chọn nhân viên, nhập số lượng hoặc giá. Thiếu trọng lượng chuẩn của lô thì báo lỗi và không cho xác nhận. Hai hàng hai cột chuyển thành một cột ở viewport nhỏ.
- `frontend/src/features/production/GoldWeightInput.tsx` (mới): InputNumber stringMode, định dạng Việt Nam luôn hai số lẻ sau khi kết thúc nhập; không format lại khi userTyping. Parser giữ giá trị API dạng decimal chuẩn, không gửi dấu phân cách Việt Nam.
- `frontend/src/features/production/grantPlannedLabor.ts` (mới): phép tính BigInt theo đơn vị 1/10000; làm tròn half-up bốn số lẻ tương ứng PostgreSQL NUMERIC. Không tính tiền công bằng Number/floating point.
- `frontend/src/features/production/ExecutionForm.tsx`: tái sử dụng GoldWeightInput cho các ô vàng trong modal giao/nhận/chuyển nguyên liệu cũ. Không thay đổi độ chính xác của các loại nguyên liệu khác.

Backend:
- `backend/src/production/execution.dto.ts`: WorkGoldDto bổ sung decimal string bắt buộc `labor_rate_per_15g`, không âm, tối đa bốn số lẻ.
- `backend/src/production/execution.service.ts`: lưu đơn giá hiện hành và snapshot từng lần giao; truy vấn tổng tiền công theo snapshot thay vì nhân toàn bộ sản lượng với giá lần cuối.

## API và dữ liệu

Mở rộng API hiện có:
`POST /api/v1/production-batches/:id/execution/stages/:stepId/work-gold`

Payload giữ `request_id`, `version`, `employee_id`, `quantity`, `gold_weight_g`, `note`; bổ sung `labor_rate_per_15g` dạng decimal chuẩn, ví dụ `100`.

`gold-receipts` và các endpoint trạng thái, phân công, sản lượng, đối soát, tiền công cũ vẫn được giữ. Không tự bắt đầu công đoạn và không đổi AND-Join khi mở accordion hoặc giao việc.

Giao số lượng, vàng (nếu > 0), đơn giá và snapshot tiền công được lưu trong một transaction có idempotency/version/permission checks hiện hữu.

Không thay đổi schema và không có migration. Bảng `batch_assignment_events` hiện đã có `after_state JSONB` cùng trigger cấm sửa/xóa lịch sử. Mỗi sự kiện mới chứa `labor_grant`:
- `quantity_delta`
- `rate_per_15g`
- `standard_weight_per_unit_g`
- `planned_labor_delta`
- `planned_labor_total`
- `mixed_rates`

Backend dùng PostgreSQL NUMERIC, làm tròn bốn số lẻ cho mỗi lần giao rồi cộng tổng. Trọng lượng chuẩn lấy từ snapshot một sản phẩm của lô; không dùng vàng giao thực tế. Ví dụ 22,50g × 2 SP × 100 / 15 = 300 B. Nếu 4 SP giá 100 rồi 2 SP giá 120 với cùng trọng lượng chuẩn 22,50g, tổng là 600 + 360 = 960 B.

Dữ liệu cũ không bị cập nhật/xóa. Khi chưa có snapshot mới, giữ cách tính cũ theo đơn giá áp dụng của phân công; lần giao mới dùng số tiền cũ làm số dư đầu và cộng riêng tiền công mới. Đơn giá mới không áp ngược cho số lượng cũ. Nếu phân công cũ thiếu dữ liệu để xác định số dư tiền công, backend từ chối giao thêm thay vì tự gán giá mới cho dữ liệu cũ.

API SET cũ vẫn cho điều chỉnh thông tin và số lượng trong trường hợp cùng đơn giá. Khi đã có nhiều đơn giá, giảm số lượng qua SET bị chặn vì chưa có quy tắc chỉ định lần giao cần giảm; không tự chọn FIFO/LIFO hoặc tính lại toàn bộ theo giá mới nhất. Dãy nút này đã được gỡ khỏi giao diện theo đặc tả.

## Kiểm tra

- `backend`: npm run build — thành công.
- `frontend`: npm run build (tsc -b và Vite) — thành công; có cảnh báo chunk lớn hơn 500 kB.
- Không viết hoặc chạy automated tests.
- Không khởi động lại backend/cổng 3000 sau yêu cầu tắt của người dùng. Chưa kiểm tra lưu dữ liệu thực tế bằng trình duyệt trong lần chỉnh sửa này.
