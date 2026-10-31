import { NewsItem } from '../models/content';

/** Ảnh minh họa mặc định khi bài chưa có cover (public/images/news/) */
export const DEFAULT_NEWS_COVER = 'images/news/default.svg';

/** Ảnh minh họa của bài: cover trong DB → ảnh mặc định */
export function newsCover(item: NewsItem): string {
  return item.cover || item.img || DEFAULT_NEWS_COVER;
}

/** Ngày đăng dd/MM/yyyy */
export function newsDate(item: NewsItem): string {
  const iso = item.publishedAt || item.createdAt;
  return iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}
