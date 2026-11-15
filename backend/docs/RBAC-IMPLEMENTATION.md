# Cập nhật theo yêu cầu mới — 15/10/2026

Các quyết định dưới đây thay thế những nội dung tương ứng trong phần bàn giao ban đầu:

- Tài khoản chỉ còn Hoạt động (ACTIVE) và Đã khóa (LOCKED). LOCKED không đăng nhập được, JWT cũ bị từ chối ở request tiếp theo. Dữ liệu DISABLED/INACTIVE cũ được chuyển sang LOCKED; soft delete cũng đặt LOCKED.
- Mật khẩu tạo mới và đặt lại tối thiểu 6 ký tự, không được toàn khoảng trắng; không bắt buộc chữ hoa, số hoặc ký tự đặc biệt. Mật khẩu không bị tự trim trước khi hash.
- Liên kết nhân viên bất biến sau khi tạo, bảo vệ bằng API và trigger database. Đã bỏ phần chỉnh liên kết trong chi tiết tài khoản. Ngoại lệ admin không liên kết vẫn giữ nguyên. CLI liên kết tài khoản cũ chỉ dùng trước migration bất biến; không dùng để đổi nhân viên sau migration.
- Thêm nút Tạo tài khoản trong danh sách và chi tiết nhân viên, dùng modal chung với trang tài khoản. Username mặc định là mã NV, có thể sửa trước khi tạo; nhân viên được chọn cố định. Nhân viên đã có tài khoản chưa xóa không thể tạo thêm. API kiểm tra tình trạng liên kết là GET /api/v1/employees/:id/account, cần employees.read và users.create.
- Tên nhóm Permission Việt hóa, ví dụ Sổ giao dịch (customer_ledger), Khách hàng (customers), Nhân viên (employees), Tài khoản (users), Nhóm quyền (groups), Vai trò (roles).
- Migration bổ sung đã áp dụng trên localhost: migrations/sql/20261015_rbac_account_simplification.sql; runner scripts/migrate-rbac-account-simplification.mjs --local.
- File dùng chung mới: frontend/src/features/accounts/CreateAccountModal.tsx và EmployeeAccountButton.tsx. Các DTO, service tài khoản, controller/service nhân viên, trang tài khoản, danh sách/chi tiết nhân viên và PermissionMatrix đã được cập nhật.
- Giữ lựa chọn trước đó về thời gian chờ 5 phút cho quản trị viên ACTIVE cuối cùng khi nhập sai hơn 10 lần; tài khoản đã mang trạng thái LOCKED luôn bị từ chối mọi truy cập.

---

# Bàn giao quản lý tài khoản và RBAC — 15/10/2026

## Kiến trúc và phạm vi

Giữ React 19, HashRouter, TanStack Query, Ant Design 6; NestJS 12; JWT 24 giờ; Argon2; PostgreSQL và Prisma 8. Mở rộng UsersController và các guard hiện hữu, không tạo luồng authentication thứ hai. RbacModule dùng pg đã có trong dự án (cùng cách tiếp cận EntityCodeService), với SQL tham số hóa cho transaction, advisory lock và audit. Các module nghiệp vụ vẫn dùng ORM hiện tại.

Quyền hiệu lực là hợp Role + Group + Direct; trả kèm toàn bộ nguồn, loại trùng mã và không có Deny. Backend đọc dữ liệu hiện hành trên mỗi request. Frontend giữ quyền trong bộ nhớ, cập nhật mỗi 10 giây, khi cửa sổ được focus, khi gặp 403 và sau thay đổi phân quyền; không dùng localStorage làm nguồn quyền.

Chỉ có nhân viên, khách hàng, sổ giao dịch và tài khoản thực sự được triển khai trong codebase. Dashboard, đơn hàng, giao hàng, sản xuất, mẫu mã, mẫu sản phẩm, cấu kiện, lương, kho, vàng, thu/chi và báo cáo chỉ là menu chưa có API; không tạo quyền giả cho các module này. Nhãn menu cũ được giữ nguyên.

Tài liệu API gợi ý mã ba phần, nhưng controller hiện hữu dùng `employees.read`, `customers.read`, `customer_ledger.read` và `users.read`. Giữ quy ước đang chạy để tránh làm mất grant/API hiện có.

## Quyết định được người dùng xác nhận

- Tài khoản admin hiện tại không liên kết Employee. Cờ employee_link_exempt được đặt riêng trong migration; không dùng username hay ADMIN để bỏ qua authorization, và API không cho phép chỉnh cờ này.
- `nhanvien01` đã liên kết với Phạm Việt Hà, NV000001. Không tự tạo hồ sơ nhân viên.
- Sau hơn 10 lần sai, tài khoản chuyển LOCKED; riêng quản trị viên ACTIVE cuối cùng giữ ACTIVE, bị chặn đăng nhập 5 phút. Phiên đang đăng nhập vẫn kiểm tra quyền/trạng thái mỗi request. Đăng nhập đúng sau thời gian chờ xóa bộ đếm; quản trị viên có quyền trạng thái có thể khôi phục. Lựa chọn này giải quyết xung đột BR-CP-05 và BR-CP-24.

## Database đã áp dụng trên localhost

1. `migrations/sql/20261015_rbac.sql`: thêm employee_link_exempt, failed_login_attempts, password_changed_at; security_audit; CHECK nhân viên/trạng thái; unique index một tài khoản chưa xóa trên mỗi nhân viên; unique một Group/User; trigger username bất biến. Thay unique Employee toàn bộ lịch sử bằng partial unique để tài khoản đã xóa không chiếm liên kết nhân viên. Không xóa User hoặc lịch sử.
2. `migrations/sql/20261015_rbac_login_cooldown.sql`: thêm login_blocked_until.
3. Catalog đã đồng bộ, chỉ thêm/cập nhật, không xóa Permission vắng mặt. Bổ sung quyền quản trị bắt buộc cho system role ADMIN; giữ các grant nghiệp vụ đã có và không tự cấp quyền cho tài khoản thường.
4. Đã liên kết tài khoản cũ theo chỉ định và VALIDATE hai CHECK constraint. `employee_id` vẫn nullable để hỗ trợ ngoại lệ admin; CHECK bắt buộc liên kết đối với mọi tài khoản không có cờ ngoại lệ.
5. Prisma contract nguồn và contract.json/contract.d.ts đã emit lại. Partial index khai báo đúng tên index SQL đã áp dụng; audit và CHECK/trigger được quản lý bằng SQL migration.

Runner migration có checksum, không sửa lại migration đã áp dụng. Trên môi trường khác phải kiểm tra tài khoản chưa liên kết và trạng thái cũ trước khi VALIDATE; không tự xóa hay tự gán nhân viên. Các CLI có --local chỉ dùng database localhost ngoài production. Trên production dùng quy trình migration có kiểm soát của môi trường đó.

## API (prefix /api/v1)

| Endpoint | Permission |
|---|---|
| GET /users, /users/:id, /users/roles, /users/eligible-employees, /users/:id/effective-permissions | users.read |
| POST /users | users.create; cần thêm quyền gán tương ứng nếu payload có nhóm/vai trò/quyền riêng |
| PATCH /users/:id | users.update; chỉ cập nhật employee_id, không đổi username |
| PATCH /users/:id/status | users.status.manage |
| PATCH /users/:id/password | users.password.reset |
| PUT /users/:id/group | users.groups.manage; group_id:null để gỡ nhóm |
| PUT /users/:id/roles | users.roles.manage; [] để gỡ toàn bộ |
| PUT /users/:id/direct-permissions | users.permissions.manage; [] để gỡ toàn bộ quyền riêng |
| DELETE /users/:id | users.delete; soft delete |
| GET /groups, /groups/:id, /groups/:id/members | users.read |
| POST /groups, PATCH /groups/:id, DELETE /groups/:id | groups.manage |
| PUT /groups/:id/permissions | groups.permissions.manage |
| GET /roles, /roles/:id, /roles/:id/members | users.read |
| POST /roles, PATCH /roles/:id, DELETE /roles/:id | roles.manage |
| PUT /roles/:id/permissions | roles.permissions.manage |
| GET /permissions, /permissions/catalog | users.read; không có API tạo Permission |
| GET /auth/me/permissions | JWT và tài khoản ACTIVE |

Giữ các URL users hiện có, không tạo /system/accounts API trùng. Route giao diện là `/#/system/accounts`.

Mọi update/replace/delete quản trị cần `version` từ bản GET mới nhất. Version bao gồm trạng thái, nguồn quyền và quan hệ; có thay đổi đồng thời trả 409. Group và Role sửa tên, mã được giữ nguyên. PUT thay thế toàn bộ tập liên kết trong một transaction.

Các request dùng DTO validation/whitelist; 401 khi phiên/tài khoản không hợp lệ, 403 khi thiếu quyền, 409 khi xung đột dữ liệu/phiên bản hoặc mất admin cuối cùng. Không trả password hash. Đặt lại mật khẩu thu hồi JWT cũ qua password_revision mà không thay thuật toán hash hoặc thời hạn JWT hiện hữu.

## Catalog 24 Permission

- employees.read, employees.create, employees.update
- customers.read, customers.create, customers.update, customers.delete
- customer_ledger.read, customer_ledger.create, customer_ledger.update, customer_ledger.reverse
- users.read, users.create, users.update, users.delete
- users.status.manage, users.password.reset
- users.roles.manage, users.groups.manage, users.permissions.manage
- groups.manage, roles.manage, groups.permissions.manage, roles.permissions.manage

13 quyền users/groups/roles là tập quản trị bắt buộc. ADMIN được nhận diện để bảo vệ system role, không dùng làm bypass. Các quyền nghiệp vụ không được mặc nhiên gán cho User không có nguồn.

## Bảo vệ an toàn

- Tất cả thao tác ghi RBAC được serialize bằng PostgreSQL advisory transaction lock, kiểm tra lại actor trong transaction, kiểm tra trạng thái sau thay đổi và ghi audit trước commit. Giao dịch thất bại rollback toàn bộ quan hệ.
- Không được gán thêm quyền vượt tập quyền hiệu lực đang có của actor, kể cả thông qua Role, Group hoặc sửa Permission của nguồn.
- Không tự khóa/xóa bản thân; không tự thu hồi quyền quản trị đang có thông qua Group/Role/Direct. Quản trị viên khác có thể thay đổi trong giới hạn bảo vệ admin cuối cùng.
- Luôn duy trì một User ACTIVE có đầy đủ tập quyền quản trị bắt buộc, dù quyền đến từ bất kỳ nguồn nào. Không dựa vào tên Role để đếm admin.
- Không gỡ quyền quản trị bắt buộc của system role ADMIN; không xóa ADMIN. Group/Role còn liên kết thành viên (kể cả tài khoản soft delete để giữ lịch sử) không được xóa.
- Audit có actor, target, action, timestamp, before/after. Không lưu password, password hash hay token trong audit.
- Những thay đổi bằng SQL bên ngoài ứng dụng phải dùng quy trình bảo trì có kiểm soát; không bypass invariant bằng truy cập database trực tiếp.

## UI và hướng dẫn

Đăng nhập, chọn HỆ THỐNG → Quản lý tài khoản. Người thiếu users.read không thấy menu và bị 403 nếu mở route trực tiếp.

Tab Tài khoản: tìm username/tên/mã nhân viên, lọc Group/Role/trạng thái, phân trang; tạo tài khoản bằng nhân viên đủ điều kiện (ACTIVE, chưa có tài khoản chưa xóa), mật khẩu tối thiểu 12 ký tự và xác nhận. Chi tiết hỗ trợ liên kết nhân viên, trạng thái, reset mật khẩu, xóa mềm, gán một Group, nhiều Role và quyền riêng. Từng nguồn có nút lưu riêng; bảng quyền hiệu lực chỉ đọc và hiển thị đầy đủ nguồn cấp. Nút Hủy/đóng bỏ các lựa chọn chưa lưu.

Tab Nhóm quyền / Vai trò: tạo, sửa tên, xem thành viên, gán quyền bằng matrix nhóm theo module, tìm kiếm/chọn tất cả/chọn một phần, đếm quyền và xác nhận ảnh hưởng trước lưu. Trong nhóm, có thể chọn tài khoản của trang danh sách hiện tại để thêm/chuyển; để chọn tài khoản khác hãy tìm ở tab Tài khoản và đổi nhóm từ chi tiết. Gỡ thành viên cũng thực hiện tại chi tiết tài khoản. Role hệ thống có nhãn riêng.

Nhân viên, khách hàng, sổ giao dịch đã có guard backend hiện hữu; nay dùng service chung kiểm tra trạng thái hiện hành. Frontend bổ sung route/menu guards và nút tạo/sửa/xóa/reverse theo đúng quyền. Xuất/in sổ hiện là thao tác client dựa trên dữ liệu đã có quyền đọc, không có API xuất/chốt riêng trong codebase; không tự tạo quyền mới cho thao tác không có business rule riêng.

## Xác minh đã thực hiện và giới hạn

- Hai migration localhost đã commit; liên kết Phạm Việt Hà và hai CHECK constraint đã validate.
- Catalog đồng bộ thành công; đăng nhập admin HTTP 200; API quyền hiện tại trả 24 quyền.
- Các API đọc users (2 tài khoản), groups (0), roles (1), catalog (24), eligible employees (0), employees (1), customers (12), sổ tổng hợp (7) đã trả HTTP 200 trên backend mới cổng 3001. Không ghi dữ liệu kiểm thử vào luồng nghiệp vụ.
- Backend/frontend build và lint; không tạo/chạy bộ kiểm thử tự động theo yêu cầu. Có cảnh báo bundle frontend lớn; không thay đổi cấu hình build chỉ để tắt cảnh báo.
- Trình duyệt tích hợp timeout khi mở localhost nên chưa xác nhận trực quan desktop/tablet và chưa thực hiện toàn bộ luồng CRUD qua UI. Các luồng ghi, race condition, reset/revoke và tự khóa là phần đã triển khai/rà soát code nhưng chưa được thực thi kiểm chứng đầy đủ; không coi build/API đọc là bằng chứng cho toàn bộ acceptance criteria.
- Chưa áp dụng migration lên production. Phiên đăng nhập mới có thời hạn 24 giờ (86400 giây). Token đã phát hành giữ nguyên hạn cũ; đăng nhập lại để nhận thời hạn mới.
- Không tự động mở rộng quyền nghiệp vụ cho ADMIN hiện hữu ngoài 13 quyền quản trị bắt buộc. Catalog sync chỉ bổ sung quyền quản trị; seed dành cho khởi tạo có chủ đích, tạo ADMIN với toàn catalog và không reset password tài khoản đã tồn tại.
- Thư mục làm việc không có Git ở cấp gốc nên không tạo commit/PR.

## File tạo / sửa

Backend:
- src/auth/permission-catalog.ts; rbac.module.ts; rbac.service.ts
- src/auth/guards/permission.guard.ts; jwt-auth.guard.ts
- src/auth/auth.service.ts; auth.controller.ts
- src/app.module.ts
- src/users/users.service.ts; users.controller.ts; users.module.ts
- src/users/access.service.ts; access.controller.ts
- src/users/dto/rbac.dto.ts; create-user.dto.ts; update-user.dto.ts; update-user-status.dto.ts; reset-user-password.dto.ts; set-user-roles.dto.ts; query-users.dto.ts
- src/prisma/contract.prisma; contract.json; contract.d.ts; seed.ts
- migrations/sql/20261015_rbac.sql; 20261015_rbac_login_cooldown.sql
- scripts/migrate-rbac.mjs; migrate-rbac-login-cooldown.mjs; sync-permissions.ts; link-legacy-account.mjs; inspect-rbac.mjs; inspect-rbac-api.mjs

Frontend:
- src/pages/AccountsPage.tsx
- src/features/accounts/api.ts; PermissionMatrix.tsx
- src/features/auth/components/Permissions.tsx; src/features/auth/hooks/usePermissions.ts
- src/app/App.tsx; src/app/router/PageRouter.tsx; types.ts
- src/components/layout/Sidebar.tsx; HeaderBar.tsx
- src/services/apiClient.ts
- src/features/employees/components/EmployeesDirectory.tsx; EmployeeDetail.tsx
- src/features/customers/components/CustomersDirectory.tsx
- src/features/customer-ledger/components/CustomerLedger.tsx; LedgerDetail.tsx; LedgerEntryDrawer.tsx; LedgerDailyTable.tsx

## Lệnh triển khai cục bộ

Từ backend:

```powershell
node scripts/migrate-rbac.mjs --local
node scripts/migrate-rbac-login-cooldown.mjs --local
npx tsx scripts/sync-permissions.ts --local
npx prisma contract emit
npm run build
```

Nếu có tài khoản cũ chưa liên kết, cần người quản trị chọn đúng nhân viên, sau đó dùng `node scripts/link-legacy-account.mjs <username> <employee_code>`; runner từ chối ghi đè liên kết hiện hữu và chỉ validate khi tất cả dữ liệu hợp lệ. Không chạy seed để sửa dữ liệu tài khoản thông thường.

Từ frontend: `npm run build`.

Preview phiên này: frontend http://127.0.0.1:5173/#/system/accounts, proxy backend mới http://127.0.0.1:3001/api/v1. Cổng 3000 có tiến trình khác nên không dừng hoặc thay thế nó. Khi khởi động frontend với backend cổng 3001, đặt API_PROXY_TARGET=http://127.0.0.1:3001; cấu hình mặc định dự án vẫn là cổng 3000.

## Cập nhật form nhóm quyền / vai trò

- Mã mới được backend tự sinh bằng PostgreSQL sequence: NQ000001 cho Group, VT000001 cho Role. Giữ nguyên mã hiện hữu; không tái sử dụng mã nhóm đã xóa mềm. Migration 20261015_rbac_access_codes.sql đã áp dụng ở localhost.
- POST /groups và /roles nhận name, permission_ids tùy chọn; không nhận code. Nếu gán quyền ban đầu cần thêm permission quản lý quyền của nguồn tương ứng.
- PATCH /groups/:id và /roles/:id nhận version và name/permission_ids tùy chọn; cần ít nhất một thay đổi. Kiểm tra quyền theo từng trường trong transaction; không cho quyền sửa tên mặc nhiên gán quyền. Thông tin và quyền được lưu nguyên tử, vẫn bảo vệ ADMIN và quản trị viên cuối cùng.
- Form tạo có phần chọn quyền ngay từ đầu. Modal chỉ có nút Lưu ở footer và dấu X để đóng, không còn các nút Lưu thông tin/Lưu quyền riêng. Khi sửa quyền nguồn có thành viên vẫn xác nhận ảnh hưởng trước khi lưu.
