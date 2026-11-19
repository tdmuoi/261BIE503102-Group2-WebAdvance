import { Component, DestroyRef, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ToastService } from '../../services/toast-service';
import { WishlistService } from '../../services/wishlist-service';
import { CartFacade, CartLine } from './cart-facade';
import { computeTotals } from './pricing';
import { VoucherState } from './voucher-state';

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

  readonly publicSettings = this.facade.publicSettings;
  readonly freeshipText = this.facade.freeshipText;
  readonly marquee = ['CHÍNH SÁCH VẬN CHUYỂN TẠI THANH TOÁN', 'TẶNG BOOKMARK MỖI ĐƠN', 'ĐỔI TRẢ 7 NGÀY', 'GÓI QUÀ MIỄN PHÍ'];
  readonly perks = [
    { icon: 'images/auth/truck.svg', w: 17, label: 'Phí vận chuyển theo chính sách hiện hành' },
    { icon: 'images/auth/gift.svg', w: 16, label: 'Tặng bookmark mỗi đơn' },
    { icon: 'images/shop/check-sm.svg', w: 16, label: 'Đổi trả trong 7 ngày' },
  ];

  readonly lines = this.facade.lines;
  readonly loading = this.facade.loading;
  readonly catalogError = this.facade.catalogError;
  readonly stockError = this.facade.stockError;
  readonly allSelected = this.facade.allSelected;
  readonly selected = this.facade.selectedLines;
  readonly voucher = this.facade.voucher;
  readonly totals = computed(() =>
    computeTotals(this.selected().map((l) => ({ price: l.price, quantity: l.quantity, ebook: l.ebook })), this.voucher(), 'standard', this.facade.comboTotals(), this.publicSettings()?.shipping),
  );
  readonly comboLabels = this.facade.comboLabels;
  readonly comboFreeship = computed(() => this.facade.comboTotals().freeship && this.totals().hasPhysical);
  readonly cartIds = computed(() => this.lines().map((l) => l.bookId));

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

  goFlashSale(event: Event): void {
    event.preventDefault();
    this.router.navigate(['/'], { fragment: 'flashsale' }).then(() => {
      const started = Date.now();
      const timer = setInterval(() => {
        const el = document.getElementById('flashsale');
        if (el || Date.now() - started > 8000) {
          clearInterval(timer);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    });
  }

  checkout(): void {
    if (this.loading() || this.catalogError()) { this.toast.show('Chưa tải được giá sách hiện tại. Vui lòng tải lại trang trước khi thanh toán.'); return; }
    if (this.stockError()) { this.toast.show('Một số sách chưa sẵn sàng hoặc không đủ số lượng. Vui lòng kiểm tra lại giỏ hàng.'); return; }
    if (!this.publicSettings()) { this.toast.show('Chưa tải được chính sách vận chuyển. Vui lòng tải lại trang trước khi thanh toán.'); return; }
    if (this.selected().length) this.router.navigateByUrl('/checkout');
  }
}
