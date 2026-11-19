import { Component, computed, input } from '@angular/core';

import { BookType, CatalogBook } from '../../../../models/book';

interface BannerContent {
  tag: string;
  title: string;
  accent: string;
  desc: string;
  cta: { label: string; path: string; queryParams?: Record<string, string> };
  sticker: [string, string, string];
  tone: 'pink' | 'mint' | 'yellow';
}

const BANNERS: Record<BookType, BannerContent> = {
  new: {
    tag: '✦ Mới về tháng 10',
    title: 'Sách mới',
    accent: 'fresh arrivals',
    desc: 'Giảm 15% cho đơn từ 2 cuốn sách mới – áp dụng đến hết 31/10. Ưu đãi vận chuyển theo chính sách hiện hành.',
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
    desc: 'Đọc sách trên Lightbook sau khi được cấp quyền hợp lệ. Đồng bộ ghi chú và trang đang đọc trong tài khoản.',
    cta: { label: 'Vào tủ sách', path: '/account/bookshelf-ebooks' },
    sticker: ['', '', ''],
    tone: 'yellow',
  },
};

@Component({
  selector: 'app-browse-banner',
  standalone: false,
  styleUrl: './browse-banner.css',
  templateUrl: './browse-banner.html',
})
export class BrowseBanner {
  readonly type = input.required<BookType>();
  readonly books = input<CatalogBook[]>([]);

  protected readonly content = computed(() => BANNERS[this.type()]);

  protected readonly covers = computed(() => this.books().filter((book) => book.image).slice(0, 3));
}
