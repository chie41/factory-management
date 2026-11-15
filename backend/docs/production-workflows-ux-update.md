# Phase 01 update — Chi tiết nhóm và cấu hình công đoạn

## Luồng UI đã triển khai

Danh sách Nhóm mẫu mã giữ tìm kiếm, thêm nhóm, tên, số mẫu, giá công và phân trang. Nhấn tên nhóm hoặc **Xem chi tiết** để mở modal chi tiết. Xóa vẫn theo permission và ràng buộc tham chiếu hiện có.

Modal chi tiết mở ở chế độ xem, hiển thị tên, số mẫu, giá công nhóm, thời điểm/người tạo và cập nhật, cùng toàn bộ công đoạn. Footer **Đóng / Chỉnh sửa nhóm**. Chỉnh sửa chuyển ngay modal hiện tại sang edit, với **Hủy / Lưu thay đổi**. Không mở modal cấu hình workflow lồng bên trong. Form chưa lưu chỉ nằm trong state; có xác nhận khi đóng/hủy bản nháp, cảnh báo reload trình duyệt, trạng thái đang lưu và lỗi lưu được giữ tại form.

Danh sách công đoạn dùng chung cho nhóm và mẫu: thẻ có số thứ tự, tên, hướng dẫn, dependency, giá công và cờ xác nhận. Edit có Select nhiều dependency, TextArea, ô số tiền dùng component hiện có, Checkbox, nhân bản/xóa/đưa lên/đưa xuống và nút thêm cuối danh sách. Dependency và thứ tự trình bày độc lập; không cho xóa bước còn bước khác phụ thuộc.

Mẫu mã sửa công đoạn trực tiếp trong section, không còn editor modal. INHERIT chỉ đọc; CUSTOMIZE sao chép effective definition trên server và mở chỉnh sửa trực tiếp. CUSTOM không tự nhận thay đổi nhóm. Khôi phục cần xác nhận. Đóng drawer mẫu khi có bản nháp sẽ cảnh báo.

Đã bỏ tên/mô tả workflow, preview/tab preview và màn hình workflow riêng. Metadata revision vẫn ở backend. API lịch sử vẫn hoạt động; lịch sử không bị xóa.

Style tiếp tục dùng Card/Form/Modal/Tag/Checkbox/Select và theme Ant Design 6 hiện có, tham chiếu design context/screenshot node `179964:13387` đã đọc trong Phase 01. Bố cục và luồng theo đặc tả cập nhật. Không có ảnh UI bổ sung trong tệp yêu cầu; chưa xác minh ảnh ứng dụng đang chạy hoặc pixel-perfect.

## API và lưu nguyên tử

Tái sử dụng `PATCH /api/v1/design-model-groups/:id/production-workflow`. Payload mở rộng:

```json
{
  "version": "workflow-version-from-GET",
  "action": "SAVE",
  "groupInfo": {
    "version": "group-version-from-GET",
    "name": "Tên nhóm",
    "default_labor_price_per_15g": null
  },
  "workflow": {
    "steps": [
      {
        "id": "stable-step-id",
        "name": "Tên công đoạn",
        "description": "",
        "dependencies": [],
        "laborRatePer15g": null,
        "requiresEmployeeConfirmation": false
      }
    ]
  }
}
```

`workflow` được bỏ khỏi request nếu không chỉnh công đoạn; không tạo revision thừa khi chỉ đổi thông tin nhóm. `groupInfo` chỉ được nhận cho SAVE của nhóm. Quyền vẫn là `design_models.groups.manage`; mẫu vẫn dùng `design_models.update`. Không thêm permission hoặc endpoint trùng lặp.

Backend kiểm tra cả group version và workflow version dưới advisory lock `factory:catalog`; validate DTO/DAG, cập nhật nhóm và thêm revision trong cùng transaction với audit. Bất kỳ lỗi nào đều rollback toàn bộ. Trùng tên nhóm trả conflict. UI chỉ thông báo thành công sau khi request hoàn tất, không có hai lần lưu riêng có thể thành công một phần.

Các API Phase 01 cũ vẫn nhận workflow có metadata name/description. Hai trường này nay tùy chọn; metadata đã có được giữ khi lưu request không gửi chúng. Không tạo tên/mô tả giả để vượt validation. Hướng dẫn công đoạn cũng tùy chọn.

## Database và dữ liệu mới

Không cần migration hoặc thay đổi Prisma schema: definition hiện tại là JSONB và đã hỗ trợ mở rộng thuộc tính từng step.

- `laborRatePer15g`: chuỗi decimal chính xác trong JSONB, không chuyển sang JavaScript float. Cấu trúc tương đương decimal với validator tối đa 16 chữ số nguyên và 4 chữ số thập phân, không âm. `null` hoặc thiếu là chưa cấu hình; chuỗi `"0"` là giá 0 có cấu hình. UI dùng LedgerDecimalInput hỗ trợ định dạng số hiện có. Mỗi lần thay đổi được lưu trong revision mới.
- `requiresEmployeeConfirmation`: boolean trong definition. Dữ liệu cũ thiếu trường được resolver đọc thành `false`; giá thiếu thành `null`. Không ghi đè/migrate các revision cũ. CUSTOMIZE sao chép các trường này cùng dependencies và hướng dẫn.
- Giá công từng bước chỉ là cấu hình trả thợ tương lai. Không tính tổng để đổi giá nhóm, không đồng bộ giá bán/giá khách hàng và không phát sinh lương.
- Revision, nguồn kế thừa, optimistic concurrency và resolver trung tâm vẫn được giữ. Phase 02 vẫn lấy snapshot effective workflow khi tạo lô; không có thay đổi vào lô sản xuất.

## File thay đổi

- `frontend/src/features/catalog/DesignGroupDetail.tsx` — mới, modal chi tiết và edit chung.
- `frontend/src/features/catalog/DesignGroups.tsx` — danh sách và mở chi tiết.
- `frontend/src/features/catalog/ProductionWorkflow.tsx` — danh sách công đoạn dùng chung và chỉnh trực tiếp cho mẫu.
- `frontend/src/pages/CatalogPage.tsx` — truy cập nhóm theo quyền đọc và cảnh báo bản nháp khi đóng drawer mẫu.
- `backend/src/catalog/production-workflow.dto.ts` — thuộc tính công đoạn mới, metadata optional, payload groupInfo.
- `backend/src/catalog/production-workflow.service.ts` — normalize dữ liệu cũ, lưu chung nguyên tử, giữ metadata và kế thừa động.
- `backend/docs/production-workflows-phase01.md` — dẫn sang báo cáo cập nhật.
- `backend/docs/production-workflows-ux-update.md` — báo cáo này.

## Build và phạm vi chưa triển khai

Frontend TypeScript/Vite build và backend Nest build đạt. Frontend còn cảnh báo bundle lớn hơn 500kB. Không viết/chạy unit, integration hay E2E test; không thực hiện phase kiểm thử riêng. Chưa xác minh UI/API tại runtime. Khởi động lại backend để nạp code mới; không có migration mới phải chạy.

Chưa định nghĩa quy tắc hoàn tất nhánh song song, điều kiện chuyển bước, thời điểm khóa/đổi đơn giá trên lô, cách tính tiền trả thợ hoặc nghiệp vụ xác nhận thiết bị/chữ ký. Chỉ lưu cấu hình xác nhận, không đánh dấu nhân viên đã xác nhận và không bắt xác nhận để hoàn tất bước.
