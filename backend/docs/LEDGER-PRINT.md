# In / lưu PDF sổ giao dịch

Nút **In** mở PDF trong cửa sổ mới. Người dùng in hoặc lưu PDF bằng thanh công cụ của trình xem PDF. Nút **Xuất sổ** CSV giữ nguyên. Không in layout website, không giới hạn theo trang giao dịch hiện tại.

## Dữ liệu và giao diện

- `GET /customer-ledger/customers/:customerId/print-data`: quyền `customer_ledger.read`, cùng bộ lọc trên màn hình. Gọi nguyên `CustomerLedgerService.findByCustomer` một lần với phân trang nội bộ đủ toàn bộ dữ liệu; không có công thức công nợ mới.
- Khung ba chỉ số dùng `book.totals`: vàng và tiền công phải trả/đã trả theo từng đồng tiền. Đây là công nợ lũy kế hiện tại theo toàn bộ lịch sử có hiệu lực, **không phải** tổng phát sinh theo bộ lọc. Không cộng các đồng tiền với nhau, không đổi THB/LAK sang VND. Ý nghĩa này được ghi ngay dưới khung.
- Ngày lọc lấy từ lần bấm In; không đặt ngày giả nếu bộ lọc không giới hạn. Thời điểm xuất dùng múi giờ ứng dụng `Asia/Ho_Chi_Minh`.
- `LedgerTransactionTable` được tái sử dụng trên màn hình và PDF; biến thể PDF bỏ cột Tham chiếu và thao tác, giữ các cột dữ liệu khác, trạng thái chờ duyệt nếu có, nhóm ngày và tổng kết backend. Số dư đầu kỳ và nợ cuối ngày giữ nguyên nguồn/ý nghĩa.
- Trong PDF, một sản phẩm dùng một hàng HTML để tên và số lượng luôn đi cùng nhau khi phân trang. Các ô giao dịch/ngày vẫn gộp; giá trị giao dịch không lặp/cộng thêm. Bảng màn hình giữ cấu trúc hiển thị cũ.

## PDF và môi trường triển khai

`POST /customer-ledger/print/pdf` nhận HTML tĩnh đã render bởi React (tối đa 6 triệu ký tự; JSON tối đa 8MB), yêu cầu `customer_ledger.read`. Dùng Chrome/Chromium headless có sẵn, qua DevTools pipe riêng, không cài thư viện PDF hoặc tải browser runtime vào dự án. Database không thay đổi và không có migration.

Backend tự tìm Chrome trên Windows/macOS, Chrome/Chromium tại đường dẫn thông dụng trên Linux, hoặc dùng biến môi trường:

```text
LEDGER_PDF_BROWSER_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

Máy triển khai phải có Chromium hiện hành và font Unicode hỗ trợ tiếng Việt (Arial trên Windows; Noto Sans/DejaVu Sans trên Linux). Giữ sandbox của Chromium; không dùng `--no-sandbox`. Chạy dịch vụ bằng tài khoản phù hợp của hệ điều hành.

Bản in dùng A4 ngang 297 × 210mm, lề 10mm, không scale giao diện web. `thead` lặp trên trang mới; các hàng chi tiết tránh ngắt ngang; tổng kết ưu tiên đi cùng hàng cuối. Nội dung quá cao so với một trang buộc phải tiếp tục trên trang sau. Header/khung tổng hợp chỉ xuất hiện một lần. Footer dùng `pageNumber`/`totalPages` thực tế của `Page.printToPDF`, chỉ có X/Y căn giữa, không URL/ngày mặc định.

Mỗi tác vụ dùng profile tạm riêng, JavaScript bị vô hiệu hóa, CSP chặn tài nguyên bên ngoài và mạng bị chặn. Chỉ chấp nhận các thẻ báo cáo tĩnh. Không nối vào profile hoặc phiên đăng nhập của người dùng. Tối đa hai tác vụ đồng thời, timeout 60 giây. Khi thiếu browser, quá tải hoặc lỗi render, trả lỗi rõ ràng; không âm thầm quay về in trang web. Frontend chờ tối đa 90 giây cho tác vụ PDF.

## Kiểm tra

```text
cd backend
npm run build
npm test -- src/customer-ledger/ledger-read.spec.ts
cd ../frontend
npm run build
npm test
node scripts/verify-ledger-print.mjs
```

Script kiểm tra dùng dữ liệu giả, không kết nối database. Xuất mẫu vào `tmp/pdfs/ledger-print/`: sổ một trang, 30 giao dịch có ghi chú dài/một ngày nhiều giao dịch/nhiều nhóm ngày, giao dịch 65 mặt hàng, và sổ trống. Kiểm tra dữ liệu đầu vào không bị sửa, mã tham chiếu/nút không lọt bản in, các dòng và bộ lọc được giữ, và từ chối HTML điều hướng.

Đã kiểm tra PDF bằng trích xuất văn bản và render ảnh: bản 1 trang, 8 trang, 9 trang và sổ trống; đủ 30/30 dòng, 60/60 sản phẩm ở bản nhiều trang và 130/130 sản phẩm ở bản chi tiết dài; đủ tổng kết từng ngày, không lặp khung tổng hợp; A4 ngang, nội dung nằm trong lề, header bảng lặp, footer đúng X/Y, tiếng Việt có dấu. Không dùng dữ liệu kinh doanh thật hoặc thực hiện giao dịch thử. Kiểm tra trực tiếp nút In trong phiên đăng nhập của người dùng chưa được thực hiện.

Build frontend/backend thành công. Frontend: 25/25 kiểm thử; backend đọc sổ: 7/7. Frontend còn cảnh báo bundle chính lớn; mã render báo cáo đã được tải riêng khi bấm In.

## File thay đổi trong lần triển khai này

- `frontend/src/features/customer-ledger/components/LedgerDetail.tsx`
- `frontend/src/features/customer-ledger/components/LedgerDailyTable.tsx`
- `frontend/src/features/customer-ledger/components/LedgerPrintReport.tsx` (mới)
- `frontend/src/features/customer-ledger/styles/ledger-print.css` (mới)
- `frontend/src/features/customer-ledger/services/ledgerService.ts`
- `frontend/architecture.test.mjs` (nhận diện resource query của Vite)
- `frontend/scripts/verify-ledger-print.mjs` (mới)
- `backend/src/customer-ledger/print/ledger-pdf.service.ts` (mới)
- `backend/src/customer-ledger/print/ledger-print.controller.ts` (mới)
- `backend/src/customer-ledger/customer-ledger.controller.ts`
- `backend/src/customer-ledger/customer-ledger.module.ts`
- `backend/src/main.ts`
- `backend/docs/LEDGER-PRINT.md` (mới)
