import { DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CartFacade } from './cart-facade';

/**
 * Ô "Mã giảm giá" dùng chung cho Giỏ hàng và Thanh toán (cùng một mã, lưu ở CartFacade).
 * Tạo trong component: `readonly voucherField = new VoucherState(inject(CartFacade), inject(DestroyRef));`
 */
export class VoucherState {
  readonly voucher;
  readonly input;
  readonly error = signal<string | null>(null);
  readonly checking = signal(false);

  constructor(
    private readonly facade: CartFacade,
    private readonly destroyRef: DestroyRef,
  ) {
    this.voucher = facade.voucher;
    this.input = signal(facade.voucher()?.code ?? '');
  }

  onInput(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value.toUpperCase());
    this.error.set(null);
  }

  apply(): void {
    const code = this.input().trim();
    if (!code || code === this.voucher()?.code || this.checking()) return;
    this.checking.set(true);
    this.facade
      .validateVoucher(code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (v) => {
          this.checking.set(false);
          this.facade.setVoucher(v);
          this.input.set(v.code);
        },
        error: (err: { error?: { message?: string } }) => {
          this.checking.set(false);
          this.facade.setVoucher(null);
          this.error.set(err?.error?.message ?? 'Mã giảm giá không hợp lệ');
        },
      });
  }

  clear(): void {
    this.facade.setVoucher(null);
    this.input.set('');
    this.error.set(null);
  }
}
