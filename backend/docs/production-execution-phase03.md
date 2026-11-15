# Phase 03 — Production Execution

## Chức năng hoàn thành

Tab Quy trình có graph DAG tuần tự/song song, trạng thái và sản lượng của từng công đoạn, danh sách dependency đang chờ, thời điểm bắt đầu/kết thúc, các thao tác bắt đầu/tạm dừng/tiếp tục/hoàn thành và ghi phiếu sản lượng. Graph và bảng dùng trạng thái thật từ backend, không đọc động từ quy trình mẫu.

AND-Join đã được người dùng xác nhận chính thức trong phiên này: bắt đầu/tiếp tục chỉ được phép khi **tất cả** dependency đã COMPLETED. Công đoạn không có dependency không bị chặn. Các nhánh không phụ thuộc nhau chạy độc lập. Backend kiểm tra lại dưới transaction lock; UI chỉ disable là lớp hỗ trợ. Không tự hoàn thành công đoạn khi đạt sản lượng và không tự hoàn thành toàn lô.

Tab Phân công dùng nhân viên thật từ module Nhân viên. Một công đoạn có nhiều phân công, mỗi nhân viên một bản phân công được điều chỉnh có audit trước/sau. Có số lượng giao tùy chọn, ngày phân công, trạng thái, số lượng tham gia và ghi chú. Có thể phân công trước khi công đoạn bắt đầu. Để chia việc, lập các phiếu sản lượng riêng cho từng phần việc; để ghi nhận cùng làm một sản lượng, chọn nhiều phân công trên cùng phiếu.

Sản lượng công đoạn được cộng **một lần cho mỗi phiếu**, không cộng từ các số tham gia của thợ. Mỗi thợ được chọn có một contribution bằng số lượng phiếu, thể hiện cùng tham gia; không được cộng các contribution để suy ra số lượng thành phẩm. Mã phần việc/phiếu là duy nhất trong một công đoạn, cộng thêm request deduplication và cap theo số lượng dự kiến để tránh ghi trùng/vượt. Người ghi cần dùng cùng mã phần việc cho cùng thực tế sản xuất; chưa có serial thành phẩm hoặc cơ chế tự nhận diện hai phiếu khác mã nhưng trùng sản phẩm vật lý.

Tab Nguyên liệu hỗ trợ giao ban đầu, giao bổ sung, nhận thừa, nhận sản phẩm/bán thành phẩm theo nguyên liệu, chuyển nội bộ và đảo bút toán. Vàng/bạc ghi gram; đá quý/khác ghi G, PCS hoặc CARAT, không quy đổi. Không có trường tuổi vàng. Mỗi ghi nhận là một loại nguyên liệu/đơn vị; có thể ghi nhiều lần cho cùng thợ/công đoạn.

Chuyển nội bộ tạo TRANSFER_OUT và TRANSFER_IN trong một transaction, giữ nguyên loại/đơn vị/số lượng, không ghi thành giao mới vào lô. Có thể chuyển giữa công đoạn hoặc giữa hai thợ trong cùng công đoạn. Đảo một vế chuyển sẽ đảo **cả hai vế**, chỉ khi không gây âm số dư. Sửa sai thực hiện bằng đảo và ghi lại, không sửa/xóa dòng gốc.

Tab Hao hụt có đối soát theo lô, công đoạn, nhân viên và loại nguyên liệu/đơn vị. Hao hụt là số ghi nhận thủ công có căn cứ, không phải lượng tự tính từ nguyên liệu chưa trả. Có bút toán tăng và giảm liên kết dòng gốc; khi thu hồi phần đã xác định hao, ghi giảm hao hụt rồi ghi nhận trả nguyên liệu. Không tự khấu trừ lương.

Tab Tiền công ghi số tiền Baht thủ công, đơn giá tham chiếu (gợi ý từ snapshot nếu có), căn cứ/cách tính, phiếu sản lượng liên quan nếu có và nhân viên. Có ghi giảm liên kết khoản gốc, không giảm quá khoản gốc. Không tính từ giá công bán khách hàng; không suy diễn công thức từ đơn giá /15g. Trạng thái RECORDED chỉ là đã ghi nhận, chưa phải duyệt/chốt hoặc chi trả.

Tab Lịch sử ghi action, actor, thời điểm và nội dung trước/sau, gồm điều chỉnh phân công, trạng thái, sản lượng và bút toán. Dữ liệu giao nhận, sản lượng/contribution, hao hụt, tiền công và request ledger có trigger append-only.

## Đối soát và độ chính xác

Mỗi nhóm `(lô, công đoạn, nhân viên, loại nguyên liệu, tên nguyên liệu, đơn vị)` có:

- Giao ban đầu; giao bổ sung; nhận thừa; nhận SP/BTP; chuyển đến; chuyển đi.
- Chưa nhận lại = giao ban đầu + bổ sung + chuyển đến − nhận thừa − nhận SP/BTP − chuyển đi.
- Hao hụt đã ghi nhận = tổng tăng − tổng giảm.
- Số còn lại sau phần hao hụt ghi nhận = chưa nhận lại − hao hụt đã ghi nhận.

Đây là cân đối bút toán, **không phải công thức tính hao hụt theo vật liệu**. Không gộp các loại/tên nguyên liệu hoặc đơn vị khác nhau. Tổng hợp toàn lô vẫn tách chuyển nội bộ khỏi giao bên ngoài. Cột “Chưa nhận lại” có thể gồm phần đã xác định hao; cột còn lại không được tự coi là hao hụt. Bút toán làm âm cân đối hoặc hao hụt bị rollback. Đơn giá/trọng lượng/số tiền dùng NUMERIC(20,4) và decimal string; frontend chỉ cộng tổng bằng BigInt, không dùng float cho tiền/nguyên liệu.

Sản lượng PCS là số nguyên. Nhiều người cùng một phiếu không làm tăng tổng sản lượng công đoạn. Sản lượng giữa các công đoạn cũng không được cộng để coi là thành phẩm toàn lô.

## API và permissions

Prefix `/api/v1/production-batches/:id/execution`:

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/` | production.read |
| POST | `/stages/:stepId/action` | production.execution.manage |
| POST | `/stages/:stepId/assignments` | production.assignments.manage |
| POST | `/stages/:stepId/outputs` | production.output.manage |
| POST | `/stages/:stepId/materials` | production.materials.manage |
| POST | `/stages/:stepId/transfers` | production.materials.manage |
| POST | `/material-reversals` | production.adjustments.manage |
| POST | `/stages/:stepId/losses` | production.losses.manage |
| POST | `/stages/:stepId/labor` | production.labor.manage |

Mọi POST có `request_id` UUID + `version` từ GET. Backend kiểm tra permission trong transaction, cùng advisory lock `factory:production` với Phase 02. Cùng request, actor, batch và payload trả kết quả cũ, không cộng lại. Dùng request ID cũ với ý định khác trả conflict. Kiểm tra idempotency trước version để retry sau network error không bị ghi trùng. Bút toán, projection, audit, batch revision và request result commit/rollback cùng nhau.

GET trả stage/dependency/waiting_for, phân công, outputs/contributors, giao nhận, đối soát, hao hụt, tiền công và tổng tiền công theo thợ/công đoạn. UI phân trang client cho các bảng lịch sử vận hành, refetch cùng cache key mỗi 15 giây. Form giữ snapshot version khi mở; conflict không ghi đè và không xóa nội dung đang nhập. Có thể đóng/mở lại form để nhận phiên bản mới sau khi lưu lại nội dung cần giữ. Lịch sử audit gốc vẫn phân trang server như Phase 02.

## Snapshot và guard cấu hình

Không cập nhật template Phase 01 hoặc các snapshot JSONB của lô. Mỗi công đoạn có execution_status, completed_quantity, thời điểm bắt đầu/kết thúc trong projection thực thi. `execution_locked_at` tách khỏi thời điểm bắt đầu thực tế: phân công hoặc giao nhận trước công đoạn cũng khóa việc sửa workflow/kế hoạch để bảo vệ dữ liệu. Phase 02 detail/guards đã đọc marker này. Transfer cũng khóa công đoạn đích.

Các bảng thực thi tham chiếu stable `(batch_id,step_id)` với FK RESTRICT. Kéo thả thứ tự không thay dependency; khi đã phát sinh nghiệp vụ thì không được sửa cấu hình vì chưa có quy tắc chỉnh workflow đang chạy. Bắt đầu công đoạn ghi actual_start của lô nếu chưa có; không tự chuyển trạng thái tổng thể của lô hoặc chốt actual_end toàn lô.

## Migration / Prisma

Migration bổ sung `migrations/sql/20261029_production_execution.sql`, runner `scripts/migrate-production-execution.mjs --local`. Đã áp dụng thành công vào PostgreSQL localhost; không reset/seed hoặc áp dụng production.

Thêm các cột thực thi vào `batch_steps`, và các bảng:

- `batch_execution_requests`
- `batch_assignments`
- `batch_outputs`
- `batch_output_contributions`
- `batch_material_movements`
- `batch_loss_entries`
- `batch_labor_entries`

Không tạo lại bảng Nhân viên hoặc Kho. `contract.prisma` mở rộng tương ứng và đã emit lại contract.json/contract.d.ts. SQL quản lý FK/check/trigger append-only theo conventions Prisma 8 RC hiện có.

## Quy tắc chưa chốt / giới hạn có chủ đích

- AND-Join đã chốt. Chưa có quy tắc hoàn thành thiếu sản lượng/phế phẩm/làm lại hoặc mở lại công đoạn đã hoàn thành. Hiện chỉ cho xác nhận COMPLETE thủ công khi sản lượng đã bằng số lượng dự kiến; không cho ghi vượt hoặc đảo/sửa phiếu sản lượng khi chưa có rule. Muốn hoàn thành thiếu cần chốt nghiệp vụ, không tự bỏ qua điều kiện.
- Chưa có state machine tổng thể của lô. Trạng thái batch vẫn độc lập với các stage; không tự suy ra hoàn thành lô từ nhánh cuối hoặc tổng các nhánh song song.
- Chưa có công thức trả công theo gram, số lượng, làm chung hoặc tỷ lệ chia. Người dùng ghi số tiền và căn cứ; contribution không phải tỷ lệ trả lương.
- Chưa có duyệt/chốt lương, trừ hao vàng, thu hồi khấu trừ, chi lương hoặc đồng bộ Sổ lương. Backend Nhân viên hiện có CRUD, chưa có nghiệp vụ payroll phù hợp để nối thanh toán.
- Chưa có xác nhận thiết bị/chữ ký, duyệt giao nhận, duyệt hao hụt hoặc duyệt tiền công. `confirmed_by` được để null; UI không giả báo nhân viên đã xác nhận. Cờ requiresEmployeeConfirmation trong snapshot vẫn chỉ là cấu hình tương lai.
- Nhận SP/BTP ghi lượng nguyên liệu trong sản phẩm; số lượng sản phẩm PCS đi qua phiếu sản lượng riêng. Chưa nhập kho thành phẩm hoặc tồn kho chung.
- Lịch sử vận hành GET hiện tải trọn lô rồi phân trang ở UI; chưa tối ưu lịch sử rất lớn bằng các endpoint phân trang độc lập.
- Chưa triển khai guard điều hướng SPA chung cho các form vận hành; đóng/hủy modal và reload trình duyệt có cảnh báo bản nháp.

## File thêm/chỉnh sửa

Backend:

- `src/production/execution.dto.ts`, `execution.service.ts`, `execution.controller.ts` (mới)
- `src/production/production.module.ts`, `production.service.ts`
- `src/auth/permission-catalog.ts`
- `src/prisma/contract.prisma`, `contract.json`, `contract.d.ts`
- `migrations/sql/20261029_production_execution.sql` (mới)
- `scripts/migrate-production-execution.mjs` (mới)
- `migrations/sql/README.md`
- `docs/production-execution-phase03.md` (mới)

Frontend:

- `src/features/production/executionApi.ts`, `ExecutionGraph.tsx`, `ExecutionForm.tsx`, `BatchExecutionSection.tsx` (mới)
- `src/features/production/BatchHistory.tsx`
- `src/pages/ProductionBatchDetailPage.tsx`

## Build và vận hành

Backend build, frontend TypeScript/Vite build và Prisma contract emit đạt. Frontend còn cảnh báo bundle >500kB; Prisma còn cảnh báo index users_live_employee_unique và skill sync như trước. Không viết/chạy automated test, unit/integration/E2E hoặc phase kiểm thử riêng. Chưa xác minh UI/API ở runtime.

Khởi động lại backend để nạp code, contract và permission catalog. ADMIN được đồng bộ theo cơ chế sẵn có; tài khoản khác cần cấp production.* tương ứng, và employees.read để tìm nhân viên khi thêm phân công. Tải lại phiên để nhận quyền. Production phải dùng deployment process áp dụng migration trước khi chạy bản mới.
