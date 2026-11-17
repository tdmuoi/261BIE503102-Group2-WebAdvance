import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ActivatedRoute, Router } from '@angular/router';

import { Address, CreateOrderRequest, Order, PaymentMethod, ShippingMethod } from '../../models/account';
import { AccountService } from '../../services/account-service';
import { AddressEditor, formatPhone, fullAddress } from '../account/address/address-editor';
import { AuthService } from '../../services/auth-service';
import { CartFacade } from '../cart/cart-facade';
import { computeTotals } from '../cart/pricing';
import { VoucherState } from '../cart/voucher-state';
import { ToastService } from '../../services/toast-service';
import { BANK_INFO, PAYMENT_GUIDE, PAYMENT_TTL, demoQrPath, formatCountdown, transferNote } from './payment';

interface Option<T> {
  value: T;
  title: string;
  desc: string;
  /** Logo hiện trước tên phương thức thanh toán */
  logo?: string;
  available?: boolean;
}

export const SHIPPING_OPTIONS: Option<ShippingMethod>[] = [
  { value: 'standard', title: 'Giao tiêu chuẩn', desc: 'Nhận hàng trong 3–5 ngày' },
  { value: 'express', title: 'Giao nhanh', desc: 'Nhận hàng trong 1–2 ngày (nội thành)' },
];

export const PAYMENT_OPTIONS: Option<PaymentMethod>[] = [
  { value: 'momo', title: 'Ví MoMo', desc: 'Quét QR hoặc thẻ ATM qua cổng MoMo', logo: 'images/payment/momo.png' },
  { value: 'vnpay', title: 'VNPay', desc: 'Chưa hỗ trợ thanh toán qua VNPay', logo: 'images/payment/vnpay.png', available: false },
  { value: 'bank_transfer', title: 'Chuyển khoản ngân hàng', desc: 'Chưa hỗ trợ xác nhận chuyển khoản', logo: 'images/payment/bank.svg', available: false },
  { value: 'cod', title: 'Thanh toán khi nhận hàng (COD)', desc: 'Không áp dụng cho sách điện tử', logo: 'images/payment/cod.svg' },
];

/**
 * Trang Thanh toán (Figma "Pages/checkout · Thanh toán" + "Đặt hàng thành công").
 * Thanh toán các sách đang được chọn ở giỏ. Đơn chỉ có ebook: bỏ bước địa chỉ + vận chuyển, không có COD.
 */
@Component({
  selector: 'app-checkout',
  standalone: false,
  styleUrls: ['../cart/shop.css', './checkout.css', './payment.css', './checkout-address.css', '../account/address/address-form.css'],
  templateUrl: './checkout.html',
})
export class Checkout implements OnInit {
  private readonly facade = inject(CartFacade);
  private readonly account = inject(AccountService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly shippingOptions = SHIPPING_OPTIONS;
  readonly publicSettings = this.facade.publicSettings;
  readonly settingsError = this.facade.settingsError;
  readonly catalogError = this.facade.catalogError;
  readonly stockError = this.facade.stockError;
  get shippingFees() {
    const shipping = this.publicSettings()?.shipping;
    return { standard: shipping?.standardFee ?? 0, express: shipping?.expressFee ?? 0 };
  }
  readonly formatPhone = formatPhone;
  readonly fullAddress = fullAddress;
  readonly marquee = ['CHÍNH SÁCH VẬN CHUYỂN TẠI THANH TOÁN', 'TẶNG BOOKMARK MỖI ĐƠN', 'ĐỔI TRẢ 7 NGÀY', 'GÓI QUÀ MIỄN PHÍ'];
  readonly perks = [
    { icon: 'images/auth/truck.svg', w: 17, label: 'Phí vận chuyển theo chính sách hiện hành' },
    { icon: 'images/auth/gift.svg', w: 16, label: 'Tặng bookmark mỗi đơn' },
    { icon: 'images/shop/check-sm.svg', w: 16, label: 'Đổi trả trong 7 ngày' },
  ];

  readonly loading = computed(() => this.facade.loading() || (this.lines().length > 0 && !this.publicSettings() && !this.settingsError()));
  readonly lines = this.facade.selectedLines;
  readonly hasPhysical = computed(() => this.lines().some((l) => !l.ebook));
  readonly hasEbook = computed(() => this.lines().some((l) => l.ebook));

  // Địa chỉ nhận hàng
  readonly addresses = signal<Address[]>([]);
  readonly addressesLoading = signal(true);
  readonly addressesError = signal(false);
  readonly addressId = signal<string | null>(null);

  readonly shipping = signal<ShippingMethod>('standard');
  readonly payment = signal<PaymentMethod | null>(null);
  readonly note = signal('');

  /** COD: ẩn khi đơn chỉ có ebook; đơn có cả ebook thì vẫn hiện nhưng không chọn được */
  readonly paymentOptions = computed(() => (this.hasPhysical() ? PAYMENT_OPTIONS : PAYMENT_OPTIONS.filter((o) => o.value !== 'cod')));
  readonly codDisabled = computed(() => this.hasEbook());

  readonly voucherField = new VoucherState(this.facade, this.destroyRef);
  readonly voucher = this.facade.voucher;
  readonly totals = computed(() =>
    computeTotals(
      this.lines().map((l) => ({ price: l.price, quantity: l.quantity, ebook: l.ebook })),
      this.voucher(),
      this.shipping(),
      this.facade.comboTotals(),
      this.publicSettings()?.shipping,
    ),
  );

  /** Số thứ tự bước — đơn chỉ có ebook bỏ 2 bước đầu */
  readonly steps = computed(() => (this.hasPhysical() ? { payment: 3, note: 4 } : { payment: 1, note: 2 }));

  readonly placing = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly placed = signal<Order | null>(null);
  private orderAttempt: { owner: string | null; payload: string; key: string; body: CreateOrderRequest } | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer());
    // Khi giỏ có Ebook, bỏ lựa chọn COD và yêu cầu khách chọn lại.
    effect(() => {
      if (this.codDisabled() && this.payment() === 'cod') this.payment.set(null);
    });
  }

  ngOnInit(): void {
    // Đặt hàng cần tài khoản (đơn, địa chỉ, mã giảm giá lưu theo người dùng)
    if (!this.auth.isLoggedIn()) {
      this.toast.show('Vui lòng đăng nhập để thanh toán');
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/checkout' } });
      return;
    }
    this.loadAddresses();
    // MoMo chuyển khách về /checkout?partnerCode=…&orderId=…&resultCode=… sau khi thanh toán
    const q = this.route.snapshot.queryParamMap;
    const momoOrderId = q.get('partnerCode') && q.get('orderId');
    if (momoOrderId) {
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      this.verifyMomo(momoOrderId);
    }
  }

  loadAddresses(): void {
    this.addressesLoading.set(true);
    this.addressesError.set(false);
    this.account.getAddresses().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.addresses.set(list);
        this.addressId.set((list.find((a) => a.isDefault) ?? list[0])?._id ?? null);
        this.addressesLoading.set(false);
        // Chưa có địa chỉ nào thì mở sẵn form thêm địa chỉ ngay tại trang
        if (!list.length) this.openAddressForm(null);
      },
      error: () => {
        this.addressesError.set(true);
        this.addressesLoading.set(false);
      },
    });
  }

  // ---------------- Thêm / sửa địa chỉ ngay tại trang Thanh toán ----------------
  /** Form địa chỉ (logic dùng chung với Sổ địa chỉ) */
  readonly addressEditor = new AddressEditor();
  readonly addressFormOpen = signal(false);

  /** address = null: thêm mới */
  openAddressForm(address: Address | null): void {
    if (address) this.addressEditor.startEdit(address);
    else this.addressEditor.startCreate(this.addresses().length === 0);
    this.addressFormOpen.set(true);
    setTimeout(() => document.getElementById('co-address-form')?.querySelector<HTMLInputElement>('input')?.focus());
  }

  closeAddressForm(): void {
    this.addressFormOpen.set(false);
  }

  saveAddress(): void {
    this.addressEditor.save(({ list, id }) => {
      this.addresses.set(list);
      // Chọn luôn địa chỉ vừa thêm / sửa để giao hàng
      if (id) this.addressId.set(id);
      else if (!list.some((a) => a._id === this.addressId())) this.addressId.set(list[0]?._id ?? null);
      this.submitError.set(null);
      this.addressFormOpen.set(false);
    });
  }

  selectPayment(method: PaymentMethod): void {
    if ((method === 'cod' && this.codDisabled()) || !this.paymentOptions().some(option => option.value === method && option.available !== false)) return;
    this.payment.set(method);
  }

  onNote(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
  }

  placeOrder(): void {
    if (this.placing() || this.paying() || this.placed() || this.loading() || !this.lines().length) return;
    if (this.catalogError()) { this.submitError.set('Chưa tải được giá sách hiện tại. Vui lòng tải lại trang.'); return; }
    if (this.stockError()) { this.submitError.set('Sách chưa sẵn sàng hoặc không đủ số lượng. Vui lòng kiểm tra lại giỏ hàng.'); return; }
    if (!this.publicSettings()) { this.submitError.set('Chưa tải được chính sách vận chuyển. Vui lòng tải lại trang.'); return; }
    const payment = this.payment();
    if (!payment || !this.paymentOptions().some(option => option.value === payment && option.available !== false) || (payment === 'cod' && this.codDisabled())) {
      this.submitError.set('Vui lòng chọn phương thức thanh toán hợp lệ.'); return;
    }
    const address = this.addresses().find((a) => a._id === this.addressId()) ?? null;
    if (this.hasPhysical() && !address) {
      this.submitError.set('Vui lòng chọn hoặc thêm địa chỉ nhận hàng');
      return;
    }
    const lines = this.lines();
    if (this.totals().voucherError) {
      this.submitError.set(this.totals().voucherError);
      return;
    }
    const body: CreateOrderRequest = {
      items: lines.map((l) => ({ bookId: l.bookId, quantity: l.quantity })),
      addressId: this.hasPhysical() ? address!._id : null,
      shippingMethod: this.hasPhysical() ? this.shipping() : null,
      paymentMethod: payment,
      voucherCode: this.voucher()?.code ?? null,
      note: this.note().trim(),
      combos: this.facade.combosForOrder(),
    };
    const payload = JSON.stringify(body);
    const owner = this.auth.user()?._id ?? null;
    if (!this.orderAttempt || this.orderAttempt.owner !== owner || this.orderAttempt.payload !== payload) {
      this.orderAttempt = { owner, payload, key: crypto.randomUUID(), body: JSON.parse(payload) };
    }
    const attempt = this.orderAttempt;
    this.placing.set(true);
    this.submitError.set(null);
    this.account.createOrder(attempt.body, attempt.key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (order) => {
        this.orderAttempt = null;
        this.placing.set(false);
        // COD: xong luôn. MoMo / VNPay / chuyển khoản: mở bước quét mã thanh toán
        if (order.paymentMethod === 'cod') this.finish(order);
        else this.openPayment(order);
      },
      error: (err: { error?: { message?: string } }) => {
        this.placing.set(false);
        this.submitError.set(err?.error?.message ?? 'Không đặt được hàng, vui lòng thử lại.');
      },
    });
  }

  // ---------------- Thanh toán online (quét mã / chuyển khoản) ----------------
  readonly paying = signal<Order | null>(null);
  readonly secondsLeft = signal(PAYMENT_TTL);
  readonly paymentBusy = signal<'confirm' | 'cancel' | null>(null);
  readonly paymentError = signal<string | null>(null);
  readonly bankInfo = BANK_INFO;
  readonly countdown = computed(() => formatCountdown(this.secondsLeft()));
  readonly guide = computed(() => {
    const m = this.paying()?.paymentMethod;
    return m && m !== 'cod' ? PAYMENT_GUIDE[m] : null;
  });
  readonly qrPath = computed(() => demoQrPath(this.paying()?.orderCode ?? ''));
  readonly transferNote = computed(() => transferNote(this.paying()?.orderCode ?? ''));
  private timer: ReturnType<typeof setInterval> | null = null;

  private openPayment(order: Order): void {
    this.paying.set(order);
    this.paymentError.set(null);
    this.secondsLeft.set(PAYMENT_TTL);
    this.stopTimer();
    this.timer = setInterval(() => {
      this.secondsLeft.update((s) => s - 1);
      if (this.secondsLeft() <= 0) this.cancelPayment(true);
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private finish(order: Order): void {
    this.stopTimer();
    this.paying.set(null);
    this.placed.set(order);
    this.facade.completeOrder(order.items.map((i) => i.bookId));
    window.scrollTo?.({ top: 0 });
  }

  /** "Tôi đã thanh toán" */
  confirmPaid(): void {
    const order = this.paying();
    if (!order || this.paymentBusy()) return;
    this.paymentBusy.set('confirm');
    this.paymentError.set(null);
    // Nút của khách chỉ yêu cầu kiểm tra; server không coi thao tác này là bằng chứng thanh toán.
    this.account.confirmPayment(order._id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.paymentBusy.set(null);
        if (updated.paymentStatus === 'paid') this.finish(updated);
        else this.paymentError.set('Lightbook chưa nhận được thanh toán. Bạn đợi ít phút rồi bấm lại nhé.');
      },
      error: (err: { error?: { message?: string } }) => {
        this.paymentBusy.set(null);
        this.paymentError.set(err?.error?.message ?? 'Chưa kiểm tra được thanh toán, vui lòng thử lại.');
      },
    });
  }

  // ---------------- MoMo (cổng thật, môi trường test) ----------------
  /** Đang kiểm tra kết quả MoMo sau khi khách quay lại */
  readonly momoCheck = signal<{ momoOrderId: string; state: 'verifying' | 'pending'; message: string | null } | null>(null);

  /** "Thanh toán bằng MoMo": server tạo link rồi chuyển hẳn sang trang MoMo */
  payWithMomo(method: 'atm' | 'wallet' = 'atm'): void {
    const order = this.paying();
    if (!order || this.paymentBusy()) return;
    this.paymentBusy.set('confirm');
    this.paymentError.set(null);
    this.account.createMomoPayment(order._id, method).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ payUrl }) => {
        this.stopTimer();
        this.openExternal(payUrl);
      },
      error: (err: { error?: { message?: string } }) => {
        this.paymentBusy.set(null);
        this.paymentError.set(err?.error?.message ?? 'Chưa tạo được thanh toán MoMo, vui lòng thử lại.');
      },
    });
  }

  /** Rời web sang trang thanh toán của MoMo (tách riêng để test không điều hướng thật) */
  openExternal(url: string): void {
    window.location.assign(url);
  }

  /** Server hỏi MoMo — chỉ khi MoMo xác nhận mới ghi "đã thanh toán" và đưa ebook vào tủ sách */
  verifyMomo(momoOrderId: string): void {
    this.momoCheck.set({ momoOrderId, state: 'verifying', message: null });
    this.account.verifyMomoPayment(momoOrderId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        if (r.status === 'paid') {
          this.momoCheck.set(null);
          this.finish(r.order);
        } else if (r.status === 'pending') {
          this.momoCheck.set({ momoOrderId, state: 'pending', message: r.message });
        } else {
          // Thất bại / khách huỷ trên MoMo: đơn vẫn chờ → mở lại bước thanh toán để thử lại hoặc huỷ
          this.momoCheck.set(null);
          this.openPayment(r.order);
          this.paymentError.set(`MoMo: ${r.message ?? 'thanh toán chưa thành công.'} Bạn có thể thử lại.`);
        }
      },
      error: (err: { error?: { message?: string } }) =>
        this.momoCheck.set({ momoOrderId, state: 'pending', message: err?.error?.message ?? 'Chưa kiểm tra được thanh toán MoMo.' }),
    });
  }

  /** Huỷ thanh toán (hoặc hết giờ): huỷ đơn chờ, giữ nguyên giỏ để chọn cách khác */
  cancelPayment(expired = false): void {
    const order = this.paying();
    if (!order || this.paymentBusy()) return;
    this.stopTimer();
    this.paymentBusy.set('cancel');
    this.account.cancelOrder(order._id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.closePayment(expired),
      error: (err: { error?: { message?: string } }) => {
        this.paymentBusy.set(null);
        this.paymentError.set(err?.error?.message ?? 'Chưa xác nhận hủy đơn. Bạn có thể thử lại hoặc kiểm tra trong Đơn hàng.');
      },
    });
  }

  private closePayment(expired: boolean): void {
    this.paymentBusy.set(null);
    this.paying.set(null);
    this.toast.show(expired ? 'Mã thanh toán đã hết hạn nên đơn đã được huỷ. Bạn đặt lại nhé.' : 'Đã huỷ thanh toán. Sách vẫn còn trong giỏ.');
  }

  copyText(text: string): void {
    navigator.clipboard?.writeText(text).then(
      () => this.toast.show('Đã sao chép'),
      () => this.toast.show('Trình duyệt không cho sao chép'),
    );
  }

  /** "Đơn sẽ đến trong 3–5 ngày" theo cách giao đã chọn */
  deliveryText(order: Order): string {
    return order.shippingMethod === 'express' ? '1–2 ngày' : '3–5 ngày';
  }

  hasEbookIn(order: Order): boolean {
    return order.items.some((i) => i.format === 'ebook');
  }

  hasPrintIn(order: Order): boolean {
    return order.items.some((i) => i.format === 'print');
  }
}

