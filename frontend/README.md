# Factory Management Frontend

React 19 + TypeScript + Vite, Ant Design 6, Axios, React Router và TanStack Query. Giữ các lớp `pages`, `features/<domain>/{components,hooks,services,types}`, `components/common`, `components/layout`, `services`, `utils`. Component dựng UI/form; hook giữ trạng thái và query; service chọn endpoint/chuyển contract; type định nghĩa dữ liệu. Backend NestJS + Prisma/PostgreSQL ở ../backend.

## Chạy

Trong backend: `npm install`, cấu hình `.env` theo `.env.example` với DATABASE_URL và JWT_SECRET đã có, rồi `npm run start:dev`. Không chạy seed/migration tự động. Cần tài khoản đã tạo, có các permission customers.*, customer_ledger.*; nhân viên tương lai cần employees.read/create/update cùng quyền payroll.read, supplies.read tương ứng.

Trong frontend: `npm install`, sao chép `.env.example` thành `.env` nếu chưa có, rồi `npm run dev`. Mở http://localhost:5173. API mặc định /api/v1 qua Vite proxy tới localhost:3000. `VITE_API_CONTRACT=current` chạy với backend repository; `documented` dùng Swagger 1.1 đã gửi. Đổi env cần khởi động lại Vite.

Khi cổng 3000 bận: PowerShell backend `$env:PORT='3001'` rồi `node dist/main.js` sau build; PowerShell frontend `$env:API_PROXY_TARGET='http://localhost:3001'` rồi `npm run dev -- --port 5175`. Phiên kiểm tra dùng http://localhost:5175 với backend http://localhost:3001.

Production: `npm run build`; phục vụ dist và reverse proxy /api tới backend. Hash routes /#/employees, /#/customers, /#/ledger/{id} hỗ trợ reload/deep link. Không cần rewrite route ứng dụng. Không đặt secrets vào VITE_* vì các biến này được đưa vào bundle.

## Chức năng

- Nhân viên: danh sách/search/status/phân trang; tạo/sửa hồ sơ; tổng quan và tab công việc/lương/ứng-khấu trừ/vật dụng/lịch sử. Endpoint nối sẵn theo Swagger; backend hiện trả 404.
- Khách hàng: danh sách/search/phân trang, thêm/xem/sửa/xóa mềm, mở sổ từ danh sách hoặc hồ sơ.
- Sổ: tổng hợp, tìm/mở sổ cả khách chưa có giao dịch, chi tiết/phân trang, thêm/xem/sửa/reverse, xuất toàn bộ CSV, in trang hiện tại. Kiểm tra decimal, UUID, ngày giờ, tiền đã trả <= phải trả ở chế độ backend hiện tại; giữ riêng từng tiền tệ và lũy kế từ server.
- Có loading, empty, success, lỗi HTTP/network, retry, xử lý hết hạn phiên. Không có dữ liệu mẫu hoặc đăng nhập giả trong production.

## Kiểm tra

`npm run lint`, `npm run build`, `node --test architecture.test.mjs`.

Smoke API thật: `node scripts/api-smoke.mjs` (mặc định backend cổng 3001, đặt SMOKE_API_URL để đổi). Dùng ADMIN_PASSWORD từ backend/.env, không in credential/token. Thêm `--write` chỉ trong database dev: tạo khách riêng, giao dịch 0, sửa/reverse và xóa mềm khách test. Audit giao dịch reverse vẫn được giữ theo contract.

Ngày 12/10/2026: frontend lint/build và 8 test pass; smoke API thật customers/ledger pass. Trình duyệt kiểm tra login, validation, tạo/sửa/xóa khách hàng, thêm/sửa/reverse giao dịch, khóa sửa sau reverse, responsive. Backend build pass; lint có 2 cảnh báo import có sẵn; 9 unit test backend fail do TestModule chưa cung cấp PrismaService/JwtService.

## Hạn chế / khác thiết kế

CRUD hồ sơ nhân viên đã có BE; các tab công việc/lương/vật dụng/lịch sử vẫn cần BE triển khai: [API response contract](docs/api-read-models.md), [OpenAPI supplement](docs/openapi-read-models.json). Backend mới đã được kiểm tra HTTP chỉ đọc trong lần refactor Customer Ledger; xem báo cáo mới bên dưới.

Backend hiện chưa có attachments/upload, người giao dịch, dòng sản phẩm và đơn đang xử lý. Customer Ledger đã có ngày giao dịch cuối, thống kê trước phân trang, lọc thật và số dư theo ngày/kỳ; không hiển thị số giả. Bộ lọc vai trò nhân viên chưa có query trong Swagger nên chưa bật. Giao việc, sổ lương độc lập, kho và các module khác ngoài 3 module yêu cầu chưa triển khai.

In chỉ in trang hiện tại; CSV tải toàn bộ các trang. Swagger documented chưa có BE để kiểm thử E2E, đã kiểm tra adapter endpoint/payload bằng test. Build có cảnh báo chunk lớn từ Ant Design; không ảnh hưởng kết quả build.

# Cập nhật mã tự sinh

Backend hiện tự sinh mã khách hàng/nhân viên bằng PostgreSQL sequence. Form tạo không có ô mã; form sửa hiển thị mã chỉ đọc và cả hai payload không gửi mã. Thông báo tạo thành công dùng mã từ response backend. CRUD nhân viên cơ bản đã có; các tab nghiệp vụ vẫn cần backend tương ứng.

Trước khi chạy bản mới, xem [migration và cách kiểm tra](../backend/migrations/sql/README.md). Migration đã áp dụng ở localhost trong lần triển khai này, không chạy trên production. Khởi động lại backend sau khi build để nạp endpoints/mã tự sinh mới.

## Customer Ledger refactor theo Figma

Báo cáo mới thay thế các nhận xét ledger ở lần triển khai trước: [frame inventory, kiến trúc, mapping API, kiểm tra, screenshot và giới hạn](docs/customer-ledger/README.md).

Module hiện có workspace tab động theo UUID/URL/sessionStorage, filter và pagination riêng cho từng sổ, bảng tổng hợp và bảng nhóm ngày độc lập, create modal từ tổng hợp/chi tiết, drawer detail/edit và bản nháp có cảnh báo. Backend bổ sung read projections/filter/statistics; giữ công thức dấu, reverse và schema hiện có. FE lint/build/12 tests, BE build/6 ledger tests và HTTP chỉ đọc đã đạt. Các editor dòng hàng, loại vàng, chứng từ, người nhận, navigation nguồn order/delivery còn thiếu backend/module nguồn, chưa coi là hoàn thành toàn bộ prototype.

