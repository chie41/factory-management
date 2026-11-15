# Bàn giao Mẫu mã & Cấu kiện

## Cập nhật: mã do backend sinh

Mã mẫu và mã cấu kiện không còn là trường nhập hoặc sửa trên form/API. Backend sinh mã `MM000001`, `CK000001` từ sequence riêng khi tạo, kiểm tra và bỏ qua mã đã tồn tại. Sequence được khởi tạo sau mã hiện có cùng tiền tố; không đánh lại mã cũ. DTO từ chối trường code do client gửi, khi cập nhật backend giữ nguyên code hiện tại; trigger chặn đổi code ở database. Mã vẫn hiển thị trong danh sách/chi tiết và các snapshot lịch sử.

Migration local `20261016_catalog_generated_codes.sql`, runner `scripts/migrate-catalog-generated-codes.mjs` đã áp dụng. Form chỉ nhập thông tin nghiệp vụ; mã được trả về sau khi lưu.

## Cập nhật prototype và nhóm mẫu mã

Đã đọc trực tiếp các frame `Patterns / Product / Create` (179941:3884) và `Patterns / Component / Create` (179941:4685) trong trình duyệt Figma. Form tạo/sửa chuyển từ modal sang trang trong layout hiện có: tiêu đề và nút Lưu phía trên, thông tin cơ bản ở trái, khung upload ảnh và trạng thái ở phải, các khối nền trắng bo góc. Thuộc tính cấu kiện hiển thị theo cột tên, giá trị, đơn vị; các kích thước chuẩn tiếp tục dùng cột numeric, thuộc tính mở rộng vẫn lưu JSON. Với thuộc tính có đơn vị, JSON lưu `{value, unit}` và đọc lại được.

Theo xác nhận mới, cấu kiện có thêm ảnh, mô tả và ACTIVE/INACTIVE. Migration `20261015_component_prototype_fields.sql` đã áp dụng local; API thêm POST `/components/images`, POST `/components/:id/images`, PATCH `/components/:id/status`. Ảnh dùng chung kho upload hiện có, đọc ảnh cần quyền xem mẫu mã hoặc cấu kiện. Cấu kiện đã ngừng sử dụng không được thêm mới vào BOM; các dòng BOM đã có vẫn giữ nguyên và có thể sửa số lượng. Không thêm chức năng vị trí đổ mẫu hoặc quy trình sản xuất từ prototype vì chưa có nghiệp vụ nguồn được chốt.

Form tạo mẫu mã có thể nhập ngay BOM, chia hai khối Cấu kiện và Nguyên liệu phụ. API POST `/design-models` nhận `initial_bom_items` tùy chọn; backend kiểm tra `boms.manage` nếu có dòng, lưu mẫu và BOM trong cùng transaction. Không tạo BOM bắt buộc hoặc tự tính trọng lượng mẫu từ BOM.

Đã thêm Nhóm mẫu mã theo yêu cầu ngày 16/10/2026. Ví dụ cách dùng: tạo nhóm “Dây XO”, rồi chọn nhóm đó trên mẫu “Dây xo 6 cạnh 3B”. Đây là ví dụ thao tác, không tự chèn dữ liệu mẫu vào database.

- Migration `20261016_design_model_groups.sql`, runner `scripts/migrate-design-model-groups.mjs`: bảng design_model_groups và group_id tùy chọn trên design_models; mẫu cũ không bị thay đổi ngoài cột mới null.
- Form mẫu có ô chọn/tìm/tạo nhóm. Trang Mẫu mã có cột nhóm, bộ lọc nhóm và nút Nhóm mẫu mã để thêm/đổi tên/xóa nhóm không dùng. Không thêm sidebar danh mục thứ ba.
- GET/POST `/api/v1/design-model-groups`, GET/PATCH/DELETE `/api/v1/design-model-groups/:id`; tên nhóm không được trống hoặc trùng (không phân biệt hoa/thường). Xóa nhóm đang có mẫu bị chặn bằng kiểm tra nghiệp vụ và FK RESTRICT.
- Quyền mới `design_models.groups.manage`; xem nhóm dùng design_models.read. ADMIN được đồng bộ đủ quyền theo quy tắc mới, các tài khoản thông thường không được tự gán.
- Đổi nhóm/giá/mã mẫu không cập nhật các snapshot đã chốt trên dòng đơn hàng.

Các đoạn bên dưới mô tả lần bàn giao đầu tiên; nội dung khác với cập nhật này được thay thế bởi quyết định mới đã chốt.

Đã mở trực tiếp hai form qua phiên admin, đối chiếu bố cục desktop với prototype, kiểm tra ô nhóm và thêm/bỏ dòng BOM chưa lưu. Ảnh giao diện thực tế lưu trong `frontend/docs/catalog/screenshots/` (`design-create-desktop.jpg`, `component-create-desktop.jpg`, `component-create-mobile.jpg`). Không tạo dữ liệu thử trong database. Catalog hiện có 49 quyền, ADMIN có đủ quyền theo cơ chế đồng bộ đã chốt.

> Cập nhật quyền theo xác nhận mới của chủ hệ thống: ADMIN luôn có toàn bộ quyền đã đăng ký. Đã bổ sung đủ quyền vào vai trò ADMIN ở local; backend tự đồng bộ catalog và quyền ADMIN khi khởi động, script sync cũng áp dụng quy tắc này. Không tự cấp cho các vai trò/người dùng thông thường. Phần ghi nhận “chưa cấp quyền mới kể cả ADMIN” bên dưới là trạng thái tại lần bàn giao ban đầu, đã được thay thế bởi quy tắc này.

## Phạm vi đã triển khai

Hai danh mục Mẫu mã và Cấu kiện dùng API/database thật. Danh sách có tìm mã/tên, phân trang, trạng thái (riêng mẫu mã), chi tiết, thêm/sửa và thao tác ba chấm. Nhấn đúp dòng mở chi tiết. Mẫu mã có ảnh, trọng lượng mẫu vật lý, giá công đề xuất, mô tả, ghi chú; ngừng sử dụng tách biệt với xóa. Cấu kiện có kích thước, trọng lượng đơn vị và thuộc tính nhập bằng các cặp tên/giá trị, không yêu cầu nhập JSON thô.

BOM nằm trong chi tiết mẫu mã. Một mẫu có thể có nhiều BOM; tạo BOM là tùy chọn. Có thể thêm, sửa, bỏ dòng cấu kiện/nguyên liệu phụ và lưu toàn bộ thay đổi atomically. Backend lấy tên snapshot từ cấu kiện khi thêm; giữ snapshot khi sửa danh mục hoặc sửa số lượng trên cùng cấu kiện. Không tự tính trọng lượng mẫu, giá công hay tồn kho từ BOM.

Giá, trọng lượng, kích thước và số lượng BOM lưu numeric(20,4), nhận dạng chuỗi decimal và không chuyển qua Number để hạch toán. Giao diện dùng định dạng Việt Nam; tiền hiển thị số nguyên như `10.000B`, dữ liệu lưu vẫn giữ phần lẻ.

## Khảo sát và xử lý product_samples

Đã đọc schema public thực tế, khóa ngoại và các cột tham chiếu. Database local trước triển khai không có `design_models`, `product_samples`, `components`, `boms`, `bom_items`; code không có module tương ứng hoặc cơ chế upload đang hoạt động. Các mục danh mục trên sidebar trước đó là placeholder.

Vì không có bảng/dữ liệu `product_samples`, không có bản ghi cần chuyển ảnh/trọng lượng, không DROP bảng và không dựng dữ liệu giả. Migration chủ động dừng nếu phát hiện `product_samples` ở môi trường khác, để yêu cầu khảo sát dữ liệu và tham chiếu tại môi trường đó trước. Migration này không phải bộ chuyển dữ liệu product_samples chưa được khảo sát.

Sidebar chỉ giữ Mẫu mã và Cấu kiện, bỏ Mẫu sản phẩm. Route `/product-samples/*` chuyển về `/design-models`. Không có danh mục nguyên liệu phụ hoặc sidebar BOM riêng.

## Schema và file chính

- Migration `migrations/sql/20261015_design_catalog.sql`, runner `scripts/migrate-design-catalog.mjs`: đã áp dụng ở local qua cơ chế checksum hiện có.
- Các bảng `design_models`, `components`, `boms`, `bom_items`, `catalog_images`; audit người tạo/sửa, thời điểm, khóa ngoại RESTRICT, ràng buộc số không âm và mã duy nhất.
- Dòng đơn bổ sung `design_model_id`, `design_code_snapshot`, `design_image_snapshot`. Không sửa các dòng lịch sử; các cột mới ở dòng cũ để null.
- Prisma entity và contract đã cập nhật: `src/prisma/contract.prisma`, `contract.json`, `contract.d.ts`.
- Backend `src/catalog/`: DTO, service, controller và module; đăng ký trong `src/app.module.ts`. Dùng pg, transaction và security_audit như các module nghiệp vụ hiện tại, không thêm ORM khác.
- Frontend `src/pages/CatalogPage.tsx`, `src/features/catalog/`: API, form danh mục, upload/xem ảnh, quản lý BOM, chọn mẫu cho đơn hàng. Dùng PageFrame, DataTable, FilterRow, RequestError và Ant Design hiện có.
- Điều hướng: `app/router/`, `app/App.tsx`, `components/layout/Sidebar.tsx`, `HeaderBar.tsx`. Quyền: backend permission catalog và frontend PermissionMatrix.

## API

Các đường dẫn bên dưới có tiền tố `/api/v1`, yêu cầu đăng nhập và kiểm tra quyền backend:

| API | Chức năng |
|---|---|
| GET `/design-models` | Danh sách với q, status, page, page_size (tối đa 100) |
| POST `/design-models` | Thêm mẫu mã |
| GET/PATCH/DELETE `/design-models/:id` | Chi tiết/sửa/xóa có kiểm tra tham chiếu |
| PATCH `/design-models/:id/status` | Ngừng/tiếp tục sử dụng |
| POST `/design-models/images` | Upload khi tạo mẫu, multipart field file |
| POST `/design-models/:id/images` | Upload khi sửa mẫu |
| GET `/catalog-images/:id` | Đọc ảnh có xác thực |
| GET/POST `/design-models/:id/boms` | Liệt kê/tạo BOM |
| GET/PATCH `/boms/:id` | Chi tiết/lưu atomically danh sách dòng BOM |
| GET/POST `/components` | Danh sách với q, page, page_size / tạo cấu kiện |
| GET/PATCH/DELETE `/components/:id` | Chi tiết/sửa/xóa có kiểm tra tham chiếu |

PATCH danh mục gửi đầy đủ thông tin form cùng version từ chi tiết. PATCH BOM gửi danh sách dòng cuối cùng cùng version: dòng có id được sửa tại chỗ, dòng mới được thêm, dòng bị bỏ được xóa trong cùng transaction. Version chặn ghi đè dữ liệu đã đổi. DELETE gửi version trong body. Lỗi trùng mã, thiếu dữ liệu, số không hợp lệ và tham chiếu trả thông báo rõ ràng.

Mẫu có BOM hoặc đơn tham chiếu không được xóa; đề xuất ngừng sử dụng. Cấu kiện có BOM tham chiếu không được xóa. Không cascade dữ liệu lịch sử.

## Upload ảnh

Ảnh PNG/JPEG/WebP, tối đa 5 MB; backend kiểm tra chữ ký định dạng và giới hạn kích thước. Tên file trên đĩa là UUID do server sinh, không dùng tên/path do người dùng đưa vào. Metadata được lưu trong catalog_images, upload có audit và kiểm tra quyền. Trường image_url trỏ tới ảnh đã upload, không yêu cầu URL ngoài.

Ảnh lưu mặc định ở `backend/uploads/catalog` khi chạy từ thư mục backend; cấu hình `CATALOG_IMAGE_DIR` để dùng thư mục bền vững tại triển khai. Thư mục upload được loại khỏi Git. Cần giữ/backup cùng database. Thay hoặc bỏ ảnh trên mẫu không xóa file cũ vì đơn hàng có thể giữ snapshot ảnh đó. Ảnh upload nhưng hủy form cũng được giữ; chưa có thao tác dọn file tự động.

Frontend lấy ảnh qua apiClient có JWT, hiển thị từ blob URL và thu hồi URL khi bỏ component. Không gắn token lên URL ảnh công khai.

## Tích hợp đơn hàng và dữ liệu lịch sử

Người có quyền xem mẫu mã có thể chọn mẫu ACTIVE tại form đơn. Tên, trọng lượng và giá công BAHT đề xuất được điền vào dòng để người lập đơn xác nhận/chỉnh sửa. Mẫu không có trọng lượng/giá thì phải nhập thực tế theo validation của đơn. Với giá đề xuất ngoại tệ, không tự quy đổi sang BAHT: người lập đơn nhập giá BAHT thực tế.

Backend kiểm tra mẫu ACTIVE cho đơn mới, lưu liên kết cùng mã/ảnh snapshot; trọng lượng, tên dòng và giá thực tế vẫn lưu độc lập. Sửa giá/trạng thái/ảnh/mã mẫu không sửa đơn đã lập hoặc luồng giao hàng. Khi tách đơn, giữ nguyên liên kết, mã/ảnh và các giá trị đã chốt, kể cả mẫu đã ngừng sử dụng. Các đơn cũ chưa chọn mẫu tiếp tục sử dụng bình thường.

Database hiện chưa có module tồn kho thành phẩm hoặc sản xuất đang liên kết mẫu/BOM; không tạo lại tồn kho và không thêm quy trình sản xuất mới.

## Quyền và giới hạn bàn giao

Đã đăng ký chín quyền theo quy trình catalog hiện có:

- `design_models.read`, `.create`, `.update`, `.delete`.
- `components.read`, `.create`, `.update`, `.delete`.
- `boms.manage`.

Không gán các quyền mới cho người dùng, nhóm hoặc vai trò, kể cả ADMIN. Quản trị viên cấp quyền bằng Quản lý tài khoản hiện có. Để thao tác qua giao diện cần quyền xem danh mục tương ứng; quản lý BOM dùng quyền xem mẫu, xem cấu kiện để chọn và boms.manage để lưu. Không hard-code ADMIN hoặc bỏ qua kiểm tra backend.

Backend/frontend build và lint thành công, Prisma contract emit thành công. Không tạo dữ liệu mẫu trong danh mục hoặc đơn hàng. Chưa áp dụng migration production. Công cụ Figma MCP không trả được context do lỗi `link_id`; đã mở file Figma qua trình duyệt và đối chiếu trực quan các frame nêu ở phần cập nhật, giữ design system Ant Design và nghiệp vụ đã chốt.
