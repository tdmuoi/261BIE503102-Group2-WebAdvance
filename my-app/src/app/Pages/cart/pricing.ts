import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

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
  discount: number;
  shipping: number;
  total: number;
  /** Có sách giấy → cần giao hàng */
  hasPhysical: boolean;
  /** Còn thiếu bao nhiêu để được freeship (0 nếu đã đủ) */
  freeshipRemaining: number;
  freeshipProgress: number;
}

export function computeTotals(lines: PriceLine[], voucher: VoucherResult | null, method: ShippingMethod = 'standard'): Totals {
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const physical = lines.filter((l) => !l.ebook);
  const physicalSubtotal = physical.reduce((s, l) => s + l.price * l.quantity, 0);
  const hasPhysical = physical.length > 0;
  const freeship = method === 'standard' && physicalSubtotal >= FREESHIP_MIN;
  const shipping = !hasPhysical || freeship ? 0 : SHIPPING_FEES[method];
  const discount = voucher ? Math.round((subtotal * voucher.percent) / 100) : 0;
  return {
    itemCount: lines.length,
    bookCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    discount,
    shipping,
    total: Math.max(0, subtotal - discount + shipping),
    hasPhysical,
    freeshipRemaining: Math.max(0, FREESHIP_MIN - physicalSubtotal),
    freeshipProgress: Math.min(100, Math.round((physicalSubtotal / FREESHIP_MIN) * 100)),
  };
}

// TODO: thay bằng API — my-server chưa có POST /api/vouchers/validate
export const USE_MOCK_VOUCHER = true;
const MOCK_VOUCHERS: VoucherResult[] = [{ code: 'LIGHTBOOK10', percent: 10, description: 'giảm 10% cho đơn đầu tiên' }];

export function mockValidateVoucher(code: string): Observable<VoucherResult> {
  const found = MOCK_VOUCHERS.find((v) => v.code === code.trim().toUpperCase());
  return found
    ? of(found).pipe(delay(300))
    : timer(300).pipe(switchMap(() => throwError(() => new HttpErrorResponse({ status: 404, error: { message: 'Mã giảm giá không hợp lệ hoặc đã hết hạn' } }))));
}
