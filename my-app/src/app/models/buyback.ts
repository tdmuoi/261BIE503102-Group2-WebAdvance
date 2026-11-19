export type ConditionGrade = 'like-new' | 'good' | 'fair';

export type DeliveryMethod = 'store' | 'post';

export type PayoutMethod = 'bank' | 'voucher';

export interface BookCondition {
  cover: string[];
  spine: string[];
  pages: string[];
  extras: string[];
}

export interface BuybackItem {
  bookId: string | null;
  title: string;
  author: string;
  quantity: number;
  coverPrice: number;
  condition: BookCondition;
  note: string;
}

export interface BuybackCustomer {
  fullName: string;
  phone: string;
  email: string;
  province: string;
  returnAddress: string;
}

export interface BuybackRequest {
  items: BuybackItem[];
  customer: BuybackCustomer;
  delivery: DeliveryMethod;
  payout: PayoutMethod;
  images: string[];
  estimate: { min: number; max: number };
}

export interface BuybackResult {
  requestCode?: string;
}
