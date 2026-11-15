# Contract bổ sung cho frontend

Được định nghĩa theo yêu cầu người dùng ngày 12/10/2026, từ Figma page 179556:411. Không thay đổi route, DTO hay database backend hiện tại. File `openapi-read-models.json` là bản bổ sung response có thể merge vào Swagger 1.1 đã cung cấp.

## Chọn contract

- `VITE_API_CONTRACT=current` (mặc định): `/customers` dùng `customer_code`, `status`; sổ dùng `/customer-ledger/summary`, `/customer-ledger/customers/{id}`, `/customer-ledger/customers/{id}/entries`, `/customer-ledger/entries/{id}` và `/reverse`. Payload ghi sổ theo DTO thực tế: `business_date`, `occurred_at`, `transaction_type`, `gold_weight_g`, `labor_amount_due`, `labor_amount_paid`, `labor_currency`, `description`, `note`, `reference_type`, `reference_id`.
- `VITE_API_CONTRACT=documented`: khách hàng gửi `code`, `name`, `phone`, `address`, `note`, không gửi status vì Swagger chưa có. Sổ dùng `/customer-ledgers/summary`, `/customers/{id}/ledger`, `/customers/{id}/ledger-entries`, `/customer-ledger-entries/{id}` và `/reverse`. Payload giữ đúng Swagger: `entry_type`, `amount`, `currency`, `gold_weight_grams`, `reference_type`, `reference_id`, `note`. PAYMENT/ADJUSTMENT chỉ có trong chế độ này.
- Nhân viên ở cả hai chế độ luôn dùng `/employees`, không dùng `/users` thay hồ sơ.
- Không tự fallback endpoint khi 404 và không thử lại mutation ở endpoint khác, tránh ghi hai lần.

## Response nhân viên được đề xuất

GET `/employees`: `{ data: Employee[], meta: Pagination }`. GET `/employees/{id}`: `{ data: Employee }`. Employee gồm `id`, `code`, `name`, `phone`, `role`, `status`, `start_date`, `note`, `currentWork`. Trường liên hệ có thể null; id UUID, ngày YYYY-MM-DD, status ACTIVE/INACTIVE. `currentWork` là mô tả tổng hợp chỉ đọc, không ghi qua form hồ sơ.

GET `/employees/{id}/work`: `{ data: { assignments: WorkRow[] } }`. WorkRow gồm `id`, `assignment_code`, `assignment_date`, `description`, `gold_issued_g`, `gold_received_g`, `variance_g`, `labor_amount`, `currency`, `status`, `note`. Status HOLDING/SETTLED/CANCELLED. Nguồn sở hữu dữ liệu là WorkerAssignment; trang hồ sơ không ghi giao việc mới. Search/status trong tab lọc toàn bộ mảng response ở client; endpoint chưa có query phân trang theo Swagger.

GET `/employees/{id}/payroll`: `{ data: { periods: PayrollPeriod[] } }`. Trả các kỳ mới nhất trước. Period gồm `id`, `name`, `summary_thb` và `lines`. summary_thb gồm `labor`, `bonus`, `allowance`, `advance`, `supplies`, `penalty`, `gold_variance`, `net`, đều chuỗi decimal đã tính từ Payroll. Line gồm `id`, `date`, `type`, `description`, `source`, `reference`, `original_amount`, `original_currency`, `amount_thb`, `status`. Type LABOR/BONUS/ALLOWANCE/ADVANCE/SUPPLIES/PENALTY/GOLD_VARIANCE/RECOVERY. Các khoản trừ có dấu âm; FE không tự tính tỷ giá hoặc lương. Tab Ứng / Khấu trừ đọc cùng endpoint, lọc các loại tương ứng. Không tự thêm route ứng/khấu trừ ngoài Swagger.

GET `/employees/{id}/supplies`: `{ data: { held: SuppliesRow[], history: SuppliesRow[] } }`. Row gồm `id`, `supply_name`, `quantity`, `date`, `transaction_type`, `reference`, `amount`, `currency`, `payment_method`. payment_method IMMEDIATE/PAYROLL_DEDUCTION. Tab này chỉ đọc, nguồn sở hữu là Supplies.

GET `/employees/{id}/activity?page=1&page_size=10`: `{ data: ActivityRow[], meta: Pagination }`. Row gồm `id`, `occurred_at`, `description`, `actor_name`. occurred_at là ISO datetime có timezone. Sắp xếp mới nhất trước.

POST/PATCH hồ sơ nhận name/phone/role/status/start_date/note. Backend tự sinh code dạng NV000001 khi tạo mới; code chỉ đọc và mọi trường mã trong request bị từ chối. Không tạo tài khoản đăng nhập hoặc gán quyền từ hồ sơ nhân viên. CRUD nhân viên cơ bản đã triển khai; các tab nghiệp vụ dưới đây vẫn là contract đề xuất.

## Response sổ giao dịch được đề xuất

Giữ cấu trúc read model backend hiện có để tránh hai dạng response:

- Summary: `{ data: [{ customer: { id, customer_code, name }, totals }], meta }`.
- Book: `{ data: { customer, totals, entries: LedgerEntry[] }, meta }`.
- Entry detail/mutation: `{ data: LedgerEntry }`.
- totals: `active_entries`, `reversed_entries`, `gold_debt_balance_g`, `labor_by_currency: { VND: { due, paid, outstanding }, THB: ..., LAK: ... }`.
- Response entry chế độ documented dùng các trường Swagger `entry_type`, `amount`, `currency`, `gold_weight_grams`; thêm `businessDate`, `occurredAt`, `referenceType`, `referenceId`, `note`, `reversedAt`, `reversedBy`, `gold_debt_change_g`, `gold_debt_running_balance_g` để hiển thị lịch sử. Tên camelCase của metadata được giữ để tương thích response backend hiện tại. Server phải trả lại số tiền/loại giao dịch gốc khi GET để sửa không mất dữ liệu.
- Giao dịch reverse giữ trong entries nhưng không đóng góp số dư. Server tính lũy kế trên toàn bộ lịch sử rồi mới phân trang. Không cộng chung tiền khác loại tiền. Chuỗi decimal giữ tối đa 4 chữ số; FE không đổi số dư thành Number để render.
- Pagination: page/page_size/total/total_pages; page >= 1, page_size <= 100. Không dùng `limit`.
- API hiện không có tổng số giao dịch hôm nay, ngày giao dịch cuối, đơn đang xử lý, dòng sản phẩm, người nhận và attachments. FE không suy diễn các số liệu này. Chứng từ cần upload contract và endpoint backend trước khi bật.
- Các schema này là contract cho BE tương lai, không phải tuyên bố các endpoint đã chạy. Error 404/403/401/network được hiển thị và có thử lại.

## Figma và responsive

Đã đọc high fidelity Employee Content 179845:1062, Employee Detail 179848:1470, WorkerAssignments 179855:2750, Payroll 179848:1837/1861, Advances 179848:2070, Supplies 179848:2321/2345, Activity 179848:2489, Ledger Summary 179617:1275 và modal 179655:1655. Dùng lại Ant Design và CSS hiện có; các frame này không cung cấp ảnh/SVG tĩnh cần tải.

Desktop giữ sidebar 232px, header 60px, content padding 28px; hàng danh sách nhân viên 54px. Trang khách hàng/form hồ sơ chưa có frame riêng trong phạm vi đã đọc nên dùng Ant Design. Font dùng Inter nếu máy có, fallback system/Segoe UI; chưa có font file đi kèm thiết kế.

Giả định responsive: <=1100px đổi sidebar thành navigation ngang cho 3 module; <=600px xếp form/filter thành 1 cột; thẻ thống kê 2 cột; bảng cuộn ngang trong vùng bảng, không làm tràn toàn trang. Ảnh thực tế ở `screenshots/`; kiểm tra desktop 1440x1024 và mobile 390x844. Không tuyên bố đã đối chiếu dữ liệu các tab nhân viên vì backend chưa triển khai.
