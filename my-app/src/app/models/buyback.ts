/** Hạng tình trạng sách theo bảng định giá thu mua */
export type ConditionGrade = 'like-new' | 'good' | 'fair';

/** Cách khách giao sách cho Lightbook — chỉ có 2 cách: mang đến chi nhánh hoặc gửi bưu điện */
export type DeliveryMethod = 'store' | 'post';

/** Hình thức nhận tiền thanh lý */
export type PayoutMethod = 'bank' | 'voucher';

/** Tình trạng chi tiết của một cuốn: mã lựa chọn trong buyback-rules.ts */
export interface BookCondition {
  cover: string | null;
  spine: string | null;
  pages: string | null;
  /** Chọn nhiều; "none" (Không có) loại trừ các lựa chọn khác */
  extras: string[];
}

/** Một cuốn trong phiếu thanh lý */
export interface BuybackItem {
  /** Sách trong DB nếu khách chọn từ gợi ý, null nếu tự nhập */
  bookId: string | null;
  title: string;
  author: string;
  quantity: number;
  /** Giá bìa in trên sách (VNĐ) */
  coverPrice: number;
  condition: BookCondition;
  note: string;
}

export interface BuybackCustomer {
  fullName: string;
  phone: string;
  email: string;
  province: string;
  /** Địa chỉ hoàn sách nếu sách không đạt thẩm định */
  returnAddress: string;
}

/** Nội dung phiếu thanh lý gửi lên server (ảnh gửi kèm riêng) */
export interface BuybackRequest {
  items: BuybackItem[];
  customer: BuybackCustomer;
  delivery: DeliveryMethod;
  /** Bắt buộc khi delivery = 'store' */
  branchId: string | null;
  payout: PayoutMethod;
  /** Khoảng giá ước tính hiển thị cho khách lúc gửi (VNĐ) */
  estimate: { min: number; max: number };
}

/** Kết quả server trả về khi tạo phiếu */
export interface BuybackResult {
  requestCode?: string;
}

/** Chi nhánh nhận sách trực tiếp */
export interface Branch {
  _id: string;
  name: string;
  address: string;
}
