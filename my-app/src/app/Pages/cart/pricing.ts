import { ShippingMethod, VoucherResult } from '../../models/account';

/** Freeship cho đơn sách giấy từ 500.000đ (chỉ áp dụng Giao tiêu chuẩn) */
export const FREESHIP_MIN = 500_000;
export const SHIPPING_FEES: Record<ShippingMethod, number> = { standard: 30_000, express: 45_000 };

export interface PriceLine {
  price: number;
  quantity: number;
  ebook: boolean;
}

export interface Totals {
  /** Số đầu sách */
  itemCount: number;
  /** Tổng số cuốn */
  bookCount: number;
  subtotal: number;
  /** Giảm giá combo (10% các combo đủ sách) */
  comboDiscount: number;
  discount: number;
  shipping: number;
  total: number;
  /** Có sách giấy → cần giao hàng */
  hasPhysical: boolean;
  /** Còn thiếu bao nhiêu để được freeship (0 nếu đã đủ) */
  freeshipRemaining: number;
  freeshipProgress: number;
  /** Mã đang áp dụng nhưng đơn chưa đủ điều kiện (ví dụ chưa đạt đơn tối thiểu) */
  voucherError: string | null;
}

/** Giảm combo đã tính sẵn (ComboService.discountFor) */
export interface ComboTotals {
  amount: number;
  /** Có combo tự chọn → freeship giao tiêu chuẩn */
  freeship: boolean;
}

export function computeTotals(
  lines: PriceLine[],
  voucher: VoucherResult | null,
  method: ShippingMethod = 'standard',
  combo: ComboTotals = { amount: 0, freeship: false },
): Totals {
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const physical = lines.filter((l) => !l.ebook);
  const physicalSubtotal = physical.reduce((s, l) => s + l.price * l.quantity, 0);
  const hasPhysical = physical.length > 0;
  const comboDiscount = Math.min(combo.amount, subtotal);
  // Mã giảm giá tính trên số tiền sau khi đã trừ combo (cách tính giống my-server/routes/customer-pricing.js)
  const base = subtotal - comboDiscount;
  const voucherError = voucher && base < voucher.minOrderValue ? `Mã chỉ áp dụng cho đơn từ ${voucher.minOrderValue.toLocaleString('vi-VN')}đ` : null;
  let discount = 0;
  if (voucher && !voucherError) {
    if (voucher.type === 'percent') {
      discount = Math.round((base * voucher.value) / 100);
      if (voucher.maxDiscount && voucher.maxDiscount > 0) discount = Math.min(discount, voucher.maxDiscount);
    } else if (voucher.type === 'fixed') {
      discount = Math.min(voucher.value, base);
    }
  }
  const voucherFreeship = !!voucher && !voucherError && voucher.type === 'freeship' && method === 'standard';
  const comboFreeship = method === 'standard' && (combo.freeship || voucherFreeship);
  const freeship = comboFreeship || (method === 'standard' && physicalSubtotal >= FREESHIP_MIN);
  const shipping = !hasPhysical || freeship ? 0 : SHIPPING_FEES[method];
  return {
    itemCount: lines.length,
    bookCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    comboDiscount,
    discount,
    shipping,
    total: Math.max(0, subtotal - comboDiscount - discount + shipping),
    hasPhysical,
    freeshipRemaining: comboFreeship ? 0 : Math.max(0, FREESHIP_MIN - physicalSubtotal),
    freeshipProgress: comboFreeship ? 100 : Math.min(100, Math.round((physicalSubtotal / FREESHIP_MIN) * 100)),
    voucherError,
  };
}
