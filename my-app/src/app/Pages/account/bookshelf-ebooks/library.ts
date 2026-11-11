export type EbookFormat = 'EPUB' | 'PDF';

/** Một ebook trong tủ sách — GET /api/account/ebooks (my-server/routes/customer-account.js) */
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
