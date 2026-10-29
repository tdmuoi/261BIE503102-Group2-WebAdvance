import { Observable, delay, of } from 'rxjs';

import { AccountNotification, NotificationPage, NotificationType } from '../../../models/account';

// TODO: thay bằng API — my-server chưa có /api/account/notifications.
// Khi backend xong: đổi USE_MOCK_NOTIFICATIONS = false (menu bên cũng lấy số chưa đọc từ đây).
export const USE_MOCK_NOTIFICATIONS = true;
export const PAGE_SIZE = 6;

const HOUR = 3600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const todayAt = (h: number, m: number) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return (d.getTime() > Date.now() ? new Date(Date.now() - 30 * 60_000) : d).toISOString();
};

/** Nội dung lấy theo Figma "Pages/account/notifications · Thông báo" (+ 2 thông báo cũ hơn) */
let store: AccountNotification[] = [
  { _id: 'n1', type: 'order', icon: 'truck', title: 'Đơn #LB-24186 đang được giao', message: 'Shipper sẽ giao trong hôm nay, khoảng 14:00 – 18:00. Bạn nhớ để ý điện thoại nhé.', createdAt: ago(2 * HOUR), read: false, action: { label: 'Theo dõi đơn', link: '/account/orders' } },
  { _id: 'n2', type: 'buyback', icon: 'recycle', title: 'Yêu cầu thanh lý đã có báo giá', message: '3 cuốn sách của bạn được định giá 156.000đ. Chọn nhận tiền hoặc voucher +10% trong 48 giờ.', createdAt: ago(5 * HOUR), read: false, action: { label: 'Xem báo giá', link: '/book-buyback' } },
  { _id: 'n3', type: 'bookshelf', icon: 'book', title: 'Ebook mới đã vào tủ sách', message: '“Yêu – Being in Love” đã sẵn sàng để đọc trên web và app Lightbook.', createdAt: todayAt(8, 12), read: false, action: { label: 'Đọc ngay', link: '/account/bookshelf-ebooks' } },
  { _id: 'n4', type: 'promo', icon: 'tag', title: 'Flash sale 20:00 – 23:00 tối nay', message: 'Giảm đến 40% cho sách văn học và thiếu nhi, số lượng có hạn.', createdAt: ago(26 * HOUR), read: true },
  { _id: 'n5', type: 'promo', icon: 'heart', title: 'Sách trong wishlist đang giảm giá', message: '“The Roman” đang giảm còn 79.000đ – chỉ còn 6 cuốn.', createdAt: ago(50 * HOUR), read: true, action: { label: 'Mua ngay', link: '/account/wishlist' } },
  { _id: 'n6', type: 'order', icon: 'box', title: 'Đơn #LB-24102 đã hoàn tất', message: 'Viết đánh giá để nhận 50 điểm thưởng cho lần mua tiếp theo.', createdAt: '2026-10-16T09:00:00.000+07:00', read: true },
  { _id: 'n7', type: 'bookshelf', icon: 'book', title: 'Ebook “Kitchen” đã vào tủ sách', message: 'Bạn có thể đọc ngay trên web hoặc tải về máy.', createdAt: '2026-10-12T10:30:00.000+07:00', read: true, action: { label: 'Đọc ngay', link: '/account/bookshelf-ebooks' } },
  { _id: 'n8', type: 'order', icon: 'box', title: 'Đơn #LB-23977 đã hoàn tất', message: 'Cảm ơn bạn đã đọc cùng Lightbook.', createdAt: '2026-10-05T15:00:00.000+07:00', read: true },
];

export function mockUnreadCount(): number {
  return store.filter((n) => !n.read).length;
}

export function mockGetNotifications(type: NotificationType | 'all', page: number): Observable<NotificationPage> {
  const list = store
    .filter((n) => type === 'all' || n.type === type)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const items = list.slice(0, page * PAGE_SIZE).map((n) => ({ ...n }));
  return of({ items, total: list.length, unread: mockUnreadCount(), hasMore: list.length > items.length }).pipe(delay(300));
}

export function mockMarkRead(id: string): Observable<AccountNotification> {
  store = store.map((n) => (n._id === id ? { ...n, read: true } : n));
  return of({ ...store.find((n) => n._id === id)! }).pipe(delay(100));
}

export function mockMarkAllRead(): Observable<{ unread: number }> {
  store = store.map((n) => ({ ...n, read: true }));
  return of({ unread: 0 }).pipe(delay(200));
}
