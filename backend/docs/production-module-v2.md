# Production module v2.0 — Báo cáo triển khai

## 1. Phạm vi hoàn thành

Đã mở rộng module đang có, không tạo lại Mẫu mã, Nhóm mẫu mã, Nhân viên hoặc Đơn hàng. Các luồng mới dùng API thật, quyền hiện có và snapshot/transaction/audit từ Phase 01–03.

- Cấu hình thời lượng công đoạn bằng một ô: `30p`, `45`, `90`, `2h`, `2h30`, `3h15`; lưu tổng phút nullable, 0 hợp lệ, từ chối âm/sai định dạng. Phần phút trong biểu thức giờ phải dưới 60. Thời lượng cho cả công đoạn, không nhân số lượng hoặc tính deadline.
- Trang tạo lô riêng `/#/production-batches/new`; nút danh sách điều hướng tới trang này. Có chọn mẫu, số lượng, trọng lượng quy đổi, DatePicker showTime cho hai mốc kế hoạch, ghi chú và editor công đoạn dùng chung.
- Quy trình nguồn được sao chép vào local state; chỉnh sửa, thêm/xóa/dependency/đơn giá/thời lượng/cờ xác nhận/kéo thả trước khi tạo. Đổi mẫu hoặc khôi phục khi đã sửa có xác nhận. Không gọi API lưu workflow mẫu. Chỉ một hành động chính Tạo lô sản xuất; batch + snapshot + dependencies + audit cùng transaction.
- Trang chi tiết liên tục, không còn các tab chức năng. Có header, summary, section công đoạn mở rộng, bảng thợ thống nhất, dữ liệu giao nhận/phiếu hoàn thành/chốt–mở lại nằm ngay dưới dòng thợ. Nhật ký bổ sung là vùng thu gọn, không phải tab Lịch sử.
- Một thợ một dòng trong một công đoạn. Giao bổ sung cộng vào tổng hiện có, lưu event giao việc; điều chỉnh tổng có lịch sử. Tổng phân công không vượt số lượng lô; không giảm dưới số đã hoàn thành.
- Phiếu hoàn thành nhiều lần, đúng một nhân viên/phiếu ở v2, không vượt số lượng giao hoặc số lượng công đoạn; giữ request deduplication và mã phần việc duy nhất. Không cộng trùng contribution của nhiều người vào sản lượng.
- Giao/nhận nhiều lần và nhận vàng tổng, không bắt tách vàng thành phẩm/vàng thừa. Bút toán cũ giữ nguyên, điều chỉnh bằng đảo có dấu vết.
- Chốt Hao/Heo thủ công cho toàn bộ thợ/công đoạn, mở lại có lý do, lưu kết quả cũ và chốt lại có lịch sử.
- Tiền công dự kiến theo công thức đã xác nhận, độc lập giá bán khách hàng và lương phải trả.
- AND-Join và hoàn thành công đoạn kiểm tra ở backend, không chỉ disable UI. Không tự bắt đầu/hoàn thành theo tiến độ.

## 2. Giao diện và tham chiếu thiết kế

Tái sử dụng Ant Design 6, theme, editor master–detail và dnd-kit đã có. Editor giữ grip nhỏ nền trong suốt, stable ID, không menu ba chấm/lên xuống/nhãn công đoạn bắt đầu; bổ sung tóm tắt thời lượng bên trái và một ô thời lượng bên phải. Không có tên/mô tả workflow hay preview UI. DatePicker dùng locale vi-VN hiện có với format DD/MM/YYYY HH:mm. Các bảng dài có vùng cuộn riêng; layout tổng thể không có min-width cứng.

Tham chiếu visual/component tiếp tục dựa trên node Figma `179964:13387` đã đọc design context và screenshot trong Phase 01. Cấu trúc màn hình v2 tuân theo đặc tả mới, không sao chép bố cục Figma cũ. Chưa kiểm chứng pixel-perfect hoặc screenshot của bản chạy hiện tại.

## 3. API cập nhật

Các endpoint cũ được giữ, DTO mở rộng tương thích:

| Endpoint | Thay đổi |
| --- | --- |
| PATCH `/design-model-groups/:id/production-workflow` | steps nhận estimatedDurationMinutes nullable |
| PATCH `/design-models/:id/production-workflow` | cùng trường thời lượng, giữ INHERIT/CUSTOM |
| GET `/production-batches/workflow-preview` | bổ sung standard_weight_per_unit_g; tên API nội bộ giữ để tương thích, UI không có preview riêng |
| POST `/production-batches` | nhận workflow bản nháp và planned_start_at/planned_end_at; kiểm tra source_version; snapshot trọng lượng chuẩn lúc tạo |
| PATCH `/production-batches/:id` | sửa planned datetime/ghi chú theo quyền kể cả đã thực thi; số lượng không được đổi sau khi có nghiệp vụ |
| PATCH `/production-batches/:id/workflow` | cho thêm/sửa bước chưa có nghiệp vụ, reorder hiển thị; không đổi cấu hình/dependency hoặc xóa bước được bảo vệ |
| POST `/production-batches/:id/execution/stages/:stepId/assignments` | quantity_mode SET/ADD; số lượng dương, cap tổng, audit/event, đơn giá áp dụng |
| POST `/production-batches/:id/execution/stages/:stepId/outputs` | đúng một phân công/phiếu mới; không vượt quota |
| POST `/production-batches/:id/execution/stages/:stepId/materials` | thêm RETURN_TOTAL dành cho vàng; cho số nhận lớn hơn số giao để biểu diễn Heo |
| POST `/production-batches/:id/execution/stages/:stepId/reconciliation` | API mới: CLOSE/REOPEN, employee_id, reason, materials_reviewed, version, request_id |
| GET `/production-batches/:id/execution` | thêm định mức/khối lượng lô, giá công dự kiến từng thợ, tổng vàng và projection/lịch sử đối soát/giao việc |

Permission mới `production.reconciliation.manage`. Quyền tạo/sửa/phân công/giao nhận/thực thi hiện có tiếp tục áp dụng. Mọi mutation nghiệp vụ vẫn dùng request UUID + intent hash, optimistic version, advisory lock và transaction/audit cùng nhau. Source workflow và các dữ liệu confirmed không được sửa ngầm.

## 4. Prisma / migration

Migration bổ sung `migrations/sql/20261029_production_v2.sql`, runner `scripts/migrate-production-v2.mjs --local`, đã áp dụng **localhost**. Không reset/seed hoặc áp dụng production; không sửa migration đã áp dụng trước đó.

- production_batches: standard_weight_per_unit_g nullable, planned_start_at/planned_end_at timestamptz và CHECK end > start nếu đủ hai mốc.
- batch_steps: estimated_duration_minutes nullable.
- batch_assignments: applied_labor_rate_per_15g NUMERIC(20,4) nullable.
- batch_assignment_events: lịch sử SET/ADD, delta/tổng và snapshot trước/sau, actor/time; append-only.
- batch_worker_reconciliations: trạng thái hiện hành OPEN/CLOSED/ADJUSTING, các tổng vàng và kết quả chốt, người/thời điểm chốt.
- batch_reconciliation_events: CLOSE/REOPEN, reason, before/after, actor/time; append-only.
- Mở rộng CHECK loại giao nhận để nhận RETURN_TOTAL. Trigger bảo vệ nguồn lô mở rộng để giữ trọng lượng snapshot bất biến.

contract.prisma được mở rộng; contract.json/contract.d.ts đã emit lại. Repo sử dụng Prisma 8 RC contract + explicit SQL migrations; CHECK/trigger được quản lý bằng SQL theo kiến trúc hiện có.

## 5. Effective workflow và bảo vệ snapshot

INHERIT vẫn resolve động từ nhóm, CUSTOM vẫn độc lập. estimatedDurationMinutes đi theo definition JSONB, được normalize thành null khi dữ liệu cũ thiếu trường. Không bulk-copy/sync vào các mẫu đang kế thừa.

Tạo lô khóa source catalog, kiểm tra source_version từ bản nguồn đã đọc và sao chép bản draft đã validate thành snapshot của lô trong một transaction. Một lô đúng một mẫu, không tạo/liên kết Đơn hàng. Mẫu thiếu effective workflow vẫn cần cấu hình nguồn trước theo baseline đã có.

Thay đổi quy trình lô tạo snapshot revision mới. Công đoạn có execution_started_at hoặc execution_locked_at không thể bị xóa/đổi tên, giá, thời lượng, hướng dẫn, cờ xác nhận hoặc dependencies. Được reorder hiển thị vì không đổi thực thi; được thêm bước mới hoặc sửa bước chưa phát sinh. Backend so sánh cấu hình, chuẩn hóa đơn giá bằng decimal units và validate DAG. UI khóa form của bước được bảo vệ, server là lớp quyết định cuối.

Không backfill định mức cho lô cũ từ giá trị Mẫu mã hiện tại vì đó không phải snapshot tại thời điểm tạo. Lô cũ thiếu trọng lượng hiển thị thiếu dữ liệu quy đổi/tiền công dự kiến. Ngày kế hoạch date-only cũ được giữ trong database, không tự gán giờ.

## 6. Giao việc và sản lượng

Assignment giữ unique batch + step + employee; ADD cộng thêm số lượng, SET điều chỉnh tổng, cả hai ghi event. Cap tính tổng tất cả quota trong công đoạn, bao gồm quota cũ chưa được điều chỉnh; không tự giải phóng phần việc khi hủy vì chưa có rule xử lý công việc dang dở. Không giảm dưới số lượng đã hoàn thành.

Phiếu v2 chỉ gắn một thợ; mỗi phiếu cộng một lần vào công đoạn và một lần vào quota của người đó. Phiếu multi-contributor lịch sử từ Phase 03 không bị sửa/xóa hoặc diễn giải lại. Nếu dữ liệu cũ có tổng quota vượt sản lượng lô, backend chặn hoàn thành/giao thêm và yêu cầu xử lý nghiệp vụ, không tự chia lại kết quả cũ.

Chưa có partial-flow rule giữa công đoạn khi nguồn đang thực hiện, nên transfer khác công đoạn bị chặn cho đến khi nguồn COMPLETED. AND-Join vẫn kiểm tra đầy đủ trước START/RESUME. Chuyển nguyên liệu giữa thợ cùng công đoạn dùng bút toán đối ứng như trước, không đổi dependencies.

## 7. Hao/Heo và đối soát

Tổng giao vàng của một thợ/công đoạn gồm INITIAL + ADDITIONAL + TRANSFER_IN sau tác động của reversal. Tổng nhận gồm RETURN_UNUSED + RETURN_TOTAL + RECEIVE_PRODUCT + TRANSFER_OUT sau reversal. Như vậy chuyển nội bộ được cân đối, không cộng thành giao mới bên ngoài lô.

Khi CLOSE, backend yêu cầu:

1. Có quota dương và số hoàn thành bằng tổng được giao.
2. Quản lý gửi materials_reviewed=true sau khi kiểm tra nguyên liệu.
3. Có lý do/căn cứ và quyền chốt.

Sau đó dùng SQL NUMERIC: difference = received − issued. Âm = Hao; dương = Heo; 0 = cân bằng. Kết quả trước CLOSE không hiển thị thành Hao/Heo. Không tự chốt khi đủ sản lượng. Kiểm tra nguyên liệu là quyết định thủ công, không suy diễn rằng số chưa trả chắc chắn là hao.

CLOSED khóa việc giao thêm/đổi quota/ghi sản lượng/giao nhận/đảo nguyên liệu cho thợ đó. REOPEN bắt buộc reason, lưu before/after/actor/time và chuyển ADJUSTING; giữ kết quả cũ trong lịch sử. Khi điều chỉnh, bảng chính chỉ hiện trạng thái, kết quả cũ được ghi rõ là lần chốt trước. CLOSE lại lưu kết quả mới. Mở lại không sửa execution_status hoặc thời điểm hoàn thành của công đoạn, không làm thay đổi eligibility của công đoạn phụ thuộc.

Gold có thể nhận lớn hơn giao để hỗ trợ Heo. Không áp dụng công thức này cho bạc/đá quý; cân đối và bút toán thủ công non-gold hiện có được giữ. API ghi hao vàng riêng cũ từ chối ghi mới ở v2 để không tạo hai kết quả mâu thuẫn; các bản ghi hao vàng cũ vẫn nguyên vẹn. Không tự phát sinh tiền lương hoặc sửa bút toán lương từ close/reopen.

Hoàn thành công đoạn phải được thao tác thủ công và có đủ sản lượng dự kiến, mọi thợ đủ quota và CLOSED. Không dùng requiresEmployeeConfirmation để khóa hoàn thành. Mở lại đối soát của bước COMPLETED không mở lại sản xuất hoặc chặn nhánh sau.

## 8. Tiền công dự kiến

Định mức weight_g từ mẫu được chụp bất biến khi tạo lô; applied rate được lấy từ cấu hình công đoạn khi giao việc, không có override nhân viên mới. Projection dùng:

`round(assignedQuantity × standardWeightPerUnit × appliedLaborRatePer15g / 15, 4)`

NUMERIC ở backend; frontend chỉ cộng các giá trị decimal bằng BigInt, không tính tiền bằng float. Tổng công đoạn và tổng lô là tổng khoản dự kiến của các thợ. Thiếu weight/rate/quota trả null và hiển thị chưa đủ định mức; 0 hợp lệ. Đơn giá áp dụng của phân công cũ nếu thiếu trường mới chỉ dùng fallback cấu hình stage đã được bảo vệ; không sửa khoản lương ghi nhận cũ.

Đây là dự kiến cho phần việc đã giao, không phải lương phải trả. Các bản ghi tiền công thực tế thủ công được giữ riêng. Không dùng giá công nhóm/khách hàng, không tự khấu trừ Hao/Heo hoặc duyệt/chốt/chi lương.

## 9. Planned / actual timestamps

DatePicker showTime gửi ISO UTC có timezone; backend kiểm tra timestamp hợp lệ có offset/Z, lưu timestamptz. Hai trường nullable độc lập; nếu đủ hai mốc thì end phải **sau** start. Không tự tính end hoặc deadline từ thời lượng.

actual_start của lô và execution_started_at của bước ghi khi START đầu tiên. execution_finished_at ghi khi quản lý COMPLETE. actual_end toàn lô vẫn nullable vì chưa có quy tắc chốt trạng thái toàn lô; không tự đặt từ trung bình tiến độ hoặc nhánh cuối. Reopen reconciliation không thay đổi actual timestamps của công đoạn.

## 10. Build và giới hạn xác minh

- Backend Nest build: đạt.
- Frontend TypeScript/Vite build: đạt; còn cảnh báo bundle >500kB.
- Prisma contract emit: đạt; cảnh báo index users_live_employee_unique và skill sync có sẵn vẫn còn.
- Migration localhost đã áp dụng; backend cổng 3000 được nạp lại để dùng API và permission mới.
- Không viết/chạy unit, integration, E2E hoặc test suite/phase kiểm thử riêng. Chưa kiểm chứng các luồng UI/API nghiệp vụ ở runtime hoặc responsive bằng trình duyệt.

## 11. Nghiệp vụ chưa thể hoàn thiện an toàn

- Repo chưa có nguồn tồn kho thành phẩm hoạt động để tích hợp. Chưa tạo bút toán nhập kho thật, giữ hàng cho Order hoặc nối Order trực tiếp với lô. Không coi receipt nguyên liệu là nhập kho thành phẩm.
- Quy trình QA/đạt/lỗi, điều kiện nhập kho từng phần, sửa/làm lại, hủy/kết thúc lô và đảo nhập kho chưa đủ rule. Không đưa UI giả hoặc thao tác không thể đảo ngược vào luồng.
- Chưa có xử lý chia lại/sửa/đảo sản lượng cũ multi-contributor và công việc dang dở khi hủy quota. Các trường hợp này được chặn khi không đáp ứng invariant mới, không tự thay lịch sử.
- Chưa có nhập bổ sung định mức cho lô cũ một cách có xác nhận. Dữ liệu snapshot thiếu được hiển thị rõ.
- Chưa có rule hợp thức hóa lương đã khóa khi đối soát thay đổi, duyệt/chốt lương, chi lương, ký xác nhận hoặc AI. Không tự tính deadline.
- Form cảnh báo khi đóng/hủy và reload trình duyệt; chưa có guard chung cho mọi điều hướng SPA/browser-back.
- Lịch sử vận hành vẫn tải trọn lô rồi phân trang client như Phase 03; chưa tối ưu rất nhiều giao dịch bằng API pagination riêng.

## 12. File thêm/sửa

Backend:

- `src/catalog/production-workflow.dto.ts`, `production-workflow.service.ts`
- `src/production/production.dto.ts`, `production.service.ts`
- `src/production/execution.dto.ts`, `execution.service.ts`, `execution.controller.ts`
- `src/auth/permission-catalog.ts`
- `src/prisma/contract.prisma`, `contract.json`, `contract.d.ts`
- `migrations/sql/20261029_production_v2.sql` (mới)
- `scripts/migrate-production-v2.mjs` (mới)
- `migrations/sql/README.md`
- `docs/production-module-v2.md` (mới)

Frontend:

- `src/features/catalog/duration.ts` (mới)
- `src/features/catalog/ProductionWorkflow.tsx`, `ProductionWorkflowEditor.tsx`
- `src/features/production/BatchCreate.tsx` (thay modal bằng trang riêng)
- `src/features/production/BatchPlanFields.tsx`, `BatchPlanEdit.tsx`, `api.ts`
- `src/features/production/executionApi.ts`, `ExecutionForm.tsx`
- `src/features/production/StageOperations.tsx` (mới)
- `src/pages/ProductionBatchesPage.tsx`, `ProductionBatchDetailPage.tsx`
- `src/app/router/PageRouter.tsx`

Các báo cáo Phase 01–03 ghi lại lịch sử triển khai; báo cáo này là mô tả hành vi v2 hiện tại.
