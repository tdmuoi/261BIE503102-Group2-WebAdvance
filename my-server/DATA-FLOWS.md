# Luồng ghi dữ liệu cho các collection trước đây còn trống

Khởi động lại backend (`cd my-server; npm start`) và tải lại web khách sau khi cập nhật code.
Các collection nhận dữ liệu từ thao tác thực tế; không tự thêm giỏ hàng, đăng ký hay OTP giả.
Các kiểm tra tự động dùng fixture trong bộ nhớ, không ghi dữ liệu thử vào database dùng chung.

| Collection | Thao tác tạo/cập nhật |
| --- | --- |
| `carts` | Đăng nhập rồi thêm/xóa/đổi số lượng sách, hoặc dọn giỏ sau khi đặt hàng. |
| `event_registrations` | Gửi form giữ chỗ tại trang sự kiện sắp diễn ra. |
| `shipments` | Đặt đơn có sách giấy và địa chỉ nhận; hủy đơn, chuyển trạng thái, hoàn trả và sửa mã vận đơn đồng bộ bản ghi này. |
| `otp` | Đăng ký, đăng nhập cần xác minh/2FA, hoặc quên mật khẩu qua luồng OTP hiện có. |
| `audit_logs` | Thao tác POST/PUT/PATCH/DELETE quản trị thành công, đã xác thực. |

## Chi tiết vận hành

- Giỏ khách chưa đăng nhập vẫn dùng localStorage. Khi đăng nhập, giỏ khách gộp vào giỏ tài khoản bằng số lượng lớn hơn cho sách trùng. Cache và thay đổi chưa đồng bộ được tách theo tài khoản. Ghi tuần tự và so sánh `revision` để tránh request cũ ghi đè giỏ mới. Khi xung đột thiết bị, service giữ bản chưa đồng bộ trong cache riêng và không tự ghi đè bản trên server. Đồng bộ chạy ở tầng dữ liệu; giữ nguyên template, component trang và không thêm thông báo hay hộp thoại. Giá khi thanh toán vẫn tính từ sách trên server.
- Đặt chỗ dùng form hiện có, không bắt buộc tài khoản. Một email giữ chỗ một lần cho mỗi sự kiện; gửi lại cùng nội dung không tăng số chỗ. Mỗi đăng ký 1–5 chỗ. Đếm chỗ và lưu đăng ký nằm cùng transaction, không vượt capacity khi có request đồng thời. Email nhận lịch vẫn lưu riêng ở `newsletters`.
- `orders` tiếp tục là nguồn thông tin đơn hàng. `shipments._id` bằng `_id` đơn; chỉ đơn có sách giấy, địa chỉ và chủ sở hữu, không phải dữ liệu seed `isDemo`, mới tạo shipment. Đồng bộ cùng transaction, không tự gọi hãng vận chuyển, không tự tạo mã vận đơn. Khi chưa có mã vận đơn, lưu `null` để không xung đột index unique dành cho chuỗi. Đơn cũ có thể được bổ sung shipment qua lệnh bảo trì bên dưới.
- OTP mới lưu vào `otp`; lúc backend khởi động, mã chưa dùng và còn hạn trong `otp_challenges` được sao chép với nguyên ID, hash, số lần thử và hạn dùng. Bản đã có trong `otp` không bị ghi đè. Collection cũ được giữ nguyên. Dừng instance backend cũ trước khi chạy bản mới để tránh hai phiên bản ghi hai nơi. TTL xóa OTP một giờ sau hạn dùng nên `otp` có thể trống khi không có yêu cầu mới; đây là hành vi bình thường. Index TTL cũ `otp_expire` trên `createdAt` (600 giây) được bỏ để không xóa sớm mã đã gửi lại; các index khác được giữ nguyên. Cấu hình gửi email tiếp tục dùng Gmail/SMTP trong `middleware/mailer.js`.
- Audit chỉ ghi thông tin người thao tác, loại thao tác, đường dẫn không có query, đối tượng và thời gian; không ghi body, token, mật khẩu hoặc OTP. Không ghi GET, lỗi HTTP hoặc thao tác chưa xác thực. Ghi sau khi HTTP hoàn tất, theo cơ chế best effort; lỗi ghi log xuất hiện trong terminal và không đảo ngược thao tác đã thành công.
- Giữ nguyên validator của các collection trên MongoDB. Backend chuẩn bị index OTP trước khi nhận request. Các luồng transaction cần MongoDB replica set/Atlas như luồng đặt hàng hiện có.

## Bổ sung dữ liệu lịch sử

Chạy trong `my-server`: `node scripts/reconcile-data-flows.js --apply`.

Lệnh chỉ sao chép OTP cũ chưa dùng còn hạn, chuẩn bị index OTP, và thêm shipment còn thiếu từ đơn hiện có. Không gửi email, không tạo OTP mới, không sửa đơn hàng, tồn kho, thanh toán hay shipment đã tồn tại. Nhận diện shipment theo cả `_id` và `orderId`; toàn bộ phần bổ sung shipment nằm trong transaction. Có thể chạy lại mà không tạo trùng.

Đã áp dụng trên `lightbooks_web2_dev`: thêm 47 shipment, tổng 48; chạy lại thêm 0. Tại lúc xác nhận có 2 OTP còn hạn ở `otp` và backend đã nạp bản code mới.

## Kiểm tra

Luồng MoMo đã được khôi phục: giao diện mở cổng MoMo đã cấu hình và xác nhận theo kết quả từ MoMo. Đã gỡ bộ đếm tự xác nhận 10 giây và tắt Demo trên database dev theo yêu cầu khôi phục. Lịch sử đơn hàng được giữ nguyên.

Dọn ebook thiếu PDF: `node scripts/prune-ebooks-without-pdf.js` chỉ kiểm tra; thêm `--apply` để xóa khỏi danh mục theo cơ chế `status: deleted`, giữ lịch sử đơn hàng. Script kiểm tra liên kết GridFS và nội dung PDF thực; lỗi tải file làm dừng kiểm tra, không xóa sách vì lỗi mạng tạm thời. Đã giữ 7 ebook có PDF hợp lệ và loại 2 ebook chưa có PDF cho trình đọc.

Backend: `node --test routes/*.test.js middleware/*.test.js`.

Frontend (PowerShell, Node 26):

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'
npm.cmd test -- --watch=false --include='src/app/services/cart-service.spec.ts' --include='src/app/Pages/cart/cart.spec.ts' --include='src/app/Pages/checkout/**/*.spec.ts'
npm.cmd run build -- --configuration development
```

Tắt Web Storage của Node trong test để jsdom cung cấp localStorage đúng với môi trường trình duyệt; không cần đổi cấu hình ứng dụng.

Toàn bộ 219 test giao diện đã qua; build development thành công. Build production bị chặn bởi budget initial 1 MB. Bản HEAD chưa sửa cũng vượt budget khi build trong thư mục tạm riêng, nên không sửa cấu hình hoặc các module khác để xử lý vấn đề này.
