# Phase 01 — Quy trình sản xuất của Nhóm mẫu mã / Mẫu mã

> Báo cáo dưới đây ghi lại bản Phase 01 ban đầu. Luồng UI, metadata optional và cách lưu chung nhóm/công đoạn đã được cập nhật; xem [báo cáo UX update](production-workflows-ux-update.md) để biết hành vi hiện tại. Preview và editor modal cũ đã được bỏ.

## Phạm vi và cách sử dụng

- Mẫu mã → xem chi tiết → section **Quy trình sản xuất**.
- Quản lý Nhóm mẫu mã → **Quy trình sản xuất** trên mỗi dòng. Người chỉ có quyền đọc có thể mở **Xem quy trình nhóm** từ section của mẫu mã thuộc nhóm đó.
- Nhóm có thể tạo/sửa tên, mô tả, công đoạn, hướng dẫn và dependencies. Không tự tạo công đoạn mẫu.
- Mẫu mặc định INHERIT: đọc trực tiếp revision mới nhất của nhóm, chỉ đọc. Tùy chỉnh sao chép effective workflow hiện tại trên server và chuyển CUSTOM trong cùng transaction.
- CUSTOM có cấu hình và revision riêng; không nhận cập nhật nhóm. Khôi phục yêu cầu xác nhận, chuyển INHERIT và giữ toàn bộ revision CUSTOM.
- Đổi nhóm: INHERIT dùng nhóm mới; CUSTOM được giữ nguyên. Mẫu không thuộc nhóm hoặc nhóm chưa cấu hình có effectiveWorkflow=null. Bắt đầu CUSTOM khi nguồn trống tạo cấu hình rỗng, không thêm công đoạn giả.
- Editor hỗ trợ thêm, sửa, sao chép, xóa, đưa lên/xuống, chọn nhiều dependency; preview chia tầng theo DAG. Chỉ cho xóa công đoạn sau khi gỡ các dependency trỏ tới nó. Thứ tự trình bày không tự thay đổi dependency.
- Có loading, empty, lỗi/retry, chỉ đọc theo quyền, validation, thông báo kết quả, xác nhận xóa/khôi phục, cảnh báo bỏ thay đổi khi đóng editor và trước khi rời trang/reload trình duyệt. Dữ liệu lỗi lưu được giữ để người dùng sửa hoặc sao chép trước khi tải lại.
- Refetch quy trình mỗi 15 giây và khi focus lại trang; bản nháp editor không bị ghi đè bởi refetch. Backend luôn resolve revision mới nhất, không cần đồng bộ hàng loạt mẫu.

## Database và concurrency

Repo dùng Prisma 8 RC contract + explicit SQL migrations, không dùng thư mục Prisma migrate tiêu chuẩn.

- SQL: `migrations/sql/20261029_production_workflows.sql`.
- Runner: `node scripts/migrate-production-workflows.mjs --local` từ backend; chỉ chấp nhận localhost ngoài production, có migration checksum và transaction.
- Đã áp dụng migration vào localhost trong phiên triển khai. Không áp dụng production; không reset/seed database.
- `design_models.workflow_mode`: INHERIT mặc định, CUSTOM tùy chỉnh.
- `production_workflow_revisions`: owner group/model với foreign key RESTRICT, revision, definition JSONB, actor, thời gian. Mỗi definition chứa danh sách steps có ID ổn định, thứ tự trình bày, hướng dẫn và các dependency ID. Đây là biểu diễn DAG tương đương, không phải danh sách tuyến tính đơn thuần.
- Revision chỉ được thêm qua service, không có API sửa/xóa lịch sử. Foreign key chặn xóa chủ sở hữu đã có lịch sử; mẫu có thể ngừng sử dụng như chức năng sẵn có.
- Toàn bộ write dùng cùng advisory lock `factory:catalog` với CRUD danh mục; kiểm tra permission trong transaction và optimistic version trước khi ghi. Resolve dùng một SQL statement để tránh đọc lệch giữa chế độ, nhóm và revision.
- Version bao gồm updated_at/mode/group_id, revision riêng và revision nhóm khi INHERIT. Save từ dữ liệu cũ trả conflict, không ghi đè. CUSTOM không bị invalidation chỉ vì quy trình nhóm thay đổi.
- Audit các hành động SAVE/CUSTOMIZE/INHERIT vào security_audit cùng transaction; lịch sử revision giữ actor và timestamp.
- Không thay đổi raw SQL của Đơn hàng, Sổ khách hàng hoặc Nhân viên. Catalog sửa group_id không thay workflow_mode hoặc revision riêng.
- Prisma source `src/prisma/contract.prisma` đã mở rộng, `contract.json` và `contract.d.ts` đã emit lại thành công.

## API

Prefix `/api/v1`; JWT và permission guard hiện có.

| Endpoint | Method | Permission |
| --- | --- | --- |
| `/design-model-groups/:id/production-workflow` | GET | design_models.read |
| `/design-model-groups/:id/production-workflow` | PATCH | design_models.groups.manage |
| `/design-model-groups/:id/production-workflow/revisions` | GET | design_models.read |
| `/design-models/:id/production-workflow` | GET | design_models.read |
| `/design-models/:id/production-workflow` | PATCH | design_models.update |
| `/design-models/:id/production-workflow/revisions` | GET | design_models.read |

GET trả `{data:{id,mode,source,group_id,group_name,revision_id,revision,effectiveWorkflow,version}}`.

PATCH nhận `{version,action,workflow?}`. Nhóm chỉ nhận SAVE; mẫu nhận SAVE khi CUSTOM, CUSTOMIZE khi INHERIT, INHERIT để khôi phục. Chuyển mode không nhận definition từ client. SAVE yêu cầu workflow `{name,description,steps:[{id,name,description,dependencies:string[]}]}`. Tối đa 200 công đoạn; DTO giới hạn độ dài và loại dữ liệu. Backend từ chối ID trùng, dependency thiếu, self-dependency, chu trình và cấu trúc sai. Revision history trả tối đa 100 revision riêng gần nhất, bao gồm definition đầy đủ; lịch sử nhóm xem trên endpoint của nhóm.

## Figma và giao diện

Đã truy xuất design context và screenshot đúng file `3rFXFMYr9fNCS8uPMur6Rf`, node `179964:13387` trong phiên Figma `2d68d989-ebff-48e7-9690-a8ec40988b90`.

Tham chiếu là section Quy trình sản xuất: khung trắng có viền, tiêu đề/mô tả, thẻ công đoạn có số thứ tự, nút thao tác và vùng thông tin cuối. Không có asset ảnh/SVG cần tải. Đã chuyển sang Ant Design Card, Tag, Typography, Dropdown, Modal, Form, Tabs, Select; dùng theme/token Inter và màu primary hiện có. Không thêm Tailwind hoặc UI library.

Điều chỉnh nghiệp vụ: thêm nguồn INHERIT/CUSTOM, revision, nhiều dependencies, preview theo tầng, lịch sử và xác nhận. Dùng menu đưa lên/xuống thay drag-and-drop. Không đưa 5 công đoạn demo vào dữ liệu thật. Layout responsive theo vùng chi tiết đang có, không dùng chiều rộng cố định 1112px của Figma. Đã đối chiếu source với design context/screenshot; chưa xác minh hình ảnh ứng dụng đang chạy, không tuyên bố pixel-perfect.

## Kết quả và giới hạn

- Frontend `npm run build`: đạt TypeScript + Vite; còn cảnh báo bundle >500kB.
- Backend `npm run build`: đạt.
- `npm run contract:emit`: đạt; Prisma báo cảnh báo index `users_live_employee_unique` đã có và skill Prisma chưa sync, không ảnh hưởng emit.
- Không viết/chạy unit, integration hoặc E2E test; không thực hiện phase kiểm thử riêng theo yêu cầu. Chưa xác minh UI/API ở runtime.
- Backend đang chạy cần restart để nạp code build mới; frontend cần dùng bundle mới hoặc Vite dev server.

## Business rules chưa chốt và Phase 02

Chưa tự định nghĩa quy tắc hoàn tất nhánh song song, nhánh tùy chọn, điều kiện chuyển bước, phân công thợ, định mức thời gian/hao hụt, hoặc khóa công đoạn sau khi đã thực hiện. Phase 01 chỉ cấu hình DAG và hướng dẫn công đoạn.

`ProductionWorkflowService.resolveEffectiveWorkflow(kind,id,client?)` được export từ CatalogModule để Phase 02 lấy definition + source revision ID trong cùng transaction tạo lô. Phase 02 phải lưu snapshot riêng cho lô; không tham chiếu động để sửa lịch sử lô. Không triển khai hoặc cập nhật bất kỳ lô sản xuất nào trong Phase 01.

## File thêm/chỉnh sửa

Backend:

- `src/catalog/production-workflow.dto.ts` (mới)
- `src/catalog/production-workflow.service.ts` (mới)
- `src/catalog/production-workflow.controller.ts` (mới)
- `src/catalog/catalog.module.ts`
- `src/catalog/catalog.service.ts` (thông báo xóa khi có lịch sử quy trình)
- `src/prisma/contract.prisma`, `src/prisma/contract.json`, `src/prisma/contract.d.ts`
- `migrations/sql/20261029_production_workflows.sql` (mới)
- `scripts/migrate-production-workflows.mjs` (mới)
- `migrations/sql/README.md`
- `docs/production-workflows-phase01.md` (mới)

Frontend:

- `src/features/catalog/ProductionWorkflow.tsx` (mới)
- `src/features/catalog/DesignGroups.tsx`
- `src/pages/CatalogPage.tsx`
