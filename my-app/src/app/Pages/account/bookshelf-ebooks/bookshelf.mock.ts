import { Observable, delay, map } from 'rxjs';

import { Order } from '../../../models/account';
import { mockGetOrders } from '../orders/orders.mock';

// TODO: thay bằng API — my-server chưa có GET /api/account/ebooks (thư viện ebook + tiến độ đọc).
// Khi backend xong: đổi USE_MOCK_EBOOKS = false.
export const USE_MOCK_EBOOKS = true;

export type EbookFormat = 'EPUB' | 'PDF';

/** Một ebook trong tủ sách — GET /api/account/ebooks */
export interface LibraryEbook {
  bookId: string;
  title: string;
  author: string;
  translator?: string;
  image: string;
  format: EbookFormat;
  /** 0–100 */
  progress: number;
  page: number;
  totalPages: number;
  lastReadAt: string | null;
  purchasedAt: string;
  /** Dung lượng file tải về, MB */
  sizes: Record<EbookFormat, number>;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** 6 ebook đúng Figma "Tủ sách – Sách điện tử" */
const LIBRARY: LibraryEbook[] = [
  { bookId: 'mock-kitchen-ebook', title: 'Kitchen', author: 'Banana Yoshimoto', translator: 'Lương Việt Dũng', image: 'images/orders/cover-kitchen.png', format: 'EPUB', progress: 42, page: 58, totalPages: 140, lastReadAt: hoursAgo(2), purchasedAt: '2026-10-12T10:30:00+07:00', sizes: { EPUB: 2.1, PDF: 8.4 } },
  { bookId: 'mock-ho-so-mat-ebook', title: 'Hồ Sơ Mật', author: 'Ký sự an ninh điệp báo', image: 'images/orders/cover-ho-so-mat.png', format: 'EPUB', progress: 76, page: 243, totalPages: 320, lastReadAt: hoursAgo(30), purchasedAt: '2026-09-28T20:15:00+07:00', sizes: { EPUB: 3.2, PDF: 11.6 } },
  { bookId: 'mock-ove-ebook', title: 'Người Đàn Ông Mang Tên Ove', author: 'Fredrik Backman', image: 'images/orders/cover-ove.png', format: 'EPUB', progress: 12, page: 54, totalPages: 452, lastReadAt: hoursAgo(72), purchasedAt: '2026-09-20T09:00:00+07:00', sizes: { EPUB: 2.8, PDF: 9.9 } },
  { bookId: 'mock-yeu-ebook', title: 'Yêu – Being in Love', author: 'OSHO', image: 'images/orders/cover-yeu.png', format: 'EPUB', progress: 100, page: 268, totalPages: 268, lastReadAt: hoursAgo(120), purchasedAt: '2026-10-12T10:30:00+07:00', sizes: { EPUB: 1.9, PDF: 7.2 } },
  { bookId: 'mock-nhung-mien-linh-di', title: 'Những Miền Linh Dị', author: 'Dương Hành Triết', image: 'images/orders/cover-nhung-mien-linh-di.png', format: 'PDF', progress: 0, page: 0, totalPages: 384, lastReadAt: null, purchasedAt: '2026-09-05T15:00:00+07:00', sizes: { EPUB: 3.6, PDF: 14.2 } },
  { bookId: 'mock-roman-ebook', title: 'The Roman', author: 'Mika Waltari', image: 'images/orders/cover-roman.png', format: 'PDF', progress: 0, page: 0, totalPages: 512, lastReadAt: null, purchasedAt: '2026-09-01T15:00:00+07:00', sizes: { EPUB: 4.1, PDF: 16.8 } },
];

/** Thư viện mẫu + ebook trong các đơn mock (vd. vừa đặt ở trang Thanh toán) chưa có trong thư viện */
export function mockGetEbooks(): Observable<LibraryEbook[]> {
  return mockGetOrders().pipe(
    map((orders) => [...fromOrders(orders).filter((e) => !LIBRARY.some((l) => l.bookId === e.bookId)), ...LIBRARY.map((e) => ({ ...e }))]),
    delay(0),
  );
}

function fromOrders(orders: Order[]): LibraryEbook[] {
  return orders
    .filter((o) => o.status !== 'cancelled')
    .flatMap((o) =>
      o.items
        .filter((i) => i.format === 'ebook')
        .map((i) => ({
          bookId: i.bookId, title: i.title, author: i.author ?? '', image: i.image ?? '', format: 'EPUB' as const,
          progress: 0, page: 0, totalPages: 0, lastReadAt: null, purchasedAt: o.createdAt, sizes: { EPUB: 2, PDF: 8 },
        })),
    );
}

/** "đọc lần cuối 2 giờ trước" */
export function lastReadLabel(iso: string | null, now = new Date()): string {
  if (!iso) return 'chưa đọc';
  const hours = Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'vừa xong';
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hôm qua' : `${days} ngày trước`;
}

/** Nhãn nút đọc trên thẻ: Đọc ngay / Đọc tiếp / Đọc lại */
export function readLabel(progress: number): string {
  if (progress >= 100) return 'Đọc lại';
  return progress > 0 ? 'Đọc tiếp' : 'Đọc ngay';
}
