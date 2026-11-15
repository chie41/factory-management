# Xóa vĩnh viễn giao dịch sản xuất — 2026-10-29

Tài liệu này thay thế hành vi Hủy/Đã hủy của thao tác mới; chức năng sửa vẫn giữ nguyên.

## Giao diện

- Menu ba chấm: Sửa giao dịch / Xóa giao dịch (đỏ).
- Xóa mở Popconfirm, hiển thị loại nghiệp vụ, nhân viên, số SP giao/xong, vàng và tiền công liên quan; nút Xóa đỏ, không có ô nhập lý do.
- Popconfirm giữ snapshot của giao dịch tại lúc mở. Nếu người khác sửa trước khi xác nhận, kiểm tra transaction_version sẽ từ chối xóa phiên bản cũ.
- Sau thành công, invalidate/refetch production-batch, production-batches, production-execution, production-history. Dòng giao dịch biến mất cùng lịch sử điều chỉnh của dòng đó, không cần tải lại trang.
- Lọc các giao dịch cũ có state.voided khỏi bảng mặc định, không render tag Đã hủy hoặc liên kết Xem lịch sử của chúng. Không tự xóa dữ liệu cũ chỉ vì đổi bộ lọc.

## API

Thay endpoint Hủy bằng:
`POST /api/v1/production-batches/:id/execution/transactions/:transactionId/delete`

Body chỉ gồm `request_id`, `version` lô, `transaction_version`; không yêu cầu lý do. Endpoint `/void` đã bỏ. Endpoint `/edit` và các modal giao/nhận khác giữ nguyên.

Dùng quyền `production.adjustments.manage` cùng các quyền assignment/material/output tương ứng với toàn bộ nghiệp vụ. Giữ transaction/advisory lock, optimistic version và idempotency đang có. Xóa kết hợp giao việc + vàng là một thao tác nguyên tử, không cho xóa một phần.

## Xóa dữ liệu thật

Sau khi kiểm tra ràng buộc, xóa vật lý các bản ghi thuộc ID nghiệp vụ:
- Sự kiện giao sản phẩm gốc và các sự kiện điều chỉnh liên quan.
- Vàng gốc, các bút toán đảo/thay thế sinh bởi những lần sửa nghiệp vụ đó.
- Phiếu sản lượng, contribution và các output adjustment liên quan.
- Các bản ghi batch_transaction_changes của nghiệp vụ.

Đồng thời cập nhật quota phân công, projection sản lượng công đoạn và tiền công theo đúng snapshot từng lượt/tiền tệ. Bản ghi nhân viên/phân công dùng chung được giữ để không xóa thông tin các nghiệp vụ khác. Khi cần, lưu checkpoint tổng tiền/quota nội bộ trong lịch sử phân công có transaction_adjustment=true; checkpoint không phải giao dịch vận hành, không có liên kết tới giao dịch đã xóa và không xuất hiện trong bảng.

Không tạo bản ghi VOID cho thao tác mới. Sau xóa, nguồn dữ liệu nghiệp vụ không còn giao dịch đó. Audit cấp lô ghi sự kiện execution.transaction.delete cùng người/thời gian/snapshot và thống kê số dòng đã xóa; audit/idempotency nội bộ tiếp tục được giữ. Không tạo màn hình hoặc bảng vận hành riêng để xem các giao dịch xóa.

## Bảo vệ database

Migration bổ sung production_guard_transaction_delete và thay trigger trên đúng sáu bảng nghiệp vụ liên quan. UPDATE trực tiếp vẫn bị chặn. DELETE chỉ được phép khi ID của từng dòng nằm trong scope đã được service kiểm tra, giới hạn trong transaction hiện tại. Không disable trigger toàn cục, không mở quyền xóa tùy ý với audit, snapshot, lương hay đối soát.

Xóa theo thứ tự xử lý foreign key; lỗi dữ liệu phụ thuộc được trả thành Conflict và rollback toàn bộ, bao gồm cập nhật projection. Không có migration xóa giao dịch thực tế.

## Trường hợp bị chặn

- Lô đã đóng, thiếu quyền hoặc phiên bản dữ liệu cũ.
- Đối soát CLOSED: cần mở lại theo quy trình hiện có.
- Đã có bút toán tiền công thực tế của nhân viên/công đoạn, hoặc phiếu sản lượng có liên kết lương: chưa có cơ chế xóa/đảo sổ lương đồng bộ phù hợp.
- Bút toán vàng được xác nhận riêng; còn bản ghi đảo/tham chiếu từ nghiệp vụ khác.
- Xóa làm hoàn thành vượt phân công, số lượng âm, hoặc làm sai quota/sản lượng công đoạn.
- Chuỗi thời gian có lần nhận SP vượt số giao; vàng nhận vượt vàng giao hoặc chênh lệch không giải trình tăng lên.
- Giảm sản lượng của công đoạn đã hoàn thành hoặc có công đoạn phụ thuộc đã chạy: không tự đổi trạng thái hay khóa lại dependency.
- Phía sau có điều chỉnh tổng phân công SET cũ chưa thể diễn giải lại an toàn.
- Phiếu nhiều người đóng góp, nhóm nhiều bút toán chưa được hỗ trợ, liên kết nguyên liệu ngoài phạm vi vàng, thiếu snapshot tính công hoặc thiếu bản ghi vật lý liên quan.
- Bất kỳ foreign key còn lại: thông báo dữ liệu còn phụ thuộc và rollback toàn bộ.

## Các file thay đổi

Frontend:
- frontend/src/features/production/StageOperations.tsx
- frontend/src/features/production/TransactionChangeForm.tsx
- frontend/src/features/production/ExecutionForm.tsx

Backend:
- backend/src/production/execution-transaction-delete.ts (mới)
- backend/src/production/execution.service.ts
- backend/src/production/execution.controller.ts
- backend/src/production/execution.dto.ts

Migration và runner:
- backend/migrations/sql/20261029_production_transaction_delete.sql
- backend/scripts/migrate-production-transaction-delete.mjs

Đã áp dụng migration thành công trên PostgreSQL local. Không xóa giao dịch nào trong quá trình triển khai hoặc kiểm tra.

## Xác minh

Frontend npm run build (tsc -b + Vite) và backend npm run build thành công. Frontend còn cảnh báo chunk >500 kB. Không viết/chạy automated tests. Chưa thực hiện thao tác xóa dữ liệu thật trên trình duyệt; không tự khởi động lại backend.
