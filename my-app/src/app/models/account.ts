/** Giới tính trong hồ sơ */
export type Gender = 'female' | 'male' | 'other';

/** Hồ sơ tài khoản như GET /api/account/profile trả về */
export interface AccountProfile {
  _id: string;
  fullName: string;
  /** Tên đăng nhập — không cho sửa */
  username: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  /** yyyy-mm-dd */
  birthday: string | null;
  gender: Gender | null;
  avatar: string | null;
  /** Hạng thành viên, ví dụ "Thành viên Bạc" */
  tier: string;
  /** Mã thành viên hiển thị ở menu bên */
  memberId: string;
  /** ISO — lần đổi mật khẩu gần nhất */
  passwordChangedAt: string | null;
  twoFactorEnabled: boolean;
}

/** Body PUT /api/account/profile */
export interface UpdateProfileRequest {
  fullName: string;
  phone: string | null;
  birthday: string | null;
  gender: Gender | null;
  twoFactorEnabled: boolean;
}

/** Body PUT /api/account/password */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ---------- Sổ địa chỉ ----------
export type AddressType = 'home' | 'office' | 'school';

/** Địa chỉ nhận hàng — 2 cấp Tỉnh/Thành → Phường/Xã (theo đơn vị hành chính từ 01/07/2025) */
export interface Address {
  _id: string;
  fullName: string;
  phone: string;
  province: string;
  ward: string;
  /** Số nhà, tên đường, toà nhà… */
  street: string;
  type: AddressType;
  isDefault: boolean;
}

export type AddressRequest = Omit<Address, '_id'>;

/** Tỉnh/thành và danh sách phường/xã — GET /api/locations */
export interface Province {
  code: string;
  name: string;
  wards: string[];
}

// ---------- Thông báo ----------
export type NotificationType = 'order' | 'promo' | 'buyback' | 'bookshelf';
export type NotificationIcon = 'truck' | 'recycle' | 'book' | 'tag' | 'heart' | 'box';

export interface AccountNotification {
  _id: string;
  type: NotificationType;
  icon: NotificationIcon;
  title: string;
  message: string;
  /** ISO */
  createdAt: string;
  read: boolean;
  /** Nút hành động, ví dụ "Theo dõi đơn" → /account/orders */
  action?: { label: string; link: string } | null;
}

export interface NotificationPage {
  items: AccountNotification[];
  total: number;
  unread: number;
  hasMore: boolean;
}

// ---------- Đơn hàng (bám theo schema orders ở my-server/routes/admin-orders.js) ----------
export type OrderStatus = 'pending' | 'confirmed' | 'shipping' | 'delivered' | 'cancelled' | 'returned';
export type ShippingMethod = 'standard' | 'express';
export type PaymentMethod = 'momo' | 'vnpay' | 'bank_transfer' | 'cod';
/** print = sách giấy (mới/cũ), ebook = sách điện tử */
export type ItemFormat = 'print' | 'ebook';

export interface OrderItem {
  bookId: string;
  title: string;
  image: string | null;
  price: number;
  quantity: number;
  format: ItemFormat;
  /** "Sách mới" · "Sách cũ · 90% mới" · "Sách điện tử · EPUB" */
  variant?: string;
  /** Tên tác giả lúc mua (hiện ở Tủ sách) */
  author?: string;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  address: string;
  ward: string;
  province: string;
}

export interface Order {
  _id: string;
  orderCode: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  voucherCode: string | null;
  total: number;
  shippingMethod: ShippingMethod | null;
  paymentMethod: PaymentMethod;
  paymentStatus: 'paid' | 'unpaid';
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string; note?: string | null }[];
  /** null khi đơn chỉ có sách điện tử */
  shippingAddress: ShippingAddress | null;
  note: string;
  createdAt: string;
}

/** Body POST /api/orders */
export interface CreateOrderRequest {
  items: { bookId: string; quantity: number }[];
  addressId: string | null;
  shippingMethod: ShippingMethod | null;
  paymentMethod: PaymentMethod;
  voucherCode: string | null;
  note: string;
}

/** Kết quả kiểm tra mã giảm giá — POST /api/vouchers/validate */
export interface VoucherResult {
  code: string;
  percent: number;
  description: string;
}
