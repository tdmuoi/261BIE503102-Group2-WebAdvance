import { Component, computed, input } from '@angular/core';

import { BookType, CatalogBook } from '../../../../models/book';

interface BannerContent {
  tag: string;
  title: string;
  /** Chữ nghiêng Instrument Serif — chỉ tiếng Anh */
  accent: string;
  desc: string;
  cta: { label: string; path: string; queryParams?: Record<string, string> };
  sticker: [string, string, string];
  tone: 'pink' | 'mint' | 'yellow';
}

/**
 * Nội dung 3 biến thể banner theo Figma (893:9696 / 893:10118 / 893:10610).
 * Đây là chữ quảng cáo tĩnh của thiết kế, không lấy từ DB.
 */
const BANNERS: Record<BookType, BannerContent> = {
  new: {
    tag: '✦ Mới về tháng 10',
    title: 'Sách mới',
    accent: 'fresh arrivals',
    desc: 'Giảm 15% cho đơn từ 2 cuốn sách mới – áp dụng đến hết 31/10. Freeship cho đơn từ 300.000đ.',
    cta: { label: 'Xem ưu đãi', path: '/books', queryParams: { type: 'new', sale: 'true' } },
    sticker: ['Giảm', '15%', 'đơn từ 2 cuốn'],
    tone: 'pink',
  },
  used: {
    tag: '✦ Đã qua tay · thẩm định kỹ',
    title: 'Sách cũ',
    accent: 'second chances',
    desc: 'Sách được độc giả gửi lại, làm mới và gắn tem tình trạng – giá chỉ từ 40% giá bìa.',
    cta: { label: 'Thanh lý sách của bạn', path: '/book-buyback' },
    sticker: ['Chỉ từ', '40%', 'giá bìa'],
    tone: 'mint',
  },
  ebook: {
    tag: '✦ Đọc ngay, không chờ ship',
    title: 'Sách điện tử',
    accent: 'read anywhere',
    desc: 'Mua một lần, đọc trên mọi thiết bị với app Lightbook. Đồng bộ ghi chú và trang đang đọc.',
    // Chưa có trang tải app → tạm dẫn về tủ sách ebook trong tài khoản
    cta: { label: 'Tải app Lightbook', path: '/account/bookshelf-ebooks' },
    sticker: ['', '', ''],
    tone: 'yellow',
  },
};

/** Banner đầu trang Browse, đổi theo loại sách — Figma "Hero banner" */
@Component({
  selector: 'app-browse-banner',
  standalone: false,
  styleUrl: './browse-banner.css',
  templateUrl: './browse-banner.html',
})
export class BrowseBanner {
  readonly type = input.required<BookType>();
  /** Sách thuộc loại này (mới nhất trước) — lấy 3 bìa đầu làm hình minh hoạ */
  readonly books = input<CatalogBook[]>([]);

  protected readonly content = computed(() => BANNERS[this.type()]);

  protected readonly covers = computed(() => this.books().filter((book) => book.image).slice(0, 3));
}
