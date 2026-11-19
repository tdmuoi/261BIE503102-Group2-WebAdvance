export type OrderStatus = 'pending' | 'confirmed' | 'shipping' | 'delivered' | 'cancelled' | 'returned';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface OrderItem {
  bookId: string | null;
  title: string;
  image: string | null;
  price: number;
  quantity: number;
  format: 'print' | 'ebook';
}

export interface ShippingAddress {
  fullName?: string;
  phone?: string;
  address?: string;
  ward?: string;
  district?: string;
  province?: string;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  at: string;
  note: string | null;
}

export interface Order {
  isDemo?: boolean;
  _id: string;
  orderCode: string;
  userId: string | null;
  customer: { name: string; email: string; phone: string };
  shippingAddress?: ShippingAddress | null;
  items: OrderItem[];
  itemCount: number;
  onlyEbooks: boolean;
  subtotal: number;
  shippingFee: number;
  discount: number;
  voucherCode: string | null;
  total: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  paymentMode?: 'standard' | 'demo';
  demoPayment?: { status: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'expired'; reference?: string; amount?: number; confirmedAt?: string; expiresAt?: string } | null;
  status: OrderStatus;
  nextStatuses: OrderStatus[];
  statusHistory?: StatusHistoryEntry[];
  note: string;
  adminNote?: string;
  trackingCode: string;
  stockDeducted: boolean;
  restocked: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface OrderQuery {
  q?: string;
  status?: '' | OrderStatus;
  payment?: '' | PaymentStatus;
  from?: string;
  to?: string;
  sort?: 'newest' | 'oldest' | 'total_desc' | 'total_asc';
  page?: number;
  limit?: number;
}

export interface OrderListResponse {
  items: Order[];
  total: number;
  page: number;
  limit: number;
  counts: Record<'all' | OrderStatus, number>;
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'ok' | 'warn' | 'info' | 'bad' | 'mute' }> = {
  pending: { label: 'Chờ xác nhận', tone: 'warn' },
  confirmed: { label: 'Chờ lấy hàng', tone: 'info' },
  shipping: { label: 'Đang giao', tone: 'info' },
  delivered: { label: 'Đã giao', tone: 'ok' },
  cancelled: { label: 'Đã huỷ', tone: 'bad' },
  returned: { label: 'Trả hàng', tone: 'bad' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: 'ok' | 'warn' | 'mute' }> = {
  unpaid: { label: 'Chưa thanh toán', tone: 'warn' },
  paid: { label: 'Đã thanh toán', tone: 'ok' },
  refunded: { label: 'Đã hoàn tiền', tone: 'mute' },
};

export const PAYMENT_METHOD: Record<string, string> = {
  qr_demo: 'QR mô phỏng (DEMO — không chuyển tiền thật)',
  cod: 'Thanh toán khi nhận hàng (COD)',
  bank_transfer: 'Chuyển khoản ngân hàng',
  momo: 'Ví MoMo',
  vnpay: 'VNPay',
};

export const DEMO_PAYMENT_STATUS: Record<string, string> = {
  pending: 'Chờ thanh toán demo', succeeded: 'Thanh toán demo thành công',
  failed: 'Thanh toán demo thất bại', cancelled: 'Đã hủy thanh toán demo', expired: 'Hết hạn thanh toán demo',
};
