/** Luồng: pending -> approved -> received -> refunded | exchanged; từ chối được khi chưa nhận sách */
export type ReturnStatus = 'pending' | 'approved' | 'received' | 'refunded' | 'exchanged' | 'rejected';
export type ReturnReason = 'damaged' | 'wrong_item' | 'not_as_described' | 'missing' | 'changed_mind' | 'other';

export interface ReturnItem {
  bookId: string | null;
  title: string;
  image: string | null;
  price: number;
  quantity: number;
}

/** Yêu cầu đổi trả từ API admin (my-server/routes/admin-returns.js) */
export interface ReturnRequest {
  _id: string;
  requestCode: string;
  orderId: string | null;
  orderCode: string;
  userId: string | null;
  customer: { name: string; phone: string; email: string };
  items: ReturnItem[];
  /** Tổng giá trị sách khách muốn trả */
  itemsValue: number;
  /** refund: hoàn tiền | exchange: đổi sách khác */
  type: 'refund' | 'exchange';
  reason: ReturnReason;
  description: string;
  images?: string[];
  refundMethod: string;
  bankInfo?: { bankName?: string; accountName?: string; accountNumber?: string } | null;
  refundAmount: number | null;
  status: ReturnStatus;
  nextStatuses: ReturnStatus[];
  statusHistory?: { status: ReturnStatus; at: string; note: string | null }[];
  adminNote?: string;
  restocked: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** Chỉ có ở API chi tiết */
  order?: { _id: string; orderCode: string; total: number; status: string; paymentMethod: string; createdAt: string | null } | null;
}

export interface ReturnQuery {
  q?: string;
  /** open = đang xử lý (chờ duyệt + chờ nhận sách + đã nhận sách) */
  status?: '' | 'open' | ReturnStatus;
  type?: '' | 'refund' | 'exchange';
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ReturnListResponse {
  items: ReturnRequest[];
  total: number;
  page: number;
  limit: number;
  counts: Record<'all' | 'open' | ReturnStatus, number>;
  reasons: Record<ReturnReason, number>;
  refundedTotal: number;
}

export const RETURN_STATUS: Record<ReturnStatus, { label: string; tone: 'ok' | 'warn' | 'info' | 'bad' | 'mute' }> = {
  pending: { label: 'Chờ duyệt', tone: 'warn' },
  approved: { label: 'Chờ nhận sách', tone: 'info' },
  received: { label: 'Đã nhận sách', tone: 'info' },
  refunded: { label: 'Đã hoàn tiền', tone: 'ok' },
  exchanged: { label: 'Đã đổi sách', tone: 'ok' },
  rejected: { label: 'Từ chối', tone: 'bad' },
};

export const RETURN_REASON: Record<ReturnReason, string> = {
  damaged: 'Sách lỗi / hư hỏng',
  wrong_item: 'Giao sai sách',
  not_as_described: 'Không đúng mô tả',
  missing: 'Thiếu sách',
  changed_mind: 'Đổi ý',
  other: 'Lý do khác',
};

export const REFUND_METHOD: Record<string, string> = {
  original: 'Hoàn về phương thức thanh toán ban đầu',
  bank_transfer: 'Chuyển khoản ngân hàng',
  store_credit: 'Cộng vào ví Lightbook',
};
