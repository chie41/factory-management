# Phiếu giao hàng và nhập giao dịch nhanh

## 1. Chức năng

Tại **Sổ giao dịch khách hàng → Tổng hợp → Thêm giao dịch**, mở modal Nhập giao dịch nhanh với một phiếu trống. Mỗi phiếu có khách hàng, loại giao dịch, ngày và nhân viên thực hiện riêng. Phiếu tiếp theo chỉ kế thừa khách hàng/ngày/nhân viên; có thể mở lại phiếu cũ, sao chép và hoàn tác xóa dòng.

Nhập nhanh hỗ trợ Giao hàng, Khách trả vàng, Khách trả vàng hồi, Trả vàng khách. Trong sổ riêng có thêm Trả hàng và khóa sẵn khách hàng. Không có loại Thu công.

Phiếu giao hỗ trợ nhiều dòng mẫu mã, kể cả lặp mẫu; trọng lượng và giá công thực tế được nhập riêng, không cập nhật master. Đơn nguồn là tùy chọn: chỉ chọn đơn thực tế đã phân chuyến, chưa có phiếu giao và có liên kết mẫu mã. Dòng của đơn nguồn được giữ theo dữ liệu đơn, không sửa ngầm đơn hoặc tạo đơn giả.

Phiếu giao trực tiếp chưa duyệt/đánh dấu sai có thể sửa và gửi duyệt lại trên cùng ledger ID. Dòng cũ được lưu với `superseded_at`, khoản thu cũ được VOID, và audit giữ trước/sau. Phiếu đã duyệt không được sửa đè. Trả hàng dùng dòng nguồn của cả phiếu theo đơn và phiếu trực tiếp mới; phiếu trực tiếp cũ chỉ có tổng số, không có dòng, không được tự suy diễn hàng trả.

## 2. File chính

- Backend: `src/customer-ledger/workflow/quick-entry.dto.ts`, `quick-entry.controller.ts`, `quick-entry.service.ts`.
- Tích hợp: `ledger-workflow.service.ts`, `workflow.dto.ts`, `customer-ledger.service.ts`, `customer-ledger.module.ts`.
- Frontend: `features/customer-ledger/components/QuickTransactionsModal.tsx`, `quick-transactions.css`, `CustomerLedger.tsx`, `LedgerWorkflowPanel.tsx`, `WorkflowMoneyForms.tsx`.
- Hàm thuần: `features/customer-ledger/utils/quickEntryDraft.ts`, `applicationDate.ts`; dùng chung cho sổ riêng và tổng hợp.
- Kiểm thử: `quick-entry.spec.ts`, `ledger-read.spec.ts`, `scripts/check-quick-ledger.mjs`, `frontend/architecture.test.mjs`.

## 3. Migration

Đã áp dụng trên PostgreSQL **localhost**, theo thứ tự:

1. `20261016_quick_ledger_entries.sql`: cho phép dòng hàng thuộc đơn hoặc phiếu giao trực tiếp; bảng idempotency lô; nhân viên thực hiện và người thu/ghi chú khoản thu; trả hàng không bắt buộc order ID.
2. `20261016_ledger_line_revisions.sql`: giữ phiên bản dòng phiếu khi gửi duyệt lại.
3. `20261016_return_transaction_employee.sql`: lưu nhân viên thực hiện trả hàng độc lập với người nhập/người duyệt.

Runner tương ứng trong `scripts/migrate-*.mjs` chỉ chấp nhận `--local`, kiểm tra checksum, chạy trong transaction. Không chỉnh migration đã áp dụng, không xóa dữ liệu lịch sử. Môi trường khác cần chạy ba SQL migration trước khi triển khai code; chưa chạy migration production.

## 4. API và phân quyền

Prefix `/api/v1`:

| API | Nội dung |
|---|---|
| GET `/customer-ledger/quick-entries/options?kind=customers\|employees\|models&q=...` | Mã/tên thật, tìm không dấu; mẫu ACTIVE; chỉ dữ liệu cần cho nhập phiếu |
| POST `/customer-ledger/quick-entries` | `{ request_id, entries: [...] }`, tối đa 100 phiếu, mỗi phiếu tối đa 100 dòng |
| POST `/customer-ledger/quick-entries/:id/resubmit` | Một phiếu trực tiếp, kèm version hiện tại; giữ nguyên ledger ID và khách hàng |

Mỗi phiếu có UUID request riêng, customer/employee UUID thật, `occurred_at` có múi giờ; dòng gồm design model ID, số lượng nguyên, trọng lượng và giá công dạng chuỗi decimal. Khoản thu có request UUID, nguyên tệ, ngày thu, người thu riêng. Backend tự tính tổng và ngày nghiệp vụ theo Asia/Ho_Chi_Minh.

Quyền: `customer_ledger.create`; kèm thu cần `customer_ledger.collect`; sửa cần thêm `customer_ledger.update`; dùng đơn nguồn cần `delivery.report` và kiểm tra phân công hiện có. Duyệt/hoàn tiền dùng các quyền kế toán hiện có. Kiểm tra lại tài khoản ACTIVE và quyền trong transaction. Không gán quyền mới cho nhân viên.

Lô lưu toàn bộ hoặc rollback toàn bộ. Khóa workflow và khóa khách hàng theo thứ tự cố định. Cùng UUID lô, người nhập và nội dung trả lại kết quả đã lưu; nội dung khác bị từ chối. UUID từng phiếu/khoản thu không được tái sử dụng trong lô khác. Lỗi trả chỉ số phiếu và nhóm trường, frontend giữ nguyên dữ liệu nhập. Chặn nhấn lưu liên tiếp trong cùng modal.

## 5. Bàn phím

| Phím | Hành vi |
|---|---|
| GH / TV / VH / VK | Tìm loại giao dịch tương ứng |
| Tab / Shift+Tab | Trường tiếp/trước |
| Enter | Xác nhận lựa chọn/ô; ô giá cuối dòng hợp lệ tạo dòng kế tiếp và focus mẫu mã |
| ↑ / ↓ | Chọn gợi ý autocomplete |
| F2 / Esc | Sửa/chọn nội dung ô; hủy sửa ô hoặc đóng popup |
| Ctrl+; | Điền hôm nay, chỉ trong trường ngày; múi giờ ứng dụng |
| Ctrl+↓ | Sang phiếu tiếp; nếu đang cuối, kiểm tra rồi tạo phiếu mới |
| Ctrl+D | Sao chép dòng khi trong bảng; sao chép phiếu khi ngoài bảng |
| Ctrl+Delete | Xóa dòng hiện tại, có thể hoàn tác |
| Ctrl+Z | Undo native trong ô văn bản; undo cấu trúc khi focus vùng phiếu |
| Ctrl+Enter | Kiểm tra và lưu toàn bộ, kể cả khi focus footer |

Dòng trống hoàn toàn vừa tạo bởi Enter là chỗ nhập tiếp, không gửi lên backend. Dòng nhập dở phải sửa hoặc xóa. Enter chọn autocomplete không tạo dòng mới; không xử lý phím khi IME đang ghép chữ. Nút Hoàn tác luôn có thể phục hồi thay đổi cấu trúc. Đóng modal hoặc rời trang có dữ liệu chưa lưu sẽ cảnh báo. Không lưu draft vào database.

## 6. Công nợ và Thu/Chi

Tiền công = số lượng × trọng lượng × giá công / 15; mỗi dòng làm tròn một lần ở 4 số lẻ, sau đó cộng và áp dụng giảm giá. Tính bằng BigInt/decimal, lưu numeric(20,4); hiển thị vàng 2 số lẻ, tiền nguyên dạng `10.000B`. Vàng hồi lưu trọng lượng thực, tuổi vàng %, kết quả chính xác 10 số lẻ và kết quả làm tròn 4 số lẻ.

Phiếu giao và khoản thu kèm theo đều **PENDING**. Lưu không tạo Thu/Chi. Kế toán duyệt mới ghi một dòng thu duy nhất, giữ nguyên số tiền/đồng tiền/ngày/người thu thực tế. Ngoại tệ cần tỷ giá xác nhận tại bước duyệt; chặn tỷ giá sai và thu vượt. Sửa tỷ giá không sửa dòng tiền nguyên tệ đã hạch toán. Thu bổ sung vẫn chờ duyệt.

Tịnh vàng chính thức giữ quy tắc đã chốt: tính giao chờ duyệt, loại phiếu sai. Khách trả hàng lấy số lượng/trọng lượng/tiền công từ dòng đã giao, kiểm tra phần chưa trả và phân bổ giảm giá theo cơ chế hiện có. Kế toán nhập tổng tiền hoàn và đồng tiền/tỷ giá; không ép phân bổ khoản hoàn theo dòng. Ghi vàng và chi hoàn trong cùng transaction khi duyệt.

`created_by` là tài khoản nhập; `transaction_employee_id` là nhân viên thực hiện; người thu và người duyệt lưu riêng. Sổ/chi tiết hiển thị người giao dịch và người nhập riêng.

## 7. Kiểm tra

- Frontend build/typecheck/lint: qua. `npm test`: **17/17 qua**, gồm precision, kế thừa, placeholder Enter, loại giao dịch, ngày và hồi quy hiện có.
- Backend build/lint: qua. Hai bộ test sổ đọc và nhập nhanh: **12/12 qua**.
- Toàn bộ Vitest backend: **16 qua, 9 lỗi, 1 bỏ qua**. Chín lỗi là test scaffold cũ `should be defined`/`Hello World!` chưa khai báo PrismaService, RbacService hoặc JwtService trong TestingModule. Không đổi runtime để né các lỗi này.
- `node scripts/check-quick-ledger.mjs --local`: **46 assertions qua**. PostgreSQL thật, RBAC thật, transaction ngoài luôn rollback; không giữ lại dữ liệu tài chính hoặc catalog thử.
- Tích hợp đã kiểm tra: nhiều loại/nhiều khách, lô lỗi, lỗi trước commit và retry, quyền thiếu, không hạch toán sớm, duyệt lặp, tiền BAHT/KIP/VND, ngày thu độc lập, sửa tỷ giá, trả/hoàn tiền, chặn trả vượt, sửa phiếu sai giữ lịch sử và chọn đơn/chuyến nguồn thật.
- Trình duyệt đã kiểm tra: focus đầu form, viết tắt, tìm không dấu, Ctrl+; không thay ô trọng lượng, kế thừa/thu gọn/mở lại, F2/Esc, Ctrl+D/xóa/undo dòng và Ctrl+Enter báo phiếu lỗi từ footer. Không lưu phiếu tài chính mẫu bằng UI.

## 8. Phần tùy chọn và giới hạn

Dán nhiều ô từ Excel chưa triển khai, theo nhánh ưu tiên keyboard-first được cho phép trong mục 20 của yêu cầu. Có thể nhập số theo định dạng Việt Nam và sao chép dòng/phiếu bằng bàn phím. Bản nháp sống trong modal và được giữ khi API lỗi/đổi loại/thu gọn; không tự phục hồi sau khi đã xác nhận đóng hoặc tải lại trang.

Cần sửa riêng chín test scaffold cũ để toàn bộ suite backend xanh. Frontend build vẫn có cảnh báo bundle lớn hiện có. Giao diện dùng bảng/khối tổng theo frame Figma `179556:720`, không tạo thêm trang đơn hàng.
