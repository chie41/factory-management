# Form Thêm giao dịch và kiểm thử UI — 12/10/2026

## Thay đổi

- `AddTransactionModal`: modal giữa viewport, chọn loại trước; chỉ hỗ trợ Giao hàng/Trả vàng. Chưa chọn thì không render form riêng. Footer luôn nhìn thấy, nội dung cuộn riêng, khóa submit/chuyển loại khi lưu.
- `DeliveryTransactionFields`: nhóm tham chiếu/đơn hàng, khách/ngày giao, người giao dịch/loại, chi tiết hàng và tổng giao dựa trên frame sửa Giao hàng. Create/Edit dùng chung fields.
- `GoldReturnTransactionFields`: tách và tái sử dụng fields Trả vàng hiện có. Mỗi loại mount riêng, có draft key riêng; đổi loại có xác nhận bỏ dữ liệu.
- `LedgerEntryForm`: giữ service, validation decimal/fixed-point, mutation và cache invalidation; khóa submit bằng ref; edit chỉ gửi trường thay đổi. Context khách chi tiết khóa theo UUID, Tổng hợp chọn khách qua GET thật.
- `LedgerDateTimeInput`: DatePicker giữ giá trị ngày giờ trong form; Enter xác nhận ngày không submit cả form.
- `CustomerLedgerTabs`: Tổng hợp cố định bên trái, không bị cuộn khuất khi có nhiều sổ.

Figma dùng: [CUS-LEDGER-03B sửa Giao hàng](https://www.figma.com/design/3rFXFMYr9fNCS8uPMur6Rf?node-id=179639-1553), các child `179639:2276`, `179639:2304`, `179639:2352`; [04B thêm Trả vàng từ Tổng hợp](https://www.figma.com/design/3rFXFMYr9fNCS8uPMur6Rf?node-id=179655-1698), cùng 04A/03D đã audit trong README. Create khác Edit ở modal giữa màn hình/chọn loại/chọn khách từ Tổng hợp, dữ liệu ban đầu và POST; Edit giữ drawer và PATCH, điền dữ liệu thật.

## API và giới hạn

Tái sử dụng POST `/customer-ledger/customers/:customerId/entries`, PATCH `/customer-ledger/entries/:id`, GET summary/book/entry và GET customers. Backend development port 3003, FE port 5178. Bearer JWT và xử lý lỗi chung. Không đổi công thức, database schema hoặc tạo migration trong lần này.

**Chưa hoàn thành form Giao hàng đầy đủ như prototype:** backend chỉ lưu tổng vàng/tiền công, không có dòng hàng, nguồn đơn/giao hàng hoặc người giao dịch. Vì vậy danh sách hàng/đơn/người nhận/chứng từ hiển thị giới hạn rõ ràng, không nhập dữ liệu rồi bỏ mất khi lưu. Giao hàng đã kiểm thử là **giao dịch thủ công theo tổng vàng**, không phải phiếu giao hàng liên kết đơn. Mã GH/DH trong ghi chú chỉ mô tả mẫu kiểm thử, không được gửi thành reference ID. Chưa nghiệm thu chống ghi nhận trùng từ module giao hàng nguồn; cần contract nguồn, dòng hàng và cơ chế idempotency/unique liên kết ở BE. Khóa UI chỉ ngăn thao tác lưu lặp trong form hiện tại.

Để hoàn thiện cần endpoint/catalog thật và lưu atomically dòng hàng + tổng, ID đơn/giao hàng đã kiểm tra thuộc khách, người giao dịch và chứng từ. Không suy ra công thức mới từ các con số mẫu Figma. Xem bảng contract đề xuất trong README.

## Dữ liệu thật được tạo hoàn toàn qua UI

Database cấu hình localhost, app development. Không gọi API tạo thủ công, không INSERT, seed hoặc hardcode. Giữ nguyên 6 khách cũ và giao dịch có sẵn. Tạo thêm **6 khách và 15 giao dịch: 7 Giao hàng, 8 Trả vàng**. Mã do BE sinh, không ép mã KH-001… của Figma.

| Khách | Mã thật | Số giao dịch | Nợ vàng cuối | Nợ tiền công cuối |
| --- | --- | ---: | ---: | ---: |
| Tiệm vàng Minh Anh | KH000007 | 4 | 324,9600 g | 11.500.000 VND |
| Kim Phát Jewelry | KH000008 | 2 | 150,0000 g | 0 VND |
| Vạn Phúc | KH000009 | 2 | 0 g | 3.500.000 VND |
| Phú Quý | KH000010 | 2 | 0 g | 0 VND |
| An Khang | KH000011 | 2 | 100,0000 g | 500.000 VND |
| Latsamy | KH000012 | 3 | 25,0000 g | 0 VND |

Minh Anh tạo giao 562,56 g/tiền công 12,5 triệu, trả vàng 420 g, giao tiếp 182,4 g. Đã sửa lần trả 420 → 400 g, tiền công đã trả 0 → 1 triệu; thêm trả 20 g từ Tổng hợp. Các khách còn lại dùng số hợp lý kiểm tra từng loại công nợ vì prototype không cung cấp đủ giao dịch. An Khang có 2 giao dịch ngày 12/10/2026 để kiểm tra thống kê hôm nay. Mỗi khách có ghi chú nhận diện E2E development.

## Kết quả đã chạy

- Tạo 6 khách qua form Khách hàng, nhận mã thật từ response.
- Thêm Giao hàng/Trả vàng ở từng sổ; modal đóng; thông báo thành công; vàng/tiền công/số dư hiển thị đúng; xem Tổng hợp, quay lại khách và refresh.
- Đối chiếu lại cả 6 sổ sau refresh/đăng nhập lại: đúng số bản ghi và số dư ở bảng trên. Kết quả DOM lưu trong [ui-e2e-results.json](ui-e2e-results.json).
- Sửa ngày, tiền công đã trả, trọng lượng Trả vàng và ghi chú qua UI; công nợ cập nhật, số bản ghi không tăng.
- Tạo từ Tổng hợp cho Minh Anh đang có tab; dropdown khách dùng API thật. Nhấn lưu liên tiếp tạo đúng 1 bản ghi. Sau thay footer cố định, tạo thêm lần trả 5 g cho Latsamy, refresh thấy đúng 3 giao dịch/25 g.
- Validation chặn tiền đã trả > phải trả và trọng lượng âm; dữ liệu vẫn trong form.
- Đổi loại có xác nhận: hủy giữ 999 g/ghi chú ở Giao hàng, chấp nhận chuyển Trả vàng trở về 0/ghi chú rỗng. Hủy không tạo giao dịch; nháp được khôi phục rồi bỏ qua UI.
- Mở nhiều tab, chuyển đúng dữ liệu, mở lại Minh Anh không thêm tab (7 trước/sau), đóng active Kim Phát chuyển sang tab bên cạnh, mở lại Kim Phát đứng ngay sau Tổng hợp.
- Phiên JWT hết hạn trong lượt kiểm tra dài: về đăng nhập; đăng nhập lại, bản ghi vẫn tồn tại.
- Desktop 1440×1024, mobile 390×844: modal nằm giữa; mobile rộng 366px, trang scrollWidth=390px. Footer cố định, body cuộn riêng. Ảnh trong `screenshots/add-delivery-e2e-1440.png`, `add-delivery-e2e-390.png`, `add-summary-e2e-1440.png`, `summary-e2e-1440.png`.
- FE build/TypeScript và lint đạt; 12 tests hiện có đạt. Build vẫn cảnh báo chunk Ant Design >500kB.

Chưa chạy: form dòng hàng/liên kết đơn/chứng từ/người nhận (thiếu contract), failure injection HTTP/network trong browser và kiểm thử đồng thời từ nhiều client. Không báo các mục này đã đạt. Không sửa dữ liệu production hoặc reverse giao dịch thật có sẵn.

## Xem và chạy

Phiên đang chạy: http://localhost:5178/#/ledger. Tổng hợp để 20 khách/trang để thấy đủ dữ liệu cũ và mới. Mở sổ theo tên/mã thật bên trên.

Chạy lại: trong backend `npm run build`, `$env:NODE_ENV='development'`, `$env:PORT='3003'`, `node dist/main.js`; trong frontend `$env:API_PROXY_TARGET='http://localhost:3003'`, `npm run dev -- --host 127.0.0.1 --port 5178`. Dùng `.env` hiện có, không chạy seed/migration. FE kiểm tra: `npm run lint`, `npm run build`, `npm test`.
