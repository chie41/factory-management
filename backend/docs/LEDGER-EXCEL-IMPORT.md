# Import Excel sổ giao dịch — cột loại giao dịch bắt buộc

## Cấu trúc mẫu hiện tại
Import riêng: 18 cột A–R theo thứ tự NGÀY, LOẠI GIAO DỊCH, NGƯỜI GIAO DỊCH, NỢ, NHẬN (-), GIAO (+), TÍNH, CHI TIẾT, SỐ LƯỢNG, TRỌNG LƯỢNG ĐƠN, TRỌNG LƯỢNG TỔNG, GIÁ CÔNG, CÔNG, TỔNG CÔNG, NGÀY THU, SỐ TIỀN, NGƯỜI THU, GHI CHÚ.

Import chung: 19 cột A–S, thêm KHÁCH HÀNG ngay sau NGÀY. LOẠI GIAO DỊCH nằm ở cột C. Mẫu riêng lấy khách hàng từ sổ đang mở.

Mẫu có dropdown loại: Giao hàng, Khách trả vàng, Trả vàng cho khách, Khách trả vàng hồi, Trả hàng, Thu tiền công. Năm loại vàng là các mã hiện có trong CreateLedgerEntryDto; Thu tiền công dùng nghiệp vụ ledger_payments đã có, không thêm loại giao dịch vàng mới. Định dạng ngày dd/MM/yyyy, trọng lượng g, GIÁ CÔNG/15g và các khoản tiền THB.

## Nhập và xem trước
Tải mẫu mới từ nút Import Excel. Dán dữ liệu từ dòng 2. Bắt buộc chọn LOẠI GIAO DỊCH trên dòng đầu mỗi nghiệp vụ. Các dòng chi tiết tiếp theo có thể để trống ngày, loại và người giao dịch. Chỉ nhập tổng vàng ở dòng đầu; không lặp tổng trên từng sản phẩm. Mỗi dòng có loại bắt đầu một nhóm mới, kể cả trùng ngày/khách với nhóm trước. Không cần Mã GD hoặc đánh số giao dịch.

Chọn file để xem trước; chưa ghi database. Có thể đổi loại trực tiếp ở nhóm hoặc tại Dòng nguồn, sửa dữ liệu, tách nhóm rồi phân tích lại. Thay đổi loại được ghi thành sửa dòng nguồn và backend đọc lại; không tin loại hoặc số tiền do frontend tự tính. Phân tích lại đặt lại các xác nhận/ánh xạ chưa lưu như luồng đang có.

Mẫu chung giữ nguyên các lựa chọn ghép khách có sẵn, tạo khách sau xác nhận (cần customers.create) hoặc bỏ chọn giao dịch. Upload, chọn/bỏ chọn nhóm, ánh xạ nhân viên/mẫu mã, transaction và thông báo kết quả được giữ trong luồng hiện hữu.

## Parser và validation
- Chỉ cột LOẠI GIAO DỊCH xác định nghiệp vụ; nhận cả nhãn tiếng Việt và mã backend hợp lệ. Thiếu loại ở dòng đầu hoặc loại lạ là lỗi xem trước, không suy đoán từ NHẬN/GIAO.
- Giao hàng / Trả vàng cho khách đọc GIAO (+); Khách trả vàng đọc NHẬN (-). Chiều được lấy từ GOLD_DEBT_SIGN hiện có. Không cho nhập cả hai chiều trên một giao dịch. Không đổi dấu/công thức công nợ.
- Chi tiết liền kề đi vào nhóm cha. Ngày/khách/nhân viên khác, dòng trống hoặc điểm tách làm ranh giới không còn rõ; nhóm cần kiểm tra, không tự tạo phiếu sản phẩm độc lập.
- SL, trọng lượng đơn/tổng, GIÁ CÔNG, CÔNG và TỔNG CÔNG giữ cơ chế đối chiếu hiện hữu. Không cộng trùng trọng lượng/tiền công, không tự sửa chênh lệch.
- Khoản thu kèm trong nhóm giao hàng vẫn đọc riêng từ NGÀY THU/SỐ TIỀN/NGƯỜI THU. Thu độc lập chọn loại Thu tiền công và phiếu đích. Không lấy ngày giao thay ngày thu. Lưu khoản thu theo workflow hiện có (PENDING), không tự đánh dấu đã duyệt.
- NỢ/TÍNH không tạo giao dịch. Bỏ NỢ CŨ, số dư đầu kỳ, tổng cộng, tổng kết và dòng không có nghiệp vụ. Không ADJUSTMENT, không nhập/bù số dư cũ.
- Đọc lại đúng chỉ số cột ngày thu sau khi thêm cột loại; DTO sửa nguồn nhận tối đa 19 ô và parser yêu cầu chính xác 18/19 ô tùy chế độ.

## Không có Mã GD / chống trùng
Không có Mã GD trong mẫu mặc định, không bắt người dùng tạo mã. Backend tiếp tục sinh UUID nội bộ. Giữ batch request ID, SHA-256 file, sheet, dòng/nhóm dòng, khách đích, loại nghiệp vụ và content hash để nhận diện nguồn; source_data lưu dữ liệu gốc cùng sửa đổi có chủ đích.

Cùng nguồn đã import bị chặn; retry cùng request ID/nội dung trả kết quả cũ. Nội dung tương tự hoặc cùng ngày/số vàng chỉ là cảnh báo cần xác nhận rõ, không tự coi là cùng giao dịch. Không ghi đè dữ liệu cũ.

## Migration chuẩn bị, chưa chạy
Bảng ledger_excel_import_sources cũ chỉ cho DELIVERY, RETURN_GOLD, PAYMENT. Đã thêm migration `20261028_ledger_excel_import_transaction_types.sql` để mở rộng CHECK sang các loại backend hiện có, phục vụ dấu vết loại Trả vàng cho khách. Không sửa checksum migration đã áp dụng, không thay đổi bản ghi nghiệp vụ.

Runner development được thêm ở scripts/migrate-ledger-excel-import-transaction-types.mjs; lệnh chuẩn bị:

`npm run ledger:migrate-excel-import-types`

Chưa chạy lệnh này hoặc bất kỳ migration nào trong lần chỉnh sửa. Cần áp dụng migration phù hợp trước khi lưu loại mới. Không thay đổi database/production.

## Giới hạn còn lại
- Khách trả vàng hồi cần trọng lượng thực và tuổi vàng, trong khi mẫu cố định chưa có cột này. Parser nhận diện đúng loại nhưng báo lỗi chặn import; không coi số vàng đó là vàng thường hay tự giả định tuổi vàng.
- Trả hàng cần phiếu giao nguồn, dòng hàng trả và thông tin hoàn tiền. Mẫu hiện chưa đủ liên kết nên báo lỗi chặn import, không chuyển thành nhận vàng hoặc bỏ chi tiết.
- Mẫu cũ không có LOẠI GIAO DỊCH cần tải mẫu mới và bổ sung cột. Không hỗ trợ đoán loại để nhập thẳng mẫu cũ.
- Giữ giới hạn hiện tại: .xlsx tối đa 4 MB, 10.000 dòng/file, 100 nghiệp vụ/lần xác nhận; tiền công THB/15g; khoản thu cần một phiếu đích.

## File sửa trong lần này
- backend/src/customer-ledger/excel-import/excel-parser.ts
- backend/src/customer-ledger/excel-import/excel-import.dto.ts
- backend/src/customer-ledger/excel-import/excel-import.service.ts
- frontend/src/features/customer-ledger/components/LedgerExcelImport.tsx
- frontend/public/templates/ledger-import-single.xlsx
- frontend/public/templates/ledger-import-bulk.xlsx
- .artifact-work/build-ledger-templates.mjs (nguồn xuất mẫu, bỏ bước kiểm tra/render)
- backend/migrations/sql/20261028_ledger_excel_import_transaction_types.sql (mới, chưa chạy)
- backend/scripts/migrate-ledger-excel-import-transaction-types.mjs (mới, chưa chạy)
- backend/package.json (thêm lệnh migration)
- backend/docs/LEDGER-EXCEL-IMPORT.md

Theo yêu cầu, lần chỉnh sửa này không chạy unit/integration/E2E test, lint, typecheck, build hoặc frontend/backend; không tạo/sửa file test. Chỉ chỉnh source liên quan và xuất lại hai file mẫu, không xác nhận tính năng đã qua kiểm thử.


## Cập nhật ngày trống và ô gộp
Lần chỉnh sửa này chỉ sửa excel-parser.ts, LedgerExcelImport.tsx và hướng dẫn này. Không thay đổi mẫu/cấu trúc cột, cơ chế chống trùng, transaction hoặc công thức công nợ; không thêm migration.

- Parser giữ currentDate/currentDateRow riêng từng sheet và vùng dữ liệu. Ngày hợp lệ cập nhật ngữ cảnh; giao dịch có loại khai báo nhưng ngày trống lấy ngày gần nhất. Không có ngày trước đó hoặc có ngày khai báo sai thì lỗi xem trước, không lấy ngày hiện tại và không bỏ qua giao dịch.
- Khi đọc ô gộp, giữ tọa độ và giá trị master trong metadata của dòng. Ngày, nhân viên và khách hàng của ô gộp dọc dùng ngữ cảnh ô master; sửa ô master trong xem trước được phản ánh khi phân tích lại. Không dùng ô gộp ngang để tự điền sang trường nghiệp vụ khác.
- Loại giao dịch, số vàng, tổng công và khoản thu ở ô gộp không được nhân lên theo số dòng: chỉ ô master tham gia mở nghiệp vụ/tổng. Dòng chi tiết dưới loại giao dịch được gộp vẫn thuộc nhóm cha. Số liệu độc lập thiếu loại vẫn cần kiểm tra, không tự lấy loại từ dòng trên để tạo nghiệp vụ.
- Dòng NỢ/TÍNH đơn thuần không làm mất ngày gần nhất. Tiêu đề bảng lặp lại, tiêu đề vùng mới, tổng kết/số dư đầu vùng, khoảng trống giữa vùng hoặc chuyển khách hàng rõ ràng trong import chung đặt lại ngữ cảnh. Không tự lấy khách của giao dịch trước cho giao dịch mới; chỉ dùng khách khai báo, ô gộp khách hoặc quan hệ chi tiết–cha đã xác định.
- Ô ngày kiểu Date, serial Excel (1900/1904), dd/MM/yyyy và kết quả cache của công thức ngày/loại tiếp tục được đọc. Không đánh giá công thức thiếu kết quả.
- Ngày thu tiền giữ độc lập: chỉ lấy từ NGÀY THU hoặc ô master của chính vùng gộp NGÀY THU, không dùng currentDate của giao dịch vàng. Ngữ cảnh người thu/NGÀY THU không tự sinh khoản thu ở mỗi dòng sản phẩm.
- Xem trước trả ngày thực tế đã kế thừa, dòng nguồn ngày và cờ kế thừa. Có ô Ngày giao dịch / Ngày thu tiền để sửa trực tiếp trước import; thay đổi ngày được lưu thành sửa dòng nguồn rồi phân tích lại. Sửa loại và sửa nguồn vẫn giữ luồng hiện có.

Theo yêu cầu, không chạy test, lint, typecheck, build, không khởi động lại hệ thống hoặc tạo file test cho lần chỉnh sửa này. Chưa xác nhận hành vi bằng kiểm thử thực thi. Các giới hạn khác (chọn sheet trong workbook nhiều sheet, mô tả TRẢ VÀNG trong cột chi tiết, phân bổ một khoản thu cho nhiều phiếu) không được thay đổi trong phạm vi sửa ngày/ô gộp này.


## Sửa mô tả của nghiệp vụ vàng
Parser ưu tiên loại đã khai báo: với Khách trả vàng / Trả vàng cho khách, chữ trong CHI TIẾT (ví dụ TRẢ VÀNG) khi không kèm số lượng, trọng lượng sản phẩm, giá công hoặc tiền công được lưu vào ghi chú giao dịch. Không chạy validation sản phẩm và không yêu cầu số lượng cho mô tả này. Mô tả nối tiếp chỉ gắn vào nghiệp vụ vàng cha khi ngày/khách/nhân viên còn khớp và không có số vàng độc lập.

Nếu thực sự có các cột số liệu hàng hóa/tiền công trên giao dịch vàng thì vẫn báo cần kiểm tra, không tự bỏ chúng. Giữ cách kiểm tra dòng hàng của Giao hàng, ngày kế thừa, chiều vàng, chống trùng và transaction. Không sửa các vấn đề riêng về dòng tổng kết hoặc phân bổ khoản thu nhiều phiếu trong lần sửa này.

Lần sửa này chỉ thay excel-parser.ts và hướng dẫn; không chạy test, lint, typecheck, build hoặc khởi động lại ứng dụng.


## Công thức có kết quả chuỗi rỗng
Chẩn đoán chỉ đọc trên file Bảng tính không có tiêu đề.xlsx cho thấy K7 và M7 là shared formula có t="str" và <v></v>: kết quả đã lưu là chuỗi rỗng. ExcelJS trả về sharedFormula mà không giữ result, khiến bản sửa mô tả trước đó vẫn thấy #FORMULA_NO_RESULT và đi vào validation sản phẩm.

Đã thêm excel-formula-cache.ts để nhận diện đúng ô công thức có cache chuỗi rỗng từ XML gốc trong .xlsx và tích hợp vào readExcel. Chỉ coi là trống khi XML có bằng chứng cache rỗng; công thức không có cache vẫn trả #FORMULA_NO_RESULT. Không đánh giá công thức và không thay số liệu. Dùng node:zlib sẵn có, không thêm dependency. Các giới hạn ZIP hiện hữu tiếp tục được áp dụng.

Lần sửa này thay excel-parser.ts, thêm excel-formula-cache.ts và cập nhật hướng dẫn. Không chạy test, lint, typecheck, build hoặc khởi động lại hệ thống sau chỉnh sửa. Bản xem trước đang mở cần bấm Đọc lại xem trước để lấy kết quả phân tích mới sau khi backend nạp source cập nhật; các ánh xạ/xác nhận hiện tại sẽ được đặt lại theo luồng sẵn có.


## Bỏ qua dòng/nhóm trong bản import
Đã thêm nút Bỏ qua dòng / nhóm trên mọi nhóm xem trước, kể cả nhóm lỗi hoặc trùng. Người dùng xác nhận loại toàn bộ các dòng nguồn của nhóm khỏi bản import; nếu cùng dòng sinh nhiều nghiệp vụ thì tất cả nghiệp vụ của dòng đó được loại. Chỉ cập nhật bản nháp, không sửa file Excel hay xóa giao dịch đã lưu.

Bảng Dòng nguồn có checkbox Bỏ qua từng dòng. Danh sách Các dòng không import có Khôi phục dòng đối với các dòng chủ động bỏ qua; khôi phục không tự chọn lại để ghi. API preview và confirm cùng nhận ignored_rows (sheet/row được kiểm tra tồn tại), backend bỏ các dòng đó trước khi tạo nhóm và lưu dấu vết lựa chọn cùng lô import. Bỏ qua chủ động vẫn giữ ngày nguồn làm ngữ cảnh nhưng ngắt nhóm sản phẩm để không tự ghép qua dòng đã loại.

Khi bỏ qua/khôi phục từ nhóm, ánh xạ và xác nhận của nhóm có content_hash không đổi được giữ lại. Nhóm đổi nội dung phải kiểm tra lại; thanh toán trỏ tới nhóm giao đã bỏ vẫn phải chọn lại phiếu đích.

Parser nhận diện thêm dòng tổng số liệu ở phần đầu vùng như dòng 3 của PV1(CTY): dữ liệu gốc không có ngày, loại, người, khách, mô tả hay số liệu sản phẩm; đồng thời có tổng vàng cả hai chiều và tổng công/thu. Dòng này được bỏ qua là Số dư / tổng kết ngay cả khi người dùng trước đó đã thử gán loại/ngày trong xem trước. Không tự bỏ một dòng nghiệp vụ chỉ vì thiếu ngày/loại.

Sửa thêm nhánh thu tiền sai cấu trúc để không sinh hai nhóm REVIEW cùng ID từ một dòng. Các file sửa: excel-parser.ts, excel-import.dto.ts, excel-import.service.ts, LedgerExcelImport.tsx và hướng dẫn này. Không thêm migration hoặc thay đổi số dư, công thức công nợ hay dữ liệu đã ghi. Không chạy test, lint, typecheck, build hoặc khởi động lại hệ thống trong lần chỉnh sửa.


## Bỏ hai checkbox xác nhận thủ công
Đã bỏ checkbox xác nhận đơn vị và checkbox Đã kiểm tra nhóm/ngày/số liệu/ánh xạ. Thông tin đơn vị vẫn hiển thị dạng mô tả, không chặn xác nhận import. Frontend không gửi hoặc kiểm tra confirmed_review; backend không yêu cầu trường này (DTO chỉ giữ tùy chọn để tương thích client cũ).

Điều kiện còn lại: có bản xem trước, chọn 1–100 nghiệp vụ không lỗi/trùng nguồn, đủ ánh xạ khách/nhân viên/mẫu mã/phiếu thu đích và không đang xử lý request. Checkbox cho phép giao dịch có khả năng trùng giữ nguyên. Quyền, validation nghiệp vụ, chống trùng và transaction ở backend không đổi. Không chạy test/lint/typecheck/build trong lần sửa này.

## Ghi nhận trực tiếp từ Sổ giao dịch (28/10/2026)

Các giao dịch nhập từ sổ được ghi nhận ngay trong transaction lưu, không chờ một bước duyệt riêng: giao hàng thủ công hoặc từ đơn hàng, các nghiệp vụ vàng đã hỗ trợ, thu bổ sung tiền công và trả hàng/hoàn tiền. Khoản thu từ Import Excel cũng được ghi nhận ngay; thông tin người thu và ghi chú được lưu trước khi tạo chứng từ Thu/Chi. Nội dung này thay thế các mô tả khoản thu chờ duyệt ở phần hướng dẫn cũ phía trên.

Vẫn kiểm tra quyền thao tác, khách hàng/nhân viên, chống trùng, giới hạn thu/hoàn và kỳ Thu/Chi đã khóa. Thu/hoàn THB dùng tỷ giá 1; ngoại tệ cần tỷ giá xác nhận khi lưu. Trả hàng cần phiếu nguồn và số tiền hoàn hợp lệ, không tự đoán số tiền. Không mở rộng những loại mà mẫu Excel chưa đủ dữ liệu.

Luồng khai từ màn hình Giao hàng hoặc Thu/Chi vẫn sử dụng quy trình duyệt hiện có. Không tự duyệt hàng loạt chứng từ đang chờ trước đó, không thay dữ liệu lịch sử, không cần migration. Theo yêu cầu trước đó, không chạy test, lint, typecheck, build hoặc khởi động lại ứng dụng cho lần sửa này; mới rà soát mã nguồn.
