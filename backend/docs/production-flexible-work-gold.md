# Modal Giao việc / Giao vàng — 2026-10-29

Tài liệu này thay thế các mô tả read-only và chỉ hỗ trợ THB của lần triển khai trước.

## Nghiệp vụ và giao diện

- Sửa trực tiếp `CombinedGoldForm`, giữ màn hình hiện tại. Modal Giao/nhận vàng còn hai chế độ giao bổ sung/nhận và sản lượng khi nhận; không có trường đơn giá ở modal đó.
- Một thao tác có thể chỉ giao vàng, chỉ giao sản phẩm hoặc cả hai. Không lưu khi cả vàng và số SP đều bằng 0.
- Lần đầu chỉ giao vàng: tạo hồ sơ người nhận trong bảng phân công với `planned_quantity=0`; không thêm sự kiện giao sản phẩm, không phát sinh tiền công. Những lần sau chỉ giao vàng không sửa số SP, đơn giá hoặc lịch sử tiền công.
- Dòng tóm tắt hiển thị SP đã giao/xong và vàng đã giao/nhận. Các hàng vàng/số SP và đơn giá/tiền tệ dùng Grid, tự xếp một cột trên viewport nhỏ. Vàng luôn hiển thị hai số lẻ sau khi kết thúc nhập.

## 1. Kế thừa đơn giá

Ưu tiên `assignment.applied_rate` và `applied_currency` của thợ/công đoạn; nếu chưa có thì dùng đơn giá snapshot công đoạn và tiền tệ mặc định trả từ API. Đơn giá workflow trước đây đã có quy ước THB, vì vậy dữ liệu lịch sử không có metadata tiền tệ tiếp tục được hiểu là THB. Không gán giá trị mẫu từ Figma, không suy đoán trọng lượng chuẩn và không chuyển đổi tiền tệ.

Thay đổi giá hoặc tiền tệ chỉ áp dụng cho sản lượng giao thêm trong lần đang xác nhận. Giao vàng với 0 SP giữ nguyên đơn giá hiện hành và không lưu một lần điều chỉnh giá riêng.

## 2. Số lượng gợi ý

`floor(vàng của lần đang nhập / trọng lượng chuẩn một SP của lô)`, chặn trên bởi quota còn có thể phân công. Dùng BigInt theo đơn vị 1/10000 gram; chỉ đổi kết quả đếm sang Number sau khi đã giới hạn bằng quota integer.

Ban đầu số SP bằng 0. Khi vàng thay đổi, số SP được đề xuất vào form nếu chưa sửa tay. Sau khi sửa tay (kể cả nhập 0), cờ riêng giữ nguyên số lượng qua các lần render, đổi giá và đổi vàng. Nút Tính lại chủ động lấy lại đề xuất và cho phép tự đề xuất ở các lần thay đổi vàng tiếp theo. Không có ghi API trước khi người dùng xác nhận. Không sử dụng vàng tích lũy.

Thiếu trọng lượng chuẩn: không gợi ý, vẫn cho nhập số SP thủ công và vẫn cho giao vàng với 0 SP; không xác nhận giao SP dương khi chưa đủ cơ sở tính công.

## 3. Đồng bộ tiền công và đơn giá

- Sửa số SP/đơn giá/chọn nhân viên: tính thuận từ trọng lượng chuẩn một SP × số SP giao thêm × đơn giá / 15.
- Sửa tiền công: tính ngược đơn giá = tiền công × 15 / (trọng lượng chuẩn × số SP).
- `pricing_mode=RATE|AMOUNT` phân biệt nguồn tính, tránh tính thuận lại làm mất số tiền người dùng xác nhận sau khi đơn giá nghịch đã được làm tròn.
- Form cập nhật bằng các event, `setFieldValue` không kích hoạt `onValuesChange`, không có effect cập nhật qua lại. Đổi vàng mà không đổi SP không làm tính lại số tiền đang chỉnh tay.
- Với 0 SP: số tiền bằng 0, ô tiền công bị vô hiệu hóa, không chia ngược, không cập nhật đơn giá hiện hành.

Theo quy tắc người dùng đã xác nhận: tiền dự kiến/thực tế mới ghi nhận làm tròn HALF_UP về số nguyên cho THB/VND/LAK; đơn giá tối đa bốn số lẻ. Tính bằng fixed-point BigInt/NUMERIC, không dùng floating point cho tiền. Backend tự kiểm tra và tính lại, không tin tiền client khi ở chế độ RATE. Chế độ AMOUNT lưu đúng số tiền nguyên xác nhận và đơn giá nghịch bốn số lẻ.

## 4. Tiền tệ và snapshot

API hiện có `POST /api/v1/production-batches/:id/execution/stages/:stepId/work-gold` nhận quantity >= 0, rate tùy chọn nếu chỉ vàng; bổ sung `currency`, `planned_labor`, `pricing_mode`.

Mỗi lần giao SP lưu trong `batch_assignment_events.after_state.labor_grant` bất biến:
- quantity_delta, standard_weight_per_unit_g, rate_per_15g;
- currency, planned_labor_delta (số tiền xác nhận của lần này), pricing_mode;
- labor_totals: tổng riêng từng tiền tệ; mixed_rates phục vụ bảo vệ điều chỉnh cũ.

API read trả `planned_labor_by_currency` và `applied_currency`. Dòng thợ, chi tiết thợ, tổng công đoạn và tổng lô đều hiển thị riêng từng loại tiền. Scalar `planned_labor` chỉ có giá trị khi đúng một tiền tệ. Không cộng THB, VND và LAK chung; không tự quy đổi.

Các snapshot cũ được đọc theo running total cũ, không nhân lại toàn bộ SP bằng giá cuối. Dữ liệu cũ không bị cập nhật hồi tố hoặc đổi tiền tệ. API điều chỉnh SET cũ vẫn bảo vệ việc giảm phân công nhiều mức giá/tiền tệ khi chưa có quy tắc chỉ định lượt giao được giảm. Tiền công thực tế cũ vẫn giữ nguyên lịch sử; các bút toán thực tế mới được làm tròn số nguyên trước khi kiểm tra giới hạn và lưu.

## 5. File thay đổi

Frontend:
- `frontend/src/features/production/CombinedGoldForm.tsx`
- `frontend/src/features/production/grantPlannedLabor.ts`
- `frontend/src/features/production/GoldWeightInput.tsx`
- `frontend/src/features/production/executionApi.ts`
- `frontend/src/features/production/StageOperations.tsx`
- `frontend/src/features/production/ExecutionForm.tsx`
- `frontend/src/pages/ProductionBatchDetailPage.tsx` (chỉ giá trị tổng tiền theo tiền tệ, giữ layout header/timeline/accordion)

Backend:
- `backend/src/production/execution.dto.ts`
- `backend/src/production/execution.service.ts`
- `backend/src/production/grant-pricing.ts` (mới)

Migration và runner:
- `backend/migrations/sql/20261029_production_flexible_issues.sql`
- `backend/scripts/migrate-production-flexible-issues.mjs`

Migration chỉ đổi CHECK của planned_quantity từ >0 sang >=0, giữ NULL và dữ liệu/histories cũ. Tiền tệ/giá từng lượt dùng JSONB snapshot hiện có; không tạo bảng trùng. Runner transaction/checksum/localhost guard giống migration trước. Đã áp dụng thành công trên PostgreSQL local bằng `node scripts/migrate-production-flexible-issues.mjs --local`.

## Kiểm tra

Frontend build (tsc -b + Vite) và backend build thành công. Frontend còn cảnh báo chunk >500 kB. Không viết/chạy automated tests, không thêm dữ liệu minh họa. Chưa kiểm tra lưu thực tế qua trình duyệt; không tự bật lại backend/cổng 3000 sau yêu cầu tắt trước đó.
