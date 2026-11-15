# Sửa lỗi PostgreSQL 42P01: ledger_customer_layout

## Nguyên nhân gốc đã xác minh
Backend và migration runner cùng dùng DATABASE_URL từ .env: localhost:5433, database factory_management, NODE_ENV=development. Kết nối thực xác nhận current_schema=public, search_path="$user", public. information_schema không có ledger_customer_layout ở bất kỳ schema nào. public.factory_sql_migrations tồn tại nhưng chưa có bản ghi 20261028_ledger_customer_layout. Migration được tạo ở lần triển khai trước nhưng chưa được chạy; không phải sai database hoặc bảng nằm ở schema khác.

## Xử lý
Đã chạy migration hiện có `migrations/sql/20261028_ledger_customer_layout.sql` bằng runner checksum/transaction sẵn có. Không sửa SQL migration đã áp dụng, không tạo migration trùng. Bảng public.ledger_customer_layout có id boolean (singleton true), revision bigint, items JSONB. Mảng items lưu ID và is_visible_in_ledger; display_order là vị trí 1-based của ID trong mảng.

Thêm npm script để dễ tìm và chạy:

```powershell
cd C:\Users\QuangPham\Desktop\factory-management\backend
npm run ledger:migrate-layout
```

Lệnh tương đương đã chạy: `node scripts/migrate-ledger-customer-layout.mjs --local`. Chạy lại xác nhận "already applied". Runner giới hạn localhost, ngoài production; không chạy trên production trong lần xử lý này.

## Các tệp thay đổi
- src/customer-ledger/ledger-layout.service.ts: định danh public rõ ràng theo schema đã xác minh; LEFT JOIN từ customers để khách không có cấu hình vẫn hiện; revision mặc định 0 khi không có dòng singleton; INSERT singleton ON CONFLICT DO NOTHING trong transaction lưu trước khi khóa dòng. Không catch/fallback lỗi 42P01: thiếu bảng vẫn báo lỗi migration.
- src/customer-ledger/ledger-layout.spec.ts: cập nhật kiểm tra transaction, bổ sung cấu hình không có khách/singleton, giữ revision khi không có khách, không che lỗi 42P01.
- package.json: thêm ledger:migrate-layout.
- scripts/check-ledger-customer-layout.mjs: kiểm thử development trực tiếp, rollback các thay đổi cấu hình bằng transaction/savepoint; so sánh fingerprint lịch sử giao dịch.
- docs/LEDGER-CUSTOMER-LAYOUT.md: cập nhật trạng thái migration.
- docs/LEDGER-CUSTOMER-LAYOUT-42P01.md: báo cáo này.

## Kết quả
- Backend build/typecheck đạt.
- Backend lint không lỗi; một cảnh báo user_id có sẵn ở quick-entry.service.ts.
- 16/16 test liên quan trong ledger-layout.spec.ts và ledger-read.spec.ts đạt.
- Database integration: 10 kiểm tra đạt với 20 khách hàng, 26 dòng customers_ledger. Service summary chạy được trên database thật; đổi thứ tự rồi đọc lại; summary áp dụng thứ tự; ẩn và hiện lại; thống kê không đổi khi ẩn; khách thiếu cấu hình được hiện và xếp cuối; items=[] trả toàn bộ khách hiện; cấu hình thử nghiệm rollback về đúng bản đầu; fingerprint toàn bộ dòng lịch sử giao dịch trước/sau không đổi.
- Không DROP/TRUNCATE/DELETE/reset, không synchronize schema tự động, không sửa bản ghi công nợ hoặc lịch sử giao dịch. Migration chỉ thêm cấu hình và bản ghi theo dõi migration.

Chưa kiểm thử thao tác chuột/cảm ứng trong browser, reload trình duyệt hoặc HTTP có phiên đăng nhập. Đọc lại bằng service trên database đã kiểm chứng độ bền trong transaction thử nghiệm; thay đổi thử nghiệm được rollback có chủ đích để bảo toàn cấu hình người dùng. Backend đang chạy cần nạp mã mới (development watch tự nạp; nếu chạy dist cần restart theo quy trình hiện tại).
