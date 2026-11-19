export type EbookFormat = 'EPUB' | 'PDF';

export interface LibraryEbook {
  bookId: string;
  title: string;
  author: string;
  translator?: string;
  image: string;
  format: EbookFormat;
  progress: number;
  page: number;
  totalPages: number;
  lastReadAt: string | null;
  purchasedAt: string;
  sizes: Record<EbookFormat, number>;
}

export function lastReadLabel(iso: string | null, now = new Date()): string {
  if (!iso) return 'chưa đọc';
  const hours = Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'vừa xong';
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hôm qua' : `${days} ngày trước`;
}

export function readLabel(progress: number): string {
  if (progress >= 100) return 'Đọc lại';
  return progress > 0 ? 'Đọc tiếp' : 'Đọc ngay';
}
