// Kiểu dữ liệu cho sự kiện giao lưu (/api/events) và Lightbook News (/api/news).
// Các field đánh dấu ? có thể chưa có trong DB — UI tự ẩn phần tương ứng.

/** Sự kiện giao lưu tác giả */
export interface LbEvent {
  _id: string;
  eventCode?: string;
  title: string;
  description?: string | null;
  /** ISO date — server chỉ trả sự kiện đã có ngày */
  startAt: string;
  endAt?: string | null;
  location?: string | null;
  /** online / offline (tại cửa hàng) */
  format?: 'online' | 'offline' | null;
  /** Loại sự kiện, ví dụ "Author Talk" */
  type?: string | null;
  authorId?: string | null;
  guests?: string[] | null;
  capacity?: number | null;
  registeredCount?: number | null;
  /** Sách liên quan — dùng để lấy bìa sách thật */
  bookIds?: string[] | null;
  recordingUrl?: string | null;
  image?: string | null;
}

/** Bài viết Lightbook News (danh sách không kèm content) */
export interface NewsItem {
  _id: string;
  id?: string;
  title: string;
  desc?: string | null;
  category?: string | null;
  tag?: string | null;
  cover?: string | null;
  img?: string | null;
  imageCredit?: string | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  views?: number;
  readMinutes: number;
  content?: string;
  contentFormat?: string | null;
  /** Các field dưới chưa có trong DB — có thì UI tự hiện */
  quote?: string | null;
  author?: { name: string; role?: string | null; bio?: string | null; avatar?: string | null } | null;
  bookIds?: string[] | null;
  tags?: string[] | null;
}

export interface NewsPage {
  items: NewsItem[];
  total: number;
  categories: string[];
}
