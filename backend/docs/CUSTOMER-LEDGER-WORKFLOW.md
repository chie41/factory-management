# Bàn giao nghiệp vụ sổ giao dịch khách hàng

## Cập nhật: kế toán nhập giao hàng trực tiếp

Trong form Thêm giao dịch của sổ, người có `customer_ledger.create` và `customer_ledger.approve` nhập giao hàng trực tiếp: khách hàng, ngày giao dịch, vàng thực giao, tiền công gốc và giảm giá. Không cần đơn hay chuyến giao, không tạo đơn/chuyến giả. Chỉ hiện giá trị giảm khi chọn giảm phần trăm hoặc giảm theo tiền. Ngày nghiệp vụ nội bộ lấy từ ngày giao dịch theo múi giờ Việt Nam.

Lưu trực tiếp là ghi nhận đã duyệt bởi kế toán. Nếu có quyền `cash.approve`, kế toán nhập khoản thực thu và xác nhận tỷ giá cho ngoại tệ; cash và sổ được ghi trong cùng transaction, vẫn chặn thu vượt. Thu bổ sung sau đó tiếp tục qua luồng chờ duyệt. Giao hàng theo đơn từ trang giao hàng vẫn dùng luồng khai và duyệt hiện có; form khai cũng chỉ hiện ngày giao dịch.

API bổ sung: POST `/api/v1/customer-ledger/manual-deliveries`. Migration local `20261015_manual_ledger_delivery.sql` cho phép bản khai và khoản thu không có order_id, giữ liên kết ledger_id và khóa chống ghi trùng. Runner `scripts/migrate-manual-ledger-delivery.mjs`. Chi tiết sổ và danh sách còn phải thu hỗ trợ nguồn `MANUAL_DELIVERY`. Trả hàng theo dòng vẫn yêu cầu đơn có dòng nguồn.

Tiền hiển thị số nguyên như `10.000B`; ngày hiển thị/chọn theo `dd/mm/yyyy`. Độ chính xác dữ liệu tiền bên dưới giữ nguyên.

## 1. Quyết định nghiệp vụ đã chốt

- Tiền công sản phẩm và số dư tiền công dùng BAHT (`THB`). Các số tiền cũ gắn nhãn VND là dữ liệu thử ghi sai nhãn: đổi nhãn sang THB, giữ nguyên trị số, ghi audit.
- Tịnh vàng chính thức tính cả giao hàng chờ duyệt. Giao bị đánh dấu sai và giao dịch đã đảo không tham gia số dư.
- Thu bổ sung từ sổ hoặc Thu/Chi đều chờ kế toán duyệt trước khi ghi tiền thực tế.
- Kế toán nhập tổng khoản hoàn, chọn BAHT/KIP/VND và tỷ giá xác nhận. Không phân bổ tiền đã thu hoặc tiền hoàn theo từng dòng hàng.
- Giá mặc định sản phẩm và giá riêng theo khách sẽ do module sản phẩm cung cấp sau. Hiện đơn hàng lưu giá tiền công tại thời điểm lập đơn.

## 2. Nguồn dữ liệu và migration

Trước thay đổi, database chưa có đơn hàng, dòng hàng, chuyến giao, khoản thu nguồn hoặc Thu/Chi. Đã bổ sung dữ liệu nguồn thật qua hai migration SQL, đã áp dụng trên database local cấu hình của dự án:

- `migrations/sql/20261015_ledger_gold_inputs.sql`: đầu vào vàng thu hồi, kết quả chính xác, người tạo và UUID chống ghi lặp.
- `migrations/sql/20261015_ledger_workflow_sources.sql`: đơn/dòng đơn, chuyến giao và liên kết đơn, sự kiện giao, bản khai giao, các lần thu, lịch sử tỷ giá, trả hàng, hoàn tiền, Thu/Chi, kỳ báo cáo và lịch sử tách đơn; trạng thái duyệt trên sổ; sửa nhãn tiền cũ có audit.

Các bảng chính: `orders`, `order_items`, `delivery_trips`, `delivery_trip_orders`, `delivery_events`, `ledger_delivery_submissions`, `ledger_payments`, `ledger_fx_revisions`, `ledger_goods_returns`, `ledger_goods_return_items`, `ledger_refunds`, `cash_categories`, `cash_transactions`, `cash_report_periods`, `order_split_links`.

Runner tương ứng nằm trong `scripts/migrate-ledger-*.mjs`, lưu checksum trong `factory_sql_migrations`. Không sửa nội dung migration đã áp dụng. Chưa áp dụng lên production. Các bảng workflow được quản lý bằng SQL và truy cập qua `pg`; các cột mới của sổ chính đã cập nhật trong Prisma contract và phát sinh lại contract.

## 3. Vàng và độ chính xác

| Loại | Ảnh hưởng số dư vàng |
|---|---|
| DELIVERY | Cộng |
| RETURN_GOLD | Trừ |
| RETURN_GOODS | Trừ |
| RETURN_RECOVERED_GOLD | Trừ |
| GOLD_RETURN_TO_CUSTOMER | Cộng |

Trọng lượng đầu vào phải dương. Vàng thu hồi = trọng lượng thực × hàm lượng / 100, hàm lượng lớn hơn 0 và không quá 100. Lưu cả hai đầu vào, kết quả chính xác 10 chữ số thập phân và trọng lượng ghi sổ làm tròn 4 chữ số. Tính bằng BigInt/decimal và numeric PostgreSQL; không dùng số thực JavaScript để hạch toán. Giao diện hiển thị 2 chữ số theo định dạng Việt Nam, ví dụ `1.200,86 g`.

Số dư và tổng hợp trả riêng phần chờ duyệt, đã duyệt/ghi sổ và dữ liệu cũ. Trường tổng chính thức bao gồm phần chờ duyệt theo quyết định của chủ hệ thống.

## 4. Đơn hàng, tách đơn và giao hàng

Tạo đơn với khách hàng và dòng hàng thật. Mỗi dòng lưu tên hàng, số lượng, trọng lượng đơn vị, giá tiền công trên 15 g. Tiền công gốc = tổng số lượng × trọng lượng đơn vị × giá / 15; backend lấy từ dòng nguồn, không nhận tổng tiền công tùy ý từ người khai giao.

Đơn chuyển sang sẵn sàng rồi được gán vào chuyến giao có nhân viên thực tế. Tách đơn tạo các đơn độc lập, giữ tổng số lượng từng dòng và lịch sử nguồn; đơn đã phát sinh giao không được tách. Giao diện hiện hỗ trợ chia thành hai đơn, có thể tách tiếp; API nhận nhiều đơn đích.

Nhân viên chọn đơn/chuyến được phân công, khai giảm giá theo phần trăm hoặc BAHT, tiền thực thu và đồng tiền, ngày nghiệp vụ và thời điểm giao. Không có trường tỷ giá cho nhân viên. Giao tạo một dòng sổ PENDING, vàng tính ngay, khoản tiền khai chưa ghi Thu/Chi.

Kế toán duyệt với tỷ giá xác nhận nếu có thu tiền. Duyệt giao và ghi khoản thu ban đầu trong cùng transaction. Nếu sai, đánh dấu cờ `delivery_error` trên đơn gốc, giữ trạng thái nghiệp vụ đơn và bản khai tiền, loại dòng INCORRECT khỏi số dư. Sửa và gửi lại dùng cùng dòng sổ nguồn; bản khai thu bị thay thế lưu VOID để giữ lịch sử.

FAILED/RESCHEDULED lưu sự kiện và lý do, không thay đổi vàng hoặc kho.

## 5. Thu bổ sung và tỷ giá

Mỗi lần thu là một bản ghi riêng có số tiền/nguyên tệ thực tế, người khai, ngày nghiệp vụ, thời điểm và UUID yêu cầu. Khai từ sổ hoặc Thu/Chi đi vào cùng luồng PENDING. Duyệt mới tạo một khoản cash IN; một payment chỉ có một cash transaction.

Quy ước tỷ giá là số nguyên tệ trên một BAHT; BAHT luôn bằng 1. Tiền quy đổi = nguyên tệ / tỷ giá. Gợi ý tỷ giá chỉ là giả định thu đủ, không tự điền thành tỷ giá xác nhận. Backend chặn tỷ giá không hợp lệ, thu vượt, số dư âm và không tự cấn trừ.

Sửa tỷ giá yêu cầu quyền riêng và lý do, lưu giá trị cũ/mới, người sửa và thời điểm. Chỉ cập nhật tiền quy đổi và số dư tiền công; cash thực thu/nguyên tệ bất biến. Chi tiết sổ có bảng lịch sử tỷ giá. Backend loại các trường tỷ giá và lịch sử khỏi phản hồi dành cho người không có quyền tài chính tương ứng.

## 6. Trả hàng và hoàn tiền

Phiếu trả tham chiếu đơn đã giao được duyệt và các dòng nguồn. Backend giới hạn số lượng/trọng lượng theo phần chưa trả, tính cả phiếu chờ duyệt để tránh đặt trả vượt. Tiền công dòng trả hưởng tỷ lệ giảm giá gốc; làm tròn lũy kế để giữ đúng tổng khi trả nhiều lần.

Kế toán nhập tổng tiền thực hoàn, đồng tiền và tỷ giá. Backend tính khoảng hoàn hợp lệ từ tiền công hàng trả, dư phải thu và số tiền đã thu sau các lần hoàn. Phần chưa thu được hủy công nợ, phần hoàn tạo cash OUT. Không yêu cầu phân bổ khoản hoàn theo từng dòng. Duyệt tạo dòng RETURN_GOODS và cập nhật số dư trong cùng transaction. Hủy phiếu chưa duyệt giải phóng số lượng giữ chỗ và lưu lý do.

## 7. Thu/Chi và kỳ báo cáo

Cash lưu số tiền và đồng tiền thực tế, liên kết payment hoặc refund; trigger chặn sửa/xóa cash đã ghi. Báo cáo quy đổi dùng tỷ giá của kỳ, không lấy tỷ giá từng khoản thu. Thiếu tỷ giá cần thiết thì chặn báo cáo. Chỉ sửa tỷ giá kỳ đang mở; đóng kỳ dùng version của ảnh chụp báo cáo. Không ghi thêm tiền vào ngày nghiệp vụ thuộc kỳ đã đóng.

## 8. API, giao diện và phân quyền

API dùng tiền tố `/api/v1`:

| Nhóm | Endpoint chính |
|---|---|
| Đơn | GET/POST `/orders`, GET `/orders/:id`, PATCH `/orders/:id/status`, POST `/orders/:id/split` |
| Chuyến giao | GET/POST `/delivery-trips`, POST `/delivery-trips/:id/events` |
| Khai giao | GET `/customer-ledger/delivery-orders`, POST `/customer-ledger/orders/:id/report-delivery` |
| Đối soát | GET `/customer-ledger/entries/:id/workflow`, POST `.../:id/approve`, POST `.../:id/incorrect` |
| Thu từ sổ | POST `/customer-ledger/entries/:id/payments` |
| Thu từ Thu/Chi | POST `/cash/entries/:id/payments` |
| Duyệt/sửa thu | GET `/cash/payments`, GET `/cash/payments/:id`, POST `.../:id/approve`, POST `.../:id/void`, PATCH `.../:id/fx` |
| Trả hàng | GET `/customer-ledger/returnable-deliveries`, POST `/customer-ledger/entries/:id/goods-returns`, GET `/customer-ledger/goods-returns/:id`, POST `.../:id/void`, POST `.../:id/approve` |
| Thu/Chi | GET `/cash/transactions`, GET `/cash/outstanding` |
| Kỳ | GET/POST `/cash/periods`, GET `/cash/periods/:id/report`, PATCH `.../:id/fx`, POST `.../:id/close` |

Đã mở các trang Đơn hàng, Giao hàng và Thu/Chi trong điều hướng hiện tại. Sổ giữ bố cục hiện có, thêm nghiệp vụ trong modal/drawer và các nhãn trạng thái tiếng Việt.

15 quyền mới: `orders.read/create/update/split`, `delivery.manage/report`, `customer_ledger.approve/collect/fx.manage/returns.manage`, `cash.read/collect/approve/refund.approve/periods.manage`. Catalog hiện có 39 quyền. Đã đồng bộ quyền mới cho vai trò ADMIN ở local bằng tùy chọn `--with-ledger-workflow-admin`; không tự gán cho nhân viên. Quản trị viên cần cấp đúng quyền thao tác và các quyền xem liên quan cho từng người. Duyệt giao có tiền thu cần cả quyền duyệt giao và duyệt thu; duyệt trả cần cả quản lý trả và duyệt hoàn.

## 9. Nhất quán, chống ghi lặp và audit

Các thay đổi workflow chạy trong transaction, khóa tư vấn workflow và khách hàng, kiểm tra lại quyền người thực hiện; phiên đọc chi tiết/báo cáo dùng snapshot nhất quán. Version phát hiện dữ liệu nguồn đã đổi. UUID yêu cầu, khóa duy nhất nguồn giao, payment/cash và return/refund chống ghi lặp trên cùng yêu cầu hoặc nguồn. Audit lưu trước/sau và người thực hiện; sự kiện giao append-only, dữ liệu tiền đã ghi bất biến.

UUID trong các modal khoản thu/trả được giữ cho các lần gửi lại khi modal còn mở; chưa lưu bền qua refresh. Vì vậy không coi tạo yêu cầu mới sau refresh là retry cùng UUID. Form giao/trả thông báo dữ liệu chưa gửi sẽ bị bỏ khi đóng; các form vàng độc lập tiếp tục giữ nháp trong phiên.

## 10. Phạm vi còn lại và các file bàn giao

Các dòng cũ được giữ nguyên, không dựng đơn nguồn hoặc cash giả để khớp dữ liệu cũ. Nhãn VND thử đã sửa sang BAHT nhưng không chứng minh được lịch sử thu thực tế. Giao cũ không có nguồn chỉ cho sửa ghi chú; không đưa vào luồng thu/hoàn nguồn mới trước khi đối chiếu. Không đảo tùy ý khoản tài chính cũ hoặc dòng workflow bằng API sửa sổ chung.

Module sản phẩm, bảng giá riêng theo khách và nguồn tồn kho chưa có. Chưa triển khai PICKED_UP trừ tồn kho, chưa tự động lấy giá từ danh mục sản phẩm; đơn hiện giữ giá nhập làm snapshot. Chưa bổ sung module chốt kỳ vàng độc lập; chính sách tính vàng chờ duyệt đã áp dụng vào số dư/tổng hợp sổ. Chưa xác nhận trực quan trên trình duyệt hoặc vận hành toàn bộ chuỗi giao dịch thực tế.

File chính:

- Backend: `src/customer-ledger/customer-ledger.service.ts`, controller/module, `ledger-decimal.ts`, thư mục `workflow/`; `src/auth/permission-catalog.ts`; `src/rbac/rbac.service.ts`; `scripts/sync-permissions.ts`; migration và runner nêu trên; Prisma contract.
- Frontend: `features/customer-ledger/components/` (form giao, form tiền/trả, panel workflow, input số, modal/drawer/bảng sổ), `features/customer-ledger/services/workflowService.ts`, types và payload; `utils/decimal.ts`; các trang Orders/Deliveries/Cash và cấu hình điều hướng/quyền.

Backend và frontend đã build và lint thành công. Không tạo dữ liệu giao dịch mẫu trong database.
