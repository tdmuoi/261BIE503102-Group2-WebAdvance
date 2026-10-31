# Lightbook — hướng dẫn cho Claude

Dự án Angular + MongoDB: `my-app` (client), `my-admin` (quản trị), `my-server` (API, port 3002).

## Quy ước
- Git: chỉ dùng `git status` / `git diff`. KHÔNG commit, push, branch, checkout, merge, rebase, stash. Đầu phiên chạy `git status`; còn thay đổi chưa commit thì báo, không đụng vào. Xong mỗi việc thì dừng, liệt kê file thay đổi + gợi ý commit message.
- Dữ liệu động (sách, tác giả, sự kiện, bài viết, chi nhánh) lấy hoàn toàn từ MongoDB qua API thật. Không mock, không bản ghi giả. Field chưa có → ẩn UI tương ứng; danh sách rỗng → empty state. Nội dung tĩnh trong Figma (tiêu đề, mô tả, sticker) viết thẳng vào template.
- Không sửa `my-server`, không sửa DB. Thiếu endpoint/field → liệt kê cuối báo cáo.
- Form gửi dữ liệu (giữ chỗ sự kiện, newsletter, theo dõi tác giả): UI + Reactive Forms validate, lỗi tiếng Việt; gọi qua service với một chỗ duy nhất cần nối API; chưa có endpoint thì báo.
- `book-card` giữ nguyên ở mọi nơi, chấp nhận lệch Figma.
- Dải chữ chạy dùng lại `MarqueeComponent`; thiếu input thì báo trước khi sửa.
- Header: chỉ nối routerLink + active cho các mục menu; không đổi giao diện header.
- Bám design system sẵn có (CSS variables global), tiếng Việt, giá VNĐ, responsive theo breakpoint sẵn có. Loading/error/empty/"Không tìm thấy" dùng style status-card của trang chủ.
- Breadcrumb: chỉ trang nào Figma có mới làm, dùng chung một style.
- Mỗi file `.html` của page: comment link frame Figma tương ứng ở đầu file.
- Hoàn tất mỗi việc: `ng build` không lỗi, không warning mới; lazy modules, CSS mỗi component < 4kB.
- Nội dung HTML từ DB render qua `[innerHTML]` (sanitize mặc định). KHÔNG dùng `bypassSecurityTrust*`.

## Quy tắc hình ảnh
- Ảnh sách: mọi chỗ Figma có bìa sách → dùng `image` của sách thật trong DB, đúng sách liên quan.
- Ảnh tác giả: dùng ảnh từ DB (tròn, `object-fit: cover`, giữ viền/nền Figma). Không có/lỗi → fallback chữ viết tắt, màu nền xoay vòng theo palette.
- Ảnh tin tức (bài nổi bật, thẻ bài, cover news-detail, thẻ bài ở author-detail): ảnh riêng của bài, KHÔNG ghép bìa sách. Thứ tự: cover trong DB → SVG fallback theo category → ảnh mặc định.
  - SVG fallback tự vẽ theo phong cách Lightbook: nền pastel có lưới, khối phẳng, viền đen mảnh, sticker nghiêng. Không bìa sách/logo/hình có bản quyền.
  - Lưu ở `my-app/public/images/news/`, đúng tỉ lệ khung Figma; một ảnh mỗi category thực tế trong DB + một ảnh mặc định.

## Figma
- File "Lightbook - Visual Design" (fileKey `ZfMuDhU68BNYctxAZcNmET`), trang "Workpage - prototype". Chỉ ĐỌC, không sửa.
- Dùng `get_metadata` trên section để xem các frame, rồi `get_design_context` cho đúng frame đang làm; không đọc cả section một lần.
- Section Authors `876-6119`: author-list `876-6120`, author-detail `876-6509`, author-works `877-6713`, author-events `877-7008`.
- Section News `878-7225`: news-list `878-7226`, news-detail `879-7435` (+ biến thể `880-7637`).
