import { ShippingMethod, VoucherResult } from '../../models/account';

export const FREESHIP_MIN = 500_000;
export const SHIPPING_FEES: Record<ShippingMethod, number> = { standard: 30_000, express: 45_000 };

export interface PriceLine {
  price: number;
  quantity: number;
  ebook: boolean;
}

export interface Totals {
  itemCount: number;
  bookCount: number;
  subtotal: number;
  comboDiscount: number;
  discount: number;
  shipping: number;
  total: number;
  hasPhysical: boolean;
  freeshipRemaining: number;
  freeshipProgress: number;
  voucherError: string | null;
}

export interface ComboTotals {
  amount: number;
  freeship: boolean;
}

export function computeTotals(
  lines: PriceLine[],
  voucher: VoucherResult | null,
  method: ShippingMethod = 'standard',
  combo: ComboTotals = { amount: 0, freeship: false },
  shippingSettings?: { standardFee: number; expressFee: number; freeShippingThreshold: number },
): Totals {
  const threshold = shippingSettings?.freeShippingThreshold ?? FREESHIP_MIN;
  const fees = shippingSettings ? { standard: shippingSettings.standardFee, express: shippingSettings.expressFee } : SHIPPING_FEES;
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const physical = lines.filter((l) => !l.ebook);
  const physicalSubtotal = physical.reduce((s, l) => s + l.price * l.quantity, 0);
  const hasPhysical = physical.length > 0;
  const comboDiscount = Math.min(combo.amount, subtotal);
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
  const freeship = comboFreeship || (method === 'standard' && physicalSubtotal >= threshold);
  const shipping = !hasPhysical || freeship ? 0 : fees[method];
  return {
    itemCount: lines.length,
    bookCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    comboDiscount,
    discount,
    shipping,
    total: Math.max(0, subtotal - comboDiscount - discount + shipping),
    hasPhysical,
    freeshipRemaining: comboFreeship ? 0 : Math.max(0, threshold - physicalSubtotal),
    freeshipProgress: comboFreeship || threshold === 0 ? 100 : Math.min(100, Math.round((physicalSubtotal / threshold) * 100)),
    voucherError,
  };
}
