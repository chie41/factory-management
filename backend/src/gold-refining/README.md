# Tịnh vàng — hướng dẫn tích hợp và kiểm thử

> **Chưa triển khai production.** Module mới cần migration, cấp quyền và kiểm chứng số liệu trên cơ sở dữ liệu thử nghiệm trước khi merge PR.

## Những gì module đã có

- API `/api/v1/gold-refining` bảo vệ bằng JWT và permission `gold.sessions.*`, `gold.templates.manage`.
- Mỗi ngày có nhiều nhất **một phiên**. `business_date` dùng chuỗi `YYYY-MM-DD`.
- Dữ liệu nguồn Sản xuất và sổ khách được chụp trong transaction `REPEATABLE READ` lúc tạo/Reload; các thay đổi nguồn sau đó không tự đổi phiên.
- Lưu nháp: version tăng mỗi lần; payload version cũ bị HTTP 409, tránh ghi đè khi nhiều người tịnh vàng.
- Bỏ công việc chỉ bỏ ID khỏi `selected_work_ids`; **không bao giờ sửa công đoạn, bút toán vàng hay giao việc ở Sản xuất**.
- Snapshot biểu mẫu riêng theo ngày; thay đổi mẫu mặc định có `effective_from`, chỉ tài khoản có vai trò `ADMIN` và permission tương ứng được thực hiện.
- Tính tổng bằng BigInt độ chính xác 0.0001g.
- Chốt: khóa snapshot tổng tiền, đặt thời gian khóa; khi hết hạn, truy cập API kế tiếp chuyển sang trạng thái LOCKED. Admin mở lại bằng lý do bắt buộc và có audit.
- Danh sách thật và dữ liệu mẫu là hai chế độ độc lập trên frontend.

## Đưa lên database thử nghiệm

1. Sao lưu database staging rồi áp dụng `migrations/sql/20261116_gold_refining_sessions.sql` bằng quy trình migration của môi trường đó.
2. Nếu dùng database **localhost và ngoài production**, có thể chạy:
   ```bash
   cd backend
   npm install
   npm run gold:migrate-sessions
   npm run build
   npm run start:dev
   ```
   Runner từ chối database không phải localhost và môi trường `NODE_ENV=production`.
3. Khởi động lại backend để `RbacService` đăng ký 5 permission mới.
4. Trong Quản lý tài khoản, cấp `gold.sessions.read/edit/finalize` cho nhóm thực hiện, chỉ Admin giữ `gold.sessions.reopen` và `gold.templates.manage`.
5. Chạy frontend `npm run build`, `npm run dev`; vào `/#/gold`, chọn **Tạo phiên tịnh vàng mới**, điền mẫu, Lưu nháp, tải lại trình duyệt, xác minh dữ liệu được giữ.
6. Thử bỏ/chọn công việc, chốt, thử sửa phiên đã chốt (phải bị từ chối), Admin mở lại (có lý do).

## Checklist kiểm thử tích hợp bắt buộc

- [ ] So khớp vàng giao/nhận với `batch_material_movements`, bao gồm TRANSFER, RETURN, hiệu lực dấu `effect` và bút toán đảo/hủy.
- [ ] So khớp tổng nợ vàng theo từng khách với báo cáo `/customer-ledger/daily-gold` ở cùng ngày, với quy ước chọn khoản nợ dương.
- [ ] Kiểm chứng snapshot cùng một thời điểm (đặc biệt khi có giao dịch mới trong lúc đang tịnh).
- [ ] So khớp số liệu BigInt, trường hợp trọng lượng vỏ, cộng/trừ, âm/dương, Hao/Heo chưa có số Nhận.
- [ ] Kiểm thử 409 khi nhiều người đồng thời lưu cùng phiên.
- [ ] Kiểm thử tạo hai phiên cùng ngày (phải trả 409), chốt phiên đầu tiên, rồi chốt phiên sau.
- [ ] Kiểm thử lịch sử và ngày hiệu lực mẫu cố định so với tùy chỉnh riêng ngày.
- [ ] Kiểm thử phiên khóa theo giờ, quyền Admin sửa mặc định/mở lại, audit.
- [ ] Kiểm thử khi không có kết nối backend hoặc thiếu quyền.
- [ ] Backup/rollback được thử trên staging trước khi triển khai production.

## Trạng thái kiểm tra kỹ thuật

- Đã đồng bộ và commit `backend/package-lock.json`; `npm ci` sạch không cần sửa file khi CI chạy.
- CI GitHub Actions đạt frontend build, backend build, Vitest nghiệp vụ trên nhánh tính năng:
  https://github.com/chie41/factory-management/actions/runs/43759751177
- **Chưa chạy kiểm thử tích hợp database staging**, chưa áp dụng migration vào môi trường đang vận hành.
