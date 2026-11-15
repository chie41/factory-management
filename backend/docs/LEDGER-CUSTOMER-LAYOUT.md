# Sắp xếp và ẩn/hiện khách hàng trong sổ giao dịch

## Thay đổi
- Frontend: `src/features/customer-ledger/components/LedgerCustomerLayout.tsx` (mới), `CustomerLedgerSummary.tsx`, `CustomerLedgerSummaryTable.tsx`, `types/ledger.ts`, `styles/customer-ledger.css`, `package.json`, `package-lock.json`.
- Backend: `src/customer-ledger/ledger-layout.service.ts` (mới), `ledger-layout.spec.ts` (mới), `ledger-read.spec.ts`, `customer-ledger.controller.ts`, `customer-ledger.service.ts`, `customer-ledger.module.ts`.
- Migration: `migrations/sql/20261028_ledger_customer_layout.sql`; runner `scripts/migrate-ledger-customer-layout.mjs` (mới).
- Thư viện mới: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities.

## Lưu cấu hình
Bảng riêng `ledger_customer_layout` có một dòng cấu hình chung cho database xưởng hiện tại: `items` JSONB lưu ID theo thứ tự và `is_visible_in_ledger`, `revision` chống ghi đè. `display_order` là vị trí 1-based trong mảng, không có số thứ tự trùng. API GET/PATCH `/customer-ledger/customer-layout`; đọc cần `customer_ledger.read`, sửa cần `customer_ledger.update`.

PATCH khóa dòng FOR UPDATE, so sánh revision và tập ID đầy đủ, từ chối ID trùng/thiếu/lạ hoặc tập khách hàng đã thay đổi. Một UPDATE lưu cả thứ tự và ẩn/hiện trong transaction; lỗi rollback. Xung đột HTTP 409 giữ bản nháp để người dùng xem lại; đóng/mở lại để lấy phiên bản mới. Không tự ghi đè hay hợp nhất âm thầm.

Khách mới chưa có trong cấu hình được hiện mặc định và xếp cuối theo created_at/id. Khách được bật lại giữ vị trí trong mảng. Chỉ danh sách tổng hợp sổ áp dụng ẩn; sổ chi tiết, đơn hàng và báo cáo không đổi. Thống kê được tính trên tập lọc cũ trước khi ẩn và phân trang để giữ nguyên ý nghĩa. Không ghi dữ liệu giao dịch, số dư hoặc trạng thái hoạt động.

Danh sách quản lý tải toàn bộ khách chưa xóa, không có phân trang. Tìm kiếm và tùy chọn hiện khách ẩn chỉ quyết định dòng render; kéo thả luôn thay đổi mảng đầy đủ. STT là thứ tự chung nên có thể ngắt quãng khi lọc/ẩn. Hủy và rời trang có xác nhận khi có thay đổi; tải lại/đóng cửa sổ có beforeunload. Lưu lỗi giữ nháp, lưu thành công mới đóng; chặn request trùng bằng ref.

## Migration
Migration đã được áp dụng trên database development `factory_management` tại `localhost:5433` khi xử lý lỗi 42P01; chưa chạy trên production. Runner chỉ cho phép localhost với `--local`, ngoài production, có checksum và transaction theo cơ chế sẵn có:

`node scripts/migrate-ledger-customer-layout.mjs --local`

Triển khai migration trước backend mới. Dữ liệu cũ được chụp theo truy vấn customers chưa ORDER BY như API cũ. API cũ không có thứ tự đảm bảo nên không thể cam kết tái tạo một thứ tự lịch sử giữa các lần quét; từ sau migration thứ tự được cố định. Không xóa/reset dữ liệu khách hàng hoặc giao dịch. Mỗi database hiện tương ứng một xưởng; nếu bổ sung nhiều xưởng chung database phải thêm workshop_id và phạm vi tenant.

## Kiểm tra
- Frontend build/typecheck đạt; 25/25 bài test hiện có đạt.
- Backend build đạt; lint không lỗi, một cảnh báo user_id không dùng tại quick-entry.service.ts có sẵn.
- Test mới: lưu nguyên khối đổi thứ tự + ẩn/hiện, row lock, revision cũ, ID trùng/thiếu/lạ, lỗi ghi rollback và release client.
- Test projection: thứ tự toàn bộ trước phân trang, ẩn khách có nợ vẫn giữ thống kê và số dư sổ chi tiết. Chạy cùng ledger-read.spec.ts.
- Full backend test còn các smoke test thiếu provider NestJS (PrismaService/JwtService/RbacService), ngoài phạm vi tính năng.
- Full frontend lint còn lỗi có sẵn tại CatalogImage.tsx và DailyGoldReport.tsx; các tệp sửa mới kiểm tra riêng.

## Cần kiểm thử chấp nhận trên môi trường thử nghiệm
Đã có database integration cho cấu hình và summary (xem LEDGER-CUSTOMER-LAYOUT-42P01.md); chưa chạy browser E2E. Cần kiểm chứng: kéo cuối lên đầu/đầu xuống cuối/nhiều lần liên tiếp; Hủy; lưu rồi reload/đăng nhập/thiết bị khác; ẩn và hiện lại khách có nợ; tìm kiếm/lọc sau lưu; danh sách lớn; API lỗi giữ nháp; tài khoản thiếu quyền; cảm ứng và tự cuộn; thêm khách mới; hai phiên quản lý đồng thời. Các trường hợp transaction và projection đã có unit test nhưng chưa thay thế kiểm chứng thực tế này. Danh sách quản lý render toàn bộ, chưa virtualize nên cần đo trên quy mô dữ liệu thực.

## Thứ tự Sổ nợ vàng
Sổ nợ vàng (daily-gold) dùng vị trí trong cùng ledger_customer_layout.items, khách chưa có cấu hình được xếp cuối theo created_at/id giống bảng Tổng hợp. Áp dụng cho cả chế độ all/debt và bản in dùng cùng dữ liệu. Thay đổi này chỉ đồng bộ thứ tự; giữ quy tắc hiển thị khách và tính tổng của báo cáo hiện tại. Sau khi lưu sắp xếp, frontend invalidates cả summary và daily-gold để báo cáo lấy lại thứ tự mới.

Tệp thay đổi: monthly-balance.service.ts, LedgerCustomerLayout.tsx, scripts/check-ledger-customer-layout.mjs. Không thêm dependency hoặc migration. Kiểm thử PostgreSQL development đạt 13 kiểm tra, bao gồm đảo thứ tự báo cáo all/debt, cấu hình trống, đối chiếu từng dòng và tổng cộng không đổi. Toàn bộ thay đổi cấu hình thử nghiệm rollback; fingerprint 26 dòng lịch sử giao dịch không đổi.
