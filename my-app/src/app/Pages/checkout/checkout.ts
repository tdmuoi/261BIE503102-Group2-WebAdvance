import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Address, CreateOrderRequest, Order, OrderItem, PaymentMethod, ShippingMethod } from '../../models/account';
import { AccountService } from '../../services/account-service';
import { USE_MOCK_ADDRESS, mockGetAddresses } from '../account/address/address.mock';
import { formatPhone, fullAddress } from '../account/address/address';
import { USE_MOCK_ORDERS, mockCreateOrder } from '../account/orders/orders.mock';
import { CartFacade, CartLine } from '../cart/cart-facade';
import { SHIPPING_FEES, computeTotals } from '../cart/pricing';
import { VoucherState } from '../cart/voucher-state';

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
  styleUrls: ['../cart/shop.css', './checkout.css'],
  templateUrl: './checkout.html',
})
export class Checkout implements OnInit {
  private readonly facade = inject(CartFacade);
  private readonly account = inject(AccountService);
  private readonly destroyRef = inject(DestroyRef);

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
    computeTotals(this.lines().map((l) => ({ price: l.price, quantity: l.quantity, ebook: l.ebook })), this.voucher(), this.shipping()),
  );

  /** Số thứ tự bước — đơn chỉ có ebook bỏ 2 bước đầu */
  readonly steps = computed(() => (this.hasPhysical() ? { payment: 3, note: 4 } : { payment: 1, note: 2 }));

  readonly placing = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly placed = signal<Order | null>(null);

  constructor() {
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
          discount: totals.discount,
          total: totals.total,
        })
      : this.account.createOrder(body);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (order) => {
        this.placing.set(false);
        this.placed.set(order);
        this.facade.completeOrder(lines.map((l) => l.bookId));
        window.scrollTo?.({ top: 0 });
      },
      error: (err: { error?: { message?: string } }) => {
        this.placing.set(false);
        this.submitError.set(err?.error?.message ?? 'Không đặt được hàng, vui lòng thử lại.');
      },
    });
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
