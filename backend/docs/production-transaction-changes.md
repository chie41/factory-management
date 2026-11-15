# Sửa / hủy giao dịch sản xuất — 2026-10-29

## Chức năng

Trong Chi tiết nhân viên → Lịch sử giao dịch, thêm cột Thao tác với menu dấu ba chấm: Sửa giao dịch / Hủy giao dịch. Không thêm dãy nút dưới bảng.

- Sửa: modal điền giá trị hiện tại, chỉ hiện các nhóm dữ liệu thuộc nghiệp vụ đó, bắt buộc lý do sửa. Số SP/đơn giá/tiền công vẫn đồng bộ hai chiều và dùng quy tắc HALF_UP số nguyên; vàng hiển thị hai số lẻ.
- Hủy: modal xác nhận hiển thị loại giao dịch, nhân viên, ngày giờ, SP, vàng và tiền công; lý do hủy bắt buộc. Nghiệp vụ việc + vàng được xử lý cùng nhau.
- Giao dịch đã hủy vẫn hiển thị giá trị trước lúc hủy, tag Đã hủy, hàng mờ và không có menu sửa/hủy lại.
- Ghi chú hiển thị người, thời gian, lý do của lần thay đổi mới nhất. Xem lịch sử mở toàn bộ dữ liệu trước/sau, người, thời gian và lý do của từng lần sửa/hủy.
- Sau lưu, invalidate/refetch các query lô, execution, danh sách lô và audit hiện có, cập nhật số liệu mà không yêu cầu tải lại trang.

Giữ các nghiệp vụ điều chỉnh không thuộc phạm vi (nguyên liệu khác/chuyển nội bộ và tiền công thực tế) qua menu riêng của chúng; không đưa chúng vào cơ chế sửa/hủy mới.

## API

Thêm:
- `POST /api/v1/production-batches/:id/execution/transactions/:transactionId/edit`
- `POST /api/v1/production-batches/:id/execution/transactions/:transactionId/void`

Cả hai nhận `request_id`, `version` lô, `transaction_version` và `reason`. Edit nhận các trường thay đổi phù hợp: `quantity`, `gold_weight_g`, `completed_quantity`, `labor_rate_per_15g`, `currency`, `planned_labor`, `pricing_mode`.

Quyền chính `production.adjustments.manage`, đồng thời kiểm tra assignments/materials/output tùy các phần liên quan. Sản lượng chỉ yêu cầu quyền output khi nghiệp vụ có sản lượng hoặc đang thêm sản lượng.

GET execution bổ sung `transactions`, gồm ID logic ổn định, trạng thái hiệu lực, phiên bản, dữ liệu hiện tại, lịch sử thay đổi và lý do bị chặn. Bản ghi vật lý tạo bởi điều chỉnh có flag để không xuất hiện thành giao dịch chính độc lập gây đếm/hiển thị trùng.

## Lưu trữ và tổng hợp

Không UPDATE/DELETE các bản ghi giao việc, giao nhận hay sản lượng gốc bất biến.

- `batch_transaction_changes`: append-only, liên kết ID nghiệp vụ/nhân viên, action EDIT/VOID, before/after JSONB, reason, actor và thời gian.
- Vàng: thêm bút toán đảo bản ghi vật lý hiện hành, sau đó thêm bản ghi thay thế nếu còn vàng. Nếu hủy chỉ thêm bút toán đảo. Những bút toán này và thay đổi khác nằm cùng transaction.
- `batch_output_adjustments`: append-only, lưu chênh lệch sản lượng gắn phiếu gốc và change ID. View `batch_effective_output_contributions` cung cấp sản lượng hiệu lực cho các truy vấn quota, đối soát, hoàn thành công đoạn và read execution.
- Số SP phân công và projection sản lượng công đoạn được cập nhật cùng transaction.
- Tiền công: trừ đúng snapshot của lượt đang sửa/hủy, cộng số tiền mới đã xác nhận, giữ tổng tách riêng từng tiền tệ. Không tính lại các lượt cũ theo giá cuối; không sửa bút toán lương thực tế. Sau hủy lượt mới nhất, đơn giá mặc định quay về lượt còn hiệu lực gần nhất, hoặc snapshot công đoạn nếu không còn lượt nào.
- Tất cả vẫn đi qua transaction/advisory lock, batch optimistic version, phiên bản nghiệp vụ và idempotency ledger đang có. Audit cấp lô ghi trước/sau của thao tác. Mọi thất bại rollback toàn bộ.
- Không thay đổi trạng thái hoàn thành công đoạn hoặc tự khóa lại dependency. Workflow snapshot giữ nguyên.

## Ràng buộc chặn sửa/hủy

- Lô đã đóng hoặc giao dịch đã hủy / phiên bản cũ.
- Đối soát CLOSED: cần quản lý mở lại bằng nghiệp vụ hiện có với lý do.
- Đã có bút toán tiền công thực tế của nhân viên/công đoạn: chưa có cơ chế đảo lương liên kết đầy đủ, chặn để tránh chỉ đổi số tổng mà bỏ nguyên sổ.
- Vàng có `confirmed_by` hoặc đã đảo qua đường cũ mà chưa xử lý chuỗi.
- Sản lượng sau sửa vượt quota, vượt số giao cho thợ, âm hoặc vượt sản lượng lô.
- Kiểm tra toàn chuỗi logic tại các thời điểm nghiệp vụ gốc: không để bất kỳ lần nhận SP nào vượt phân công tại thời điểm đó; không tăng chênh lệch vàng nhận vượt vàng giao. Chênh lệch Heo đã tồn tại không bị tự đổi thành Hao hoặc tự chốt.
- Không giảm sản lượng của công đoạn đã COMPLETED hoặc đã có công đoạn phụ thuộc bắt đầu; giải thích cần xử lý nghiệp vụ phụ thuộc trước, không tự chuyển trạng thái.
- Chỉ bổ sung sản lượng khi công đoạn IN_PROGRESS.
- Phiếu sản lượng nhiều người đóng góp, nhóm nhiều bút toán, chuyển nội bộ, lượt điều chỉnh không phải lượt giao độc lập và dữ liệu cũ thiếu snapshot giá/trọng lượng: cần nghiệp vụ riêng, chặn thay vì đoán.
- Nếu phía sau có điều chỉnh tổng phân công SET cũ, chặn thay đổi số SP của lượt trước đó vì chưa có quy tắc diễn giải lại các tổng tuyệt đối.
- Giao dịch rỗng sau sửa: yêu cầu dùng Hủy.

API đảo vàng cũ vẫn giữ cho nghiệp vụ khác nhưng chặn việc đảo riêng một phần giao dịch thuộc cơ chế mới; yêu cầu dùng Sửa/Hủy giao dịch để đảm bảo nhất quán.

## File

Backend:
- `backend/src/production/execution-transactions.ts` (mới): chuẩn hóa nghiệp vụ và lịch sử, kiểm tra chuỗi.
- `backend/src/production/execution.service.ts`: sửa/hủy, bút toán đảo, projection, read và guards.
- `backend/src/production/execution.dto.ts`: TransactionChangeDto.
- `backend/src/production/execution.controller.ts`: hai endpoint.

Frontend:
- `frontend/src/features/production/TransactionChangeForm.tsx` (mới).
- `frontend/src/features/production/StageOperations.tsx`.
- `frontend/src/features/production/ExecutionForm.tsx`.
- `frontend/src/features/production/executionApi.ts`.

Migration/runner:
- `backend/migrations/sql/20261029_production_transaction_changes.sql`.
- `backend/scripts/migrate-production-transaction-changes.mjs`.

Đã áp dụng migration thành công trên PostgreSQL local. Bảng cũ và lịch sử gốc được giữ nguyên; bảng mới có trigger cấm sửa/xóa. Runner có transaction, checksum và giới hạn môi trường localhost giống các migration trước.

## Kiểm tra

- Backend npm run build: thành công.
- Frontend npm run build (tsc -b + Vite): thành công; còn cảnh báo chunk >500 kB.
- Không viết/chạy automated tests, không tạo dữ liệu demo.
- Chưa kiểm tra thao tác lưu bằng trình duyệt. Không tự khởi động lại backend sau yêu cầu tắt cổng 3000 trước đó; cần nạp bản build mới để dùng các endpoint mới.
