# Customer Ledger — audit và nghiệm thu 12/10/2026

**Cập nhật mới:** [Form thêm giao dịch và nghiệm thu tạo dữ liệu qua UI](form-e2e.md) thay thế giới hạn “chưa chạy E2E mutation” của lượt audit bên dưới. Đã tạo 6 khách/15 giao dịch qua form development, sửa và kiểm tra persistence; form dòng hàng/liên kết đơn vẫn chưa hoàn thành.

## Figma đã đọc

File `3rFXFMYr9fNCS8uPMur6Rf`, page `179556:411`. Đã đọc design context, các component con khi frame cha chỉ trả cấu trúc, screenshot của cả 8 frame và prototype reactions. Không có ảnh/SVG cần nhập vào module.

| Frame | Node | Implementation / giới hạn |
| --- | --- | --- |
| CUS-LEDGER-01 Tổng hợp | [179617:753](https://www.figma.com/design/3rFXFMYr9fNCS8uPMur6Rf?node-id=179617-753) | Header, tabs, 4 cards, bộ lọc thật, 8 cột, phân trang |
| CUS-LEDGER-02 Sổ khách | [179617:1014](https://www.figma.com/design/3rFXFMYr9fNCS8uPMur6Rf?node-id=179617-1014) | Header khách, số dư, bảng theo ngày, đầu kỳ/cuối ngày; chưa có dòng hàng/nhân viên giao dịch/đơn hàng |
| CUS-LEDGER-03A Chi tiết giao dịch | [179639:753](https://www.figma.com/design/3rFXFMYr9fNCS8uPMur6Rf?node-id=179639-753) | Drawer 520px; phần đơn/giao hàng, sản phẩm, chứng từ thiếu nguồn BE |
| CUS-LEDGER-03B Sửa giao dịch | [179639:1553](https://www.figma.com/design/3rFXFMYr9fNCS8uPMur6Rf?node-id=179639-1553) | Drawer 560px giữ sửa dữ liệu ledger hiện có; chưa thể triển khai editor dòng hàng và tổng vàng từ dòng hàng như prototype |
| CUS-LEDGER-04A Thêm trả vàng trong sổ | [179655:983](https://www.figma.com/design/3rFXFMYr9fNCS8uPMur6Rf?node-id=179655-983) | Modal 560px, khóa khách hàng theo sổ đang mở |
| CUS-LEDGER-04B Thêm từ tổng hợp | [179655:1698](https://www.figma.com/design/3rFXFMYr9fNCS8uPMur6Rf?node-id=179655-1698) | Chọn khách hàng trong modal, tìm qua API thật |
| CUS-LEDGER-03C Chi tiết trả vàng | [179655:1983](https://www.figma.com/design/3rFXFMYr9fNCS8uPMur6Rf?node-id=179655-1983) | Drawer xanh, số dư trước/biến động/sau từ BE, lịch sử timestamp có thật |
| CUS-LEDGER-03D Sửa trả vàng | [179655:2718](https://www.figma.com/design/3rFXFMYr9fNCS8uPMur6Rf?node-id=179655-2718) | Bố cục riêng, khách chỉ đọc; loại vàng/người nhận/chứng từ chưa có BE |

Đã đọc 3 menu overlay `179637:753` (giao hàng), `179640:753` (trả hàng), `179640:764` (trả vàng). View/edit/reverse hoạt động theo ledger API. Link đơn/giao hàng bị disable kèm lý do vì route/module tương ứng chưa tồn tại. Prototype dẫn sang `179572:1616` và `179556:903`, ngoài phạm vi Customer Ledger hiện có.

## Audit và kiến trúc

Trước refactor: thiếu bộ lọc/thống kê toàn bộ tập dữ liệu; route chi tiết reset component; thiếu workspace tab bền vững; bảng chi tiết chưa thể hiện nhóm ngày/đầu kỳ/cuối ngày; form/drawer dùng styling mặc định và thiếu các biến thể.

- `CustomerLedger`: điều phối workspace, tìm sổ và modal tạo.
- `CustomerLedgerTabs`, `useCustomerLedgerTabs`, `ledgerWorkspace`: UUID làm key, mở mới ngay sau Tổng hợp, tái sử dụng không đổi vị trí, đóng active chọn tab kế bên, URL điều khiển active, sessionStorage giữ tabs/filters/page/pageSize.
- `CustomerLedgerSummary`, `CustomerLedgerSummaryTable`: thống kê và bảng tổng hợp riêng.
- `LedgerDetail`, `LedgerDailyTable`: sổ một khách, nhóm ngày và footer theo backend; không tái dùng bảng tổng hợp.
- `CustomerLedgerFilters`, `useLedger`: query key bao gồm customerId và toàn bộ filter/page; chuyển tab không reset hoặc lẫn cache.
- `LedgerEntryDrawer`, `LedgerEntryForm`, `LedgerCustomerSelect`: chi tiết, validation, bản nháp, chọn khách qua API.
- `ledgerService`: endpoint/payload và xuất toàn bộ trang; components không gọi axios trực tiếp.
- `ledgerDraftGuard`: cảnh báo điều hướng nội bộ/back-forward/beforeunload; nháp lưu riêng theo khách và entry. Đăng xuất/hết hạn phiên xóa workspace và nháp.

## API thật và nghiệp vụ

Dùng `VITE_API_CONTRACT=current` cho backend repository, prefix `/api/v1`:

- GET `/customer-ledger/summary`
- GET `/customer-ledger/customers/:customerId`
- GET/ PATCH `/customer-ledger/entries/:id`
- POST `/customer-ledger/customers/:customerId/entries`
- POST `/customer-ledger/entries/:id/reverse`
- GET `/customers`, `/customers/:id` để tìm/chọn/đọc hồ sơ.

Bearer JWT, xử lý 401 và lỗi theo client chung. Nhánh `documented` được giữ cho Swagger bên ngoài, nhưng backend đó chưa tồn tại để nghiệm thu HTTP các read projections mới.

GET hỗ trợ `q`, `from`, `to`, `status`, `debt`, `customer_scope`, `transaction_type`, `reversed`, `labor_status`, `currency`, `page`, `page_size`. Chi tiết thêm `group_by_day=true`, phân trang **ngày**, không cắt nhóm. Các tham số được validate và xuất qua Swagger.

- `totals`: số dư **hiện tại**, toàn bộ lịch sử có hiệu lực.
- `period_totals`: biến động của giao dịch khớp bộ lọc; không thay thế số dư hiện tại.
- `opening_gold_g`: lũy kế trước `from`; `closing_gold_g`: lũy kế đến `to`.
- `daily_summaries.received_g/delivered_g`: các giao dịch khớp bộ lọc trong ngày; `closing_gold_g`: toàn bộ lịch sử đến cuối ngày, kể cả các loại bị ẩn bởi filter.
- `statistics`: tính trước phân trang trên tập khách khớp tìm kiếm/status/scope/debt. Khách có giao dịch = có ít nhất 1 bản ghi trong kỳ; nợ = số dư hiện tại > 0; hôm nay = ngày nghiệp vụ UTC+7, bỏ giao dịch reverse.
- Chi tiết entry trả before/change/after ngay cả khi entry nằm ngoài trang đang xem.
- Giữ nguyên 5 quy ước dấu vàng, fixed-point 4 chữ số, tiền công theo từng tiền tệ, create/update/reverse và audit note. Không đổi database schema hoặc chạy migration trong lần refactor này.
- FE gửi `customer_scope=all` mặc định; client cũ không gửi tham số vẫn giữ mặc định backend `with_transactions`.

## Kiểm tra đã thực hiện

- FE: lint, TypeScript/Vite build và 12 tests đạt. Test mới bao phủ payload chỉ gửi trường thay đổi, tab dedupe/order/reopen, state độc lập/session restore, cảnh báo browser back với bản nháp.
- BE: build đạt; lint còn 1 cảnh báo import có sẵn trong auth. 6 ledger tests đạt: 5 loại/dấu vàng, reverse protection, current/period/opening/closing, nhóm ngày, thống kê trước pagination và entry ngoài trang.
- `backend/scripts/check-ledger-read.mjs`: HTTP thật login, summary/statistics, empty search, đúng customer, số dư không đổi khi lọc, detail before/after đạt. Script chỉ đọc ledger.
- Browser với API thật: mở sổ, mở lại không duplicate, đóng/reopen, giữ filter qua tab và refresh, mở sổ từ hồ sơ khách, back/forward, empty state, form chỉnh sửa, giữ/khôi phục/bỏ nháp, modal thêm ở tổng hợp và chi tiết.
- Không ghi/sửa/reverse các giao dịch thật khi nghiệm thu lần này. Luồng mutation nối API được giữ; kiểm tra chặn sửa/reverse sau reverse qua service test. Chưa nghiệm thu E2E mutation trên database test biệt lập.
- Browser đã nghiệm thu đồng thời 3 sổ khách thật: mở mới đứng sau Tổng hợp, đóng tab không active giữ nguyên sổ đang xem, mở lại đúng vị trí, bộ lọc độc lập và đóng active chuyển sang tab kế bên. Không tạo dữ liệu khách để kiểm tra.
- Screenshot tại 1440×1024 (Figma), 1280×800 và 390×844; DOM 390px: trang clientWidth=scrollWidth=390, cuộn ngang nằm trong summary wrapper 1014px hoặc detail wrapper 1160px.
- Build cảnh báo bundle Ant Design >500kB; không coi đây là build failure. Không chạy toàn bộ bộ test backend scaffold cũ vì chúng thiếu dependency providers; kết quả trên là suite ledger có phạm vi rõ.

Screenshot nguồn và implementation nằm trong [screenshots](screenshots). Đã so sánh layout/header/cards/filter/table/modal/drawer, sửa filter width, cột bảng, padding/form spacing, close icon, backdrop. Không khẳng định pixel-perfect hoặc đầy đủ cả 8 frame: 03A/03B thiếu dữ liệu nghiệp vụ; các số liệu, UUID và lịch sử thực khác dữ liệu mẫu Figma.

## Phần bị chặn và contract cần bổ sung

| Trường/tương tác | Cách hiển thị hiện tại | Cần bổ sung |
| --- | --- | --- |
| Đơn đang xử lý | `null` → dấu —, tooltip | Quan hệ order/customer, query đếm trạng thái đang xử lý |
| Mã đơn/mã giao hàng và navigation | UUID thật rút gọn, link nguồn chưa bật | `reference_code`, `order_id/code`, `delivery_id/code` và module routes thực |
| Người nhận/người giao dịch | — hoặc input disabled | `actor_id/name` lưu theo người ghi nhận/người nhận đã xác định nghiệp vụ |
| Loại vàng | Disabled trong sửa trả vàng | Danh mục và `gold_type_id/name` trong DTO/read model |
| Dòng hàng và editor 03B | Không giả sản phẩm; thông báo thiếu dữ liệu | `products[{id,design_model_id,name,quantity,unit_weight_g,total_weight_g}]`, endpoint cập nhật nguồn hàng và quy tắc tính tổng atomically |
| Chứng từ | Disabled, báo chưa có API upload | Upload/storage, metadata attachment và quyền đọc/ghi/xóa |
| Lịch sử người cập nhật/xác nhận | Chỉ timestamp thật có trong record | Audit event model (actor/action/time), status xác nhận nếu nghiệp vụ yêu cầu |

Không tự thêm bảng/quan hệ hoặc suy diễn nghiệp vụ từ Figma. Các trường đề xuất trên chưa được gửi trong payload backend hiện tại. In chỉ in trang đang xem; CSV xuất mọi trang khớp filter. Responsive chưa có frame nguồn: 2 cột cards, toolbar xếp dọc, tabs ellipsis, drawer tối đa viewport, cuộn trong bảng. Sidebar giữ thứ tự mà người dùng đã yêu cầu, breadcrumb giữ tên module đúng thay vì “Giao hàng” trong ảnh Figma.

## Chạy

Backend: trong `backend`, cấu hình `.env` hiện có, `npm run build`, `$env:NODE_ENV='development'`, `node dist/main.js` (mặc định cổng từ `.env`). FE: trong `frontend`, cấu hình `.env` theo `.env.example`, `npm run dev`; `API_PROXY_TARGET` trỏ backend nếu khác localhost:3000.

Kiểm tra: FE `npm run lint`, `npm run build`, `npm test`; BE `npm run build`, `npm run lint`, `npm test -- src/customer-ledger/ledger-read.spec.ts`. HTTP chỉ đọc: đặt `LEDGER_CHECK_BASE_URL=http://localhost:3000/api/v1`, chạy `node scripts/check-ledger-read.mjs` trong backend (ADMIN_PASSWORD chỉ lấy từ `.env`, không in token/password).
