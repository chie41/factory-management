# Phase 02 — Production Batch Foundation

## Chức năng hoàn thành

- Menu **Lô sản xuất**, URL `/#/production-batches` và `/#/production-batches/:id`, theo permission hiện có.
- Danh sách API thật: search mã lô/mã mẫu/tên mẫu, lọc trạng thái, sắp xếp, phân trang và chọn kích thước trang. Backend còn hỗ trợ lọc chính xác `design_model_id`.
- Tạo lô: chọn mẫu đang hoạt động, nhập số lượng và ngày kế hoạch/ghi chú, xem trước effective workflow và nguồn/revision. Có nút tải lại quy trình nguồn khi version đã thay đổi. Mẫu chưa có effective workflow không thể tạo lô.
- Mã lô do PostgreSQL sequence cấp, prefix LSX và tối thiểu 8 chữ số, không tái sử dụng. Mỗi lô đúng một mẫu, không có quan hệ bắt buộc với đơn hàng.
- Trong cùng transaction tạo lô: khóa danh mục, resolve workflow hiệu lực, kiểm tra source version từ preview, sao chép cấu hình/step/dependency, lưu source metadata, initial snapshot và lịch sử tạo lô. Mẫu nguồn đổi sau đó không sửa lô.
- Chi tiết: tổng quan, thông tin kế hoạch, nguồn snapshot, quy trình/công đoạn và lịch sử trước/sau thay đổi với người thực hiện. Không hiển thị tiến độ hoặc người phụ trách giả.
- Sửa kế hoạch và sửa quy trình riêng khi Nháp, chưa có thực thi. Editor tái sử dụng Phase 01: chọn công đoạn, dependency theo stable ID, drag handle sắp xếp, thêm/xóa và đơn giá/cờ xác nhận. Thứ tự được lưu bằng mảng definition và `batch_steps.display_order`.
- Mỗi lần lưu quy trình tạo snapshot revision mới, giữ các snapshot trước đó và audit; không thay đổi template nhóm/mẫu. Chỉ sửa kế hoạch không tạo workflow revision thừa.
- Các tab Phân công, Nguyên liệu, Hao hụt, Tiền công, Thành phẩm đã đặt trong cấu trúc chi tiết ở trạng thái chưa mở; chưa có logic Phase 03.
- Loading, empty, lỗi/retry, cảnh báo hủy bản nháp/reload, validation số/ngày/DAG và optimistic conflict. Quay lại danh sách bằng nút của trang có xác nhận nếu workflow đang sửa. Điều hướng SPA từ sidebar hoặc nút Back của trình duyệt chưa có guard riêng cho bản nháp lô.

## Database và bảo vệ dữ liệu

Migration bổ sung: `migrations/sql/20261029_production_batches.sql`; runner `scripts/migrate-production-batches.mjs` theo checksum/transaction và localhost guard hiện có.

Đã áp dụng thành công vào PostgreSQL localhost trong phiên này. Không reset/seed hoặc áp dụng production.

Các bảng mới:

- `production_batches` — mã, mẫu, số lượng, unit, kế hoạch/thực tế, trạng thái, nguồn, actor, revision và request deduplication.
- `batch_workflow_snapshots` — revision JSONB chỉ được thêm; revision 1 là bản sao nguồn ban đầu.
- `batch_steps` — khóa chính `(batch_id,step_id)`, cấu hình hiện hành, thứ tự, đơn giá NUMERIC(20,4), cờ xác nhận và marker thực thi dành cho Phase 03.
- `batch_step_dependencies` — foreign key theo batch + stable step ID, chặn self dependency bằng CHECK; service validate toàn bộ DAG.
- `batch_status_history`, `batch_audit_events` — lịch sử với actor/time và dữ liệu trước/sau.

Trigger database chặn UPDATE/DELETE snapshot và lịch sử, đồng thời chặn đổi nguồn mẫu/source metadata của lô. Foreign key RESTRICT giữ liên kết nguồn và khóa bước. Không có API xóa lô hoặc lịch sử.

Write sử dụng transaction, advisory lock `factory:production`, kiểm tra permission trong transaction và `version` dựa trên revision lô. Create lấy thêm lock `factory:catalog` để snapshot không lệch với thay đổi template. Create hỗ trợ `request_id`: cùng actor + cùng nội dung trả lô đã tạo, dùng lại ID với nội dung khác trả 409. Version preview cũ hoặc version lô cũ trả 409, không ghi đè. Thay đổi projection công đoạn và snapshot/audit được commit hoặc rollback cùng nhau.

Guard hiện tại chặn toàn bộ sửa quy trình/kế hoạch khi không còn DRAFT hoặc khi có `batch_steps.execution_started_at`. Phase 03 phải ghi marker thực thi trong cùng transaction với dữ liệu nghiệp vụ đầu tiên và tham chiếu stable composite step key bằng foreign key RESTRICT. Không được bỏ guard hoặc xóa execution records để sửa workflow. Quy tắc sửa từng phần khi có thực thi chưa được chốt.

Prisma contract đã thêm đầy đủ các entity và emit lại `contract.json`/`contract.d.ts`. Repo dùng Prisma 8 RC contract + explicit SQL; không tạo thư mục Prisma migrate tiêu chuẩn. CHECK, triggers và PostgreSQL sequence được quản lý bằng SQL migration.

## API

Prefix `/api/v1/production-batches`, JWT và permission guard.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/` | production.read |
| GET | `/workflow-preview?design_model_id=UUID` | production.create + design_models.read |
| POST | `/` | production.create + design_models.read |
| GET | `/:id` | production.read |
| PATCH | `/:id` | production.update |
| GET | `/:id/workflow` | production.read |
| PATCH | `/:id/workflow` | production.workflow.update |
| GET | `/:id/status-history` | production.read |
| GET | `/:id/audit-history` | production.read |
| PATCH | `/:id/status` | production.status.update; hiện từ chối vì chưa chốt rule |

List query: `q`, `design_model_id`, `status`, `page`, `page_size` (tối đa 100), `sort` (created_at/code/planned_quantity/planned_start/planned_end/status), `direction` asc/desc. Trường sort được DTO whitelist. List/count đọc trong repeatable-read transaction. History phân trang với has_more.

Create: `{request_id,design_model_id,source_version,planned_quantity,planned_start?,planned_end?,note?}`. `source_version` lấy từ preview. Số lượng nguyên dương; ngày dạng YYYY-MM-DD và kết thúc không trước bắt đầu. Unit hiện tại PCS.

Update plan: `{version,planned_quantity,planned_start?,planned_end?,note?}`; planned_quantity bắt buộc. Dùng null để xóa ngày/ghi chú, bỏ trường để giữ giá trị cũ.

Update workflow: `{version,workflow:{steps:[...]}}`, tái sử dụng DTO Phase 01. ID ổn định, name, description, dependencies, laborRatePer15g, requiresEmployeeConfirmation được giữ trong snapshot. Không tự thêm hoặc tạo dữ liệu mẫu.

Status: `{version,status,reason}` hợp lệ về DTO vẫn trả 409 do chưa có transition rules được xác nhận. Không có side effects tồn kho, lương hay nguyên liệu.

## Lifecycle và câu hỏi còn mở

- Khởi tạo DRAFT là trạng thái kỹ thuật cho lô vừa tạo. PLANNED/IN_PROGRESS/PAUSED/COMPLETED/CANCELLED mới là danh sách đề xuất, chưa thành state machine. Chưa cho chuyển trạng thái, kể cả khi có permission.
- Cần chốt transition graph, quyền chuyển từng trạng thái, điều kiện bắt đầu/hoàn thành/hủy, xử lý tạm dừng và các side effects.
- Mẫu mã hiện chưa có cấu hình đơn vị thành phẩm riêng. Foundation dùng PCS (đếm thành phẩm, theo convention đơn vị sẵn có); chưa hỗ trợ quy đổi hoặc đơn vị theo từng mẫu. Cần xác nhận nếu muốn đơn vị khác.
- Cần chốt quy tắc sửa kế hoạch/công đoạn khi đã phát sinh thực thi. Hiện chặn thay vì sửa/xóa lịch sử.
- Chưa phân công người phụ trách hoặc thợ, chưa tính tiến độ/sản lượng, chưa giao nhận nguyên liệu/hao hụt/trả công/xác nhận nhân viên. Các rule Phase 03 về hợp nhánh và tiền công vẫn chưa được tự áp dụng.

## Build và vận hành

- Backend `npm run build`: đạt.
- Frontend `npm run build`: đạt TypeScript + Vite; còn cảnh báo bundle >500kB.
- `npm run contract:emit`: đạt; Prisma vẫn cảnh báo index `users_live_employee_unique` đã có và skill Prisma chưa sync.
- Không viết/chạy unit, integration hoặc E2E test; chưa xác minh UI/API ở runtime.
- Khởi động lại backend để nạp build và đồng bộ permission catalog ADMIN. Các tài khoản khác cần được cấp production.* qua quản lý quyền hiện có; tải lại phiên để nhận quyền mới. Production phải áp dụng migration bằng deployment process trước khi chạy bản mới.

## File thêm/chỉnh sửa

Backend:

- `src/production/production.dto.ts` (mới)
- `src/production/production.service.ts` (mới)
- `src/production/production.controller.ts` (mới)
- `src/production/production.module.ts` (mới)
- `src/app.module.ts`
- `src/auth/permission-catalog.ts`
- `src/prisma/contract.prisma`, `contract.json`, `contract.d.ts`
- `migrations/sql/20261029_production_batches.sql` (mới)
- `scripts/migrate-production-batches.mjs` (mới)
- `migrations/sql/README.md`
- `docs/production-batches-phase02.md` (mới)

Frontend:

- `src/features/production/api.ts` (mới)
- `src/features/production/BatchCreate.tsx` (mới)
- `src/features/production/BatchPlanFields.tsx` (mới)
- `src/features/production/BatchPlanEdit.tsx` (mới)
- `src/features/production/BatchHistory.tsx` (mới)
- `src/pages/ProductionBatchesPage.tsx` (mới)
- `src/pages/ProductionBatchDetailPage.tsx` (mới)
- `src/app/router/types.ts`, `src/app/router/PageRouter.tsx`, `src/app/App.tsx`
- `src/components/layout/Sidebar.tsx`, `src/components/layout/HeaderBar.tsx`

Không sửa code nghiệp vụ Đơn hàng, Nhân viên, Mẫu mã, Sổ giao dịch hoặc Kho.
