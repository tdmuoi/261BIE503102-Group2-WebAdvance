export type VoucherStatus = 'active' | 'paused' | 'scheduled' | 'expired';
export type DiscountType = 'percent' | 'amount' | 'shipping';

export interface VoucherPayload {
  name?: string;
  code: string;
  description: string;
  type: DiscountType;
  value: number;
  maxDiscount: number;
  minOrder: number;
  limit: number;
  perCustomer: number;
  start: string;
  end: string;
  categories: string[];
  newOnly: boolean;
  suggest: boolean;
  paused: boolean;
}

export interface Voucher extends VoucherPayload {
  isDemo?: boolean;
  _id: string;
  used: number;
  state: VoucherStatus;
  createdAt: string;
  updatedAt: string;
}

export type VoucherCounts = Record<'all' | VoucherStatus, number>;

export interface VoucherSummary {
  active: number;
  expiring: number;
  totalUses: number | null;
  revenue: number | null;
  discount: number | null;
}

export interface VoucherQuery {
  q?: string;
  status?: 'all' | VoucherStatus;
  page?: number;
  limit?: number;
}

export interface VoucherListResponse {
  items: Voucher[];
  total: number;
  page: number;
  limit: number;
  counts: VoucherCounts;
  summary: VoucherSummary;
  asOf: string;
  capabilities?: { categories: boolean; newOnly: boolean; suggest: boolean };
  dataNote?: string;
}

export interface VoucherReportItem {
  code: string;
  used: number;
  revenue: number;
  discount: number;
}

export interface VoucherReportResponse {
  dataAvailable: boolean;
  items: VoucherReportItem[];
  totalUses: number | null;
  revenue: number | null;
  discount: number | null;
  message: string;
}
