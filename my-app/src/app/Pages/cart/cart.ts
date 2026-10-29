import { Component, DestroyRef, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ToastService } from '../../services/toast-service';
import { WishlistService } from '../../services/wishlist-service';
import { CartFacade, CartLine } from './cart-facade';
import { FREESHIP_MIN, computeTotals } from './pricing';
import { VoucherState } from './voucher-state';

/** Trang Giỏ hàng (Figma "Pages/cart · Giỏ hàng" + "Giỏ hàng trống") */
@Component({
  selector: 'app-cart',
  standalone: false,
  styleUrls: ['./shop.css', './cart.css'],
  templateUrl: './cart.html',
})
export class Cart {
  private readonly facade = inject(CartFacade);
  private readonly wishlist = inject(WishlistService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly freeshipMin = FREESHIP_MIN;
  readonly marquee = ['FREESHIP ĐƠN TỪ 500.000Đ', 'TẶNG BOOKMARK MỖI ĐƠN', 'ĐỔI TRẢ 7 NGÀY', 'GÓI QUÀ MIỄN PHÍ'];
  readonly perks = [
    { icon: 'images/auth/truck.svg', w: 17, label: 'Freeship đơn từ 500.000đ' },
    { icon: 'images/auth/gift.svg', w: 16, label: 'Tặng bookmark mỗi đơn' },
    { icon: 'images/shop/check-sm.svg', w: 16, label: 'Đổi trả trong 7 ngày' },
  ];

  readonly lines = this.facade.lines;
  readonly loading = this.facade.loading;
  readonly allSelected = this.facade.allSelected;
  readonly selected = this.facade.selectedLines;
  readonly voucher = this.facade.voucher;
  readonly totals = computed(() => computeTotals(this.selected().map((l) => ({ price: l.price, quantity: l.quantity, ebook: l.ebook })), this.voucher()));
  readonly cartIds = computed(() => this.lines().map((l) => l.bookId));

  /** Ô mã giảm giá (dùng chung với trang Thanh toán) */
  readonly voucherField = new VoucherState(this.facade, this.destroyRef);
  readonly voucherInput = this.voucherField.input;
  readonly voucherError = this.voucherField.error;
  readonly checkingVoucher = this.voucherField.checking;

  isLiked(line: CartLine): boolean {
    return this.wishlist.has(line.bookId);
  }

  toggle(line: CartLine): void {
    this.facade.toggle(line.bookId);
  }

  toggleAll(): void {
    this.facade.toggleAll();
  }

  setQuantity(line: CartLine, quantity: number): void {
    this.facade.setQuantity(line.bookId, quantity);
  }

  remove(line: CartLine): void {
    this.facade.remove([line.bookId]);
    this.toast.show(`Đã xoá "${line.title}" khỏi giỏ`);
  }

  removeSelected(): void {
    const ids = this.selected().map((l) => l.bookId);
    if (!ids.length || !confirm(`Xoá ${ids.length} sản phẩm đã chọn khỏi giỏ?`)) return;
    this.facade.remove(ids);
    this.toast.show(`Đã xoá ${ids.length} sản phẩm khỏi giỏ`);
  }

  saveToWishlist(line: CartLine): void {
    const added = this.wishlist.toggle({ _id: line.bookId, title: line.title, image: line.image, price: line.price });
    this.toast.show(added ? 'Đã lưu vào yêu thích' : 'Đã bỏ khỏi yêu thích', added ? { label: 'Xem wishlist', path: '/account/wishlist' } : undefined);
  }

  onVoucherInput(event: Event): void {
    this.voucherField.onInput(event);
  }

  applyVoucher(): void {
    this.voucherField.apply();
  }

  clearVoucher(): void {
    this.voucherField.clear();
  }

  checkout(): void {
    if (this.selected().length) this.router.navigateByUrl('/checkout');
  }
}
