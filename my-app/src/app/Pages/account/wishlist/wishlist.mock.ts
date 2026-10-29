import { WishlistItem } from '../../../services/wishlist-service';

// TODO: thay bằng API — my-server chưa có /api/account/wishlist. Wishlist hiện lưu localStorage (WishlistService).
// Cờ này chỉ để có dữ liệu mẫu giống Figma lần đầu mở trang; khi có API thì đổi thành false.
export const SEED_DEMO_WISHLIST = true;

const STORAGE_KEY = 'lightbook.wishlist';

/** Thông tin sách mẫu không có trong danh mục (tác giả, giá gốc) */
export const DEMO_DETAILS: Record<string, { author: string; originalPrice: number }> = {
  'mock-roman': { author: 'Mika Waltari', originalPrice: 99000 },
  'mock-nhung-mien-linh-di-print': { author: 'Dương Hành Triết', originalPrice: 135000 },
  'mock-lu-tre-3': { author: 'David Walliams', originalPrice: 240000 },
  'mock-bo-con-ca-gai': { author: 'Cho Chang-in', originalPrice: 98000 },
  'mock-ove': { author: 'Fredrik Backman', originalPrice: 115000 },
};

/** 5 cuốn đúng Figma "Tủ sách – Wishlist" */
const DEMO: WishlistItem[] = [
  { bookId: 'mock-roman', title: 'The Roman', image: 'images/orders/cover-roman.png', price: 79000, addedAt: '2026-10-20T10:00:00+07:00' },
  { bookId: 'mock-nhung-mien-linh-di-print', title: 'Những Miền Linh Dị', image: 'images/orders/cover-nhung-mien-linh-di.png', price: 135000, addedAt: '2026-10-18T10:00:00+07:00' },
  { bookId: 'mock-lu-tre-3', title: 'Lũ Trẻ Hư Nhất Quả Đất 3', image: 'images/orders/cover-lu-tre.png', price: 204000, addedAt: '2026-10-15T10:00:00+07:00' },
  { bookId: 'mock-bo-con-ca-gai', title: 'Bố Con Cá Gai', image: 'images/orders/cover-bo-con-ca-gai.png', price: 98000, addedAt: '2026-10-10T10:00:00+07:00' },
  { bookId: 'mock-ove', title: 'Người Đàn Ông Mang Tên Ove', image: 'images/orders/cover-ove.png', price: 115000, addedAt: '2026-10-01T10:00:00+07:00' },
];

/** Ghi wishlist mẫu nếu người dùng chưa từng có wishlist. Trả về true nếu đã ghi. */
export function seedDemoWishlist(): boolean {
  try {
    if (!SEED_DEMO_WISHLIST || localStorage.getItem(STORAGE_KEY) !== null) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO));
    // WishlistService đọc lại khi có sự kiện "storage"
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    return true;
  } catch {
    return false;
  }
}
