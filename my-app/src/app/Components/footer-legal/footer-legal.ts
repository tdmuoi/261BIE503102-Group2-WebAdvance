import { Component, signal } from '@angular/core';

type LegalDoc = 'privacy' | 'terms';

/**
 * Link mạng xã hội ở chân trang — điền địa chỉ thật khi có.
 * Để trống thì link chưa bấm được.
 */
export const SOCIAL_LINKS = {
  instagram: '',
  facebook: '',
};

export const LEGAL_DOCS: Record<LegalDoc, { title: string; updated: string; sections: { heading: string; body: string }[] }> = {
  privacy: {
    title: 'Chính sách bảo mật',
    updated: 'Cập nhật 11/2026',
    sections: [
      { heading: 'Thông tin chúng tôi thu thập', body: 'Họ tên, email, số điện thoại, địa chỉ nhận hàng và lịch sử đơn hàng khi bạn đăng ký tài khoản hoặc đặt mua sách.' },
      { heading: 'Mục đích sử dụng', body: 'Xử lý và giao đơn hàng, chăm sóc khách hàng, gửi thông báo về đơn và (nếu bạn đồng ý) bản tin sách mới. Lightbook không bán thông tin của bạn cho bên thứ ba.' },
      { heading: 'Chia sẻ thông tin', body: 'Chỉ chia sẻ những gì cần thiết với đơn vị vận chuyển và cổng thanh toán để hoàn tất đơn hàng của bạn.' },
      { heading: 'Lưu trữ trên trình duyệt', body: 'Website lưu giỏ hàng, danh sách yêu thích và tuỳ chỉnh đọc ebook ngay trên trình duyệt để bạn dùng tiện hơn.' },
      { heading: 'Quyền của bạn', body: 'Bạn có thể xem, sửa thông tin trong mục Tài khoản hoặc yêu cầu xoá tài khoản bằng cách liên hệ hello@lightbook.vn.' },
    ],
  },
  terms: {
    title: 'Điều khoản sử dụng',
    updated: 'Cập nhật 11/2026',
    sections: [
      { heading: 'Tài khoản', body: 'Bạn chịu trách nhiệm giữ bảo mật mật khẩu và mọi hoạt động trên tài khoản của mình.' },
      { heading: 'Đặt hàng & thanh toán', body: 'Giá và tồn kho có thể thay đổi. Đơn hàng chỉ được xác nhận khi Lightbook gửi thông báo xác nhận; đơn thanh toán online cần hoàn tất trong thời gian giữ mã.' },
      { heading: 'Giao hàng & đổi trả', body: 'Sách giấy được đổi trả trong 7 ngày nếu lỗi in ấn hoặc hư hỏng khi vận chuyển. Ebook đã tải về không áp dụng đổi trả.' },
      { heading: 'Ebook', body: 'Ebook chỉ dùng cho mục đích đọc cá nhân, gắn với tài khoản của bạn, tối đa 3 thiết bị; không sao chép hay phát tán lại.' },
      { heading: 'Liên hệ', body: 'Mọi thắc mắc vui lòng gửi về hello@lightbook.vn hoặc ghé 442 Cộng Hòa, Hồ Chí Minh.' },
    ],
  },
};

/**
 * Nhóm link cuối chân trang: Privacy Policy, Terms of Service (mở pop-up nội dung), Instagram, Facebook.
 * Dùng trong page-footer: <app-footer-legal />
 */
@Component({
  selector: 'app-footer-legal',
  standalone: false,
  styleUrl: './footer-legal.css',
  templateUrl: './footer-legal.html',
  host: { '(document:keydown.escape)': 'open.set(null)' },
})
export class FooterLegal {
  readonly social = SOCIAL_LINKS;
  readonly docs = LEGAL_DOCS;
  readonly open = signal<LegalDoc | null>(null);
}
