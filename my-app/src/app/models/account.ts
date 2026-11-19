export type Gender = 'female' | 'male' | 'other';

export interface AccountProfile {
  _id: string;
  fullName: string;
  username: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  birthday: string | null;
  gender: Gender | null;
  avatar: string | null;
  tier: string;
  memberId: string;
  passwordChangedAt: string | null;
  twoFactorEnabled: boolean;
}

export interface UpdateProfileRequest {
  fullName: string;
  phone: string | null;
  birthday: string | null;
  gender: Gender | null;
  twoFactorEnabled: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ---------- Sổ địa chỉ ----------
export type AddressType = 'home' | 'office' | 'school';

export interface Address {
  _id: string;
  fullName: string;
  phone: string;
  province: string;
  ward: string;
  street: string;
  type: AddressType;
  isDefault: boolean;
}

export type AddressRequest = Omit<Address, '_id'>;

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
  createdAt: string;
  read: boolean;
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
export type ItemFormat = 'print' | 'ebook';

export interface OrderItem {
  bookId: string;
  title: string;
  image: string | null;
  price: number;
  quantity: number;
  format: ItemFormat;
  variant?: string;
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
  paymentStatus: 'paid' | 'unpaid' | 'refunded';
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string; note?: string | null }[];
  shippingAddress: ShippingAddress | null;
  note: string;
  trackingCode?: string | null;
  createdAt: string;
}

export interface CreateOrderRequest {
  items: { bookId: string; quantity: number }[];
  addressId: string | null;
  shippingMethod: ShippingMethod | null;
  paymentMethod: PaymentMethod;
  voucherCode: string | null;
  note: string;
  combos?: { bookIds: string[]; freeship: boolean }[];
}

export type VoucherType = 'percent' | 'fixed' | 'freeship';

export interface VoucherRequest {
  code: string;
  items: { bookId: string; quantity: number }[];
  combos?: { bookIds: string[]; freeship: boolean }[];
  shippingMethod?: ShippingMethod;
}

export interface VoucherResult {
  code: string;
  type: VoucherType;
  value: number;
  maxDiscount: number | null;
  minOrderValue: number;
  description: string;
}
