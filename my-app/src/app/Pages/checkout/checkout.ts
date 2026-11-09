import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Address, CreateOrderRequest, Order, OrderItem, PaymentMethod, ShippingMethod } from '../../models/account';
import { AccountService } from '../../services/account-service';
import { USE_MOCK_ADDRESS, mockGetAddresses } from '../account/address/address.mock';
import { formatPhone, fullAddress } from '../account/address/address';
import { USE_MOCK_ORDERS, mockCancelOrder, mockCreateOrder, mockPayOrder } from '../account/orders/orders.mock';
import { CartFacade, CartLine } from '../cart/cart-facade';
import { SHIPPING_FEES, computeTotals } from '../cart/pricing';
import { VoucherState } from '../cart/voucher-state';
import { ToastService } from '../../services/toast-service';
import { BANK_INFO, PAYMENT_GUIDE, PAYMENT_TTL, demoQrPath, formatCountdown, transferNote } from './payment';

interface Option<T> {
  value: T;
  title: string;
  desc: string;
}

export const SHIPPING_OPTIONS: Option<ShippingMethod>[] = [
  { value: 'standard', title: 'Giao tiêu chuẩn', desc: 'Nhận hàng trong 3–5 ngày' },
  { value: 'express', title: 'Giao nhanh', desc: 'Nhận hàng trong 1–2 ngày (nội thành)' },
];

export const PAYMENT_OPTIONS: Option<PaymentMethod>[] = [
  { value: 'momo', title: 'Ví MoMo', desc: 'Quét mã QR trong ứng dụng MoMo' },
  { value: 'vnpay', title: 'VNPay', desc: 'Thẻ ATM nội địa, QR ngân hàng' },
  { value: 'bank_transfer', title: 'Chuyển khoản ngân hàng', desc: 'Hiện số tài khoản và nội dung chuyển khoản' },
  { value: 'cod', title: 'Thanh toán khi nhận hàng (COD)', desc: 'Không áp dụng cho sách điện tử' },
];

/**
 * Trang Thanh toán (Figma "Pages/checkout · Thanh toán" + "Đặt hàng thành công").
 * Thanh toán các sách đang được chọn ở giỏ. Đơn chỉ có ebook: bỏ bước địa chỉ + vận chuyển, không có COD.
 */
@Component({
  selector: 'app-checkout',
  standalone: false,
  styleUrls: ['../cart/shop.css', './checkout.css', './payment.css'],
  templateUrl: './checkout.html',
})
export class Checkout implements OnInit {
  private readonly facade = inject(CartFacade);
  private readonly account = inject(AccountService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);

  readonly shippingOptions = SHIPPING_OPTIONS;
  readonly shippingFees = SHIPPING_FEES;
  readonly formatPhone = formatPhone;
  readonly fullAddress = fullAddress;
  readonly marquee = ['FREESHIP ĐƠN TỪ 500.000Đ', 'TẶNG BOOKMARK MỖI ĐƠN', 'ĐỔI TRẢ 7 NGÀY', 'GÓI QUÀ MIỄN PHÍ'];
  readonly perks = [
    { icon: 'images/auth/truck.svg', w: 17, label: 'Freeship đơn từ 500.000đ' },
    { icon: 'images/auth/gift.svg', w: 16, label: 'Tặng bookmark mỗi đơn' },
    { icon: 'images/shop/check-sm.svg', w: 16, label: 'Đổi trả trong 7 ngày' },
  ];

  readonly loading = this.facade.loading;
  readonly lines = this.facade.selectedLines;
  readonly hasPhysical = computed(() => this.lines().some((l) => !l.ebook));
  readonly hasEbook = computed(() => this.lines().some((l) => l.ebook));

  // Địa chỉ nhận hàng
  readonly addresses = signal<Address[]>([]);
  readonly addressesLoading = signal(true);
  readonly addressesError = signal(false);
  readonly addressId = signal<string | null>(null);

  readonly shipping = signal<ShippingMethod>('standard');
  readonly payment = signal<PaymentMethod>('momo');
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
    ),
  );

  /** Số thứ tự bước — đơn chỉ có ebook bỏ 2 bước đầu */
  readonly steps = computed(() => (this.hasPhysical() ? { payment: 3, note: 4 } : { payment: 1, note: 2 }));

  readonly placing = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly placed = signal<Order | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer());
    // Đổi giỏ (vd. ebook-only) mà đang chọn COD thì chuyển về MoMo
    effect(() => {
      if (this.codDisabled() && this.payment() === 'cod') this.payment.set('momo');
    });
  }

  ngOnInit(): void {
    this.loadAddresses();
  }

  loadAddresses(): void {
    this.addressesLoading.set(true);
    this.addressesError.set(false);
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có GET /api/account/addresses
    (USE_MOCK_ADDRESS ? mockGetAddresses() : this.account.getAddresses()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.addresses.set(list);
        this.addressId.set((list.find((a) => a.isDefault) ?? list[0])?._id ?? null);
        this.addressesLoading.set(false);
      },
      error: () => {
        this.addressesError.set(true);
        this.addressesLoading.set(false);
      },
    });
  }

  selectPayment(method: PaymentMethod): void {
    if (method === 'cod' && this.codDisabled()) return;
    this.payment.set(method);
  }

  onNote(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
  }

  placeOrder(): void {
    if (this.placing() || !this.lines().length) return;
    const address = this.addresses().find((a) => a._id === this.addressId()) ?? null;
    if (this.hasPhysical() && !address) {
      this.submitError.set('Vui lòng chọn hoặc thêm địa chỉ nhận hàng');
      return;
    }
    const lines = this.lines();
    const totals = this.totals();
    const body: CreateOrderRequest = {
      items: lines.map((l) => ({ bookId: l.bookId, quantity: l.quantity })),
      addressId: this.hasPhysical() ? address!._id : null,
      shippingMethod: this.hasPhysical() ? this.shipping() : null,
      paymentMethod: this.payment(),
      voucherCode: this.voucher()?.code ?? null,
      note: this.note().trim(),
    };
    this.placing.set(true);
    this.submitError.set(null);
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có POST /api/orders
    const request$ = USE_MOCK_ORDERS
      ? mockCreateOrder(body, {
          items: lines.map(toOrderItem),
          address: address && this.hasPhysical()
            ? { fullName: address.fullName, phone: address.phone, address: address.street, ward: address.ward, province: address.province }
            : null,
          subtotal: totals.subtotal,
          shippingFee: totals.shipping,
          discount: totals.discount + totals.comboDiscount,
          total: totals.total,
        })
      : this.account.createOrder(body);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (order) => {
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
    // TODO: thay bằng API — backend nhận kết quả từ MoMo/VNPay (IPN) hoặc đối soát chuyển khoản; trang hỏi lại GET /api/orders/:id
    (USE_MOCK_ORDERS ? mockPayOrder(order._id) : this.account.getOrder(order._id)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

  /** Huỷ thanh toán (hoặc hết giờ): huỷ đơn chờ, giữ nguyên giỏ để chọn cách khác */
  cancelPayment(expired = false): void {
    const order = this.paying();
    if (!order || this.paymentBusy()) return;
    this.stopTimer();
    this.paymentBusy.set('cancel');
    // TODO: thay bằng API — PUT /api/account/orders/:id/cancel
    (USE_MOCK_ORDERS ? mockCancelOrder(order._id) : this.account.cancelOrder(order._id)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.closePayment(expired),
      error: () => this.closePayment(expired),
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

function toOrderItem(l: CartLine): OrderItem {
  return { bookId: l.bookId, title: l.title, image: l.image || null, price: l.price, quantity: l.quantity, format: l.ebook ? 'ebook' : 'print', variant: l.variant };
}
