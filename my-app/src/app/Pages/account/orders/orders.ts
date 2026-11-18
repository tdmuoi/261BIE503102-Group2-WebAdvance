import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { Order, OrderItem, OrderStatus, PaymentMethod } from '../../../models/account';
import { AccountService, BuybackRequest } from '../../../services/account-service';
import { ToastService } from '../../../services/toast-service';
import { BuyAgainTarget } from '../popups/buy-again-drawer/buy-again-drawer';
import { ReviewTarget } from '../popups/review-popup/review-popup';

export type OrderTab = 'all' | 'pending' | 'shipping' | 'delivered' | 'cancelled' | 'returned' | 'buyback';
const ORDER_TABS: readonly OrderTab[] = ['all', 'pending', 'shipping', 'delivered', 'cancelled', 'returned', 'buyback'];

/** Trạng thái → tab: "Đang giao" gồm cả đơn đã xác nhận đang chờ giao */
const TAB_OF: Record<OrderStatus, Exclude<OrderTab, 'all' | 'buyback'>> = {
  pending: 'pending', confirmed: 'shipping', shipping: 'shipping', delivered: 'delivered', cancelled: 'cancelled', returned: 'returned',
};

export const STATUS_META: Record<OrderStatus, { label: string; icon: string; tone: string }> = {
  pending: { label: 'Chờ xác nhận', icon: 'images/account/n-box.svg', tone: 'mint-strong' },
  confirmed: { label: 'Đã xác nhận', icon: 'images/account/n-box.svg', tone: 'yellow' },
  shipping: { label: 'Đang giao', icon: 'images/account/n-truck.svg', tone: 'yellow' },
  delivered: { label: 'Hoàn tất', icon: 'images/account/n-book.svg', tone: 'mint' },
  cancelled: { label: 'Đã huỷ', icon: 'images/account/x-sm.svg', tone: 'grey' },
  returned: { label: 'Đã trả hàng', icon: 'images/account/x-sm.svg', tone: 'grey' },
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  momo: 'Ví MoMo', vnpay: 'VNPay', bank_transfer: 'Chuyển khoản ngân hàng', cod: 'Thanh toán khi nhận hàng (COD)',
};

const TRACK_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending', label: 'Đã đặt' },
  { status: 'confirmed', label: 'Đã xác nhận' },
  { status: 'shipping', label: 'Đang giao' },
  { status: 'delivered', label: 'Đã nhận' },
];

export const SHOP_EMAIL = 'lightbook14@gmail.com';

/** Mở khung soạn thư Gmail gửi cho shop (tab mới), điền sẵn tiêu đề */
export function gmailCompose(subject: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${SHOP_EMAIL}&su=${encodeURIComponent(subject)}`;
}

/** Trang Quản lý đơn hàng (Figma "Pages/account/orders") */
@Component({
  selector: 'app-orders',
  standalone: false,
  styleUrls: ['../account-page.css', './orders.css'],
  templateUrl: './orders.html',
})
export class Orders implements OnInit {
  private readonly account = inject(AccountService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly statusMeta = STATUS_META;
  readonly paymentLabel = PAYMENT_LABEL;
  readonly shopEmail = SHOP_EMAIL;

  readonly status = signal<'loading' | 'error' | 'ready'>('loading');
  readonly orders = signal<Order[]>([]);
  readonly buybacks = signal<BuybackRequest[]>([]);
  readonly ratings = signal<Record<string, number>>({});
  /** ?tab=buyback (popup gửi phiếu thanh lý) mở thẳng tab tương ứng */
  readonly tab = signal<OrderTab>(initialTab(inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap.get('tab')));
  readonly query = signal('');
  readonly expanded = signal<string | null>(null);
  /** Mã phiếu thanh lý đang mở báo giá */
  readonly quoteOpen = signal<string | null>(null);
  readonly cancelling = signal<string | null>(null);

  readonly reviewing = signal<ReviewTarget | null>(null);
  readonly buying = signal<BuyAgainTarget | null>(null);
  readonly returning = signal<Order | null>(null);
  readonly returnBusy = signal(false);
  readonly returnError = signal('');
  readonly returnResult = signal('');
  returnReason = 'damaged';
  returnDescription = '';

  readonly tabs = computed(() => {
    const list = this.orders();
    const count = (t: OrderTab) => list.filter((o) => TAB_OF[o.status] === t).length;
    return [
      { value: 'all' as const, label: 'Tất cả', count: list.length },
      { value: 'pending' as const, label: 'Chờ xác nhận', count: count('pending') },
      { value: 'shipping' as const, label: 'Đang giao', count: count('shipping') },
      { value: 'delivered' as const, label: 'Đã giao', count: count('delivered') },
      { value: 'cancelled' as const, label: 'Đã huỷ', count: count('cancelled') },
      { value: 'returned' as const, label: 'Đã trả hàng', count: count('returned') },
      { value: 'buyback' as const, label: 'Thanh lý', count: this.buybacks().length },
    ];
  });

  readonly visible = computed(() => {
    const tab = this.tab();
    const q = normalize(this.query());
    return this.orders()
      .filter((o) => tab === 'all' || TAB_OF[o.status] === tab)
      .filter((o) => !q || normalize(o.orderCode).includes(q) || o.items.some((i) => normalize(i.title).includes(q)));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.status.set('loading');
    forkJoin({
      orders: this.account.getOrders(),
      ratings: this.account.getMyRatings(),
      // Tab "Thanh lý" lỗi thì vẫn hiện đơn hàng
      buybacks: this.account.getBuybacks().pipe(catchError(() => of<BuybackRequest[]>([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ orders, ratings, buybacks }) => {
          this.orders.set([...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
          this.ratings.set(ratings);
          this.buybacks.set(buybacks);
          this.status.set('ready');
        },
        error: () => this.status.set('error'),
      });
  }

  setTab(tab: OrderTab): void {
    this.tab.set(tab);
    this.expanded.set(null);
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  toggleDetail(order: Order): void {
    this.expanded.update((id) => (id === order._id ? null : order._id));
  }

  /** Số cuốn trong đơn: "Tổng cộng (2 sản phẩm)" */
  bookCount(order: Order): number {
    return order.items.reduce((s, i) => s + i.quantity, 0);
  }

  isEbookOnly(order: Order): boolean {
    return order.items.every((i) => i.format === 'ebook');
  }

  /** Thanh tiến trình chỉ hiện với đơn sách giấy đang xử lý */
  showTracker(order: Order): boolean {
    return !this.isEbookOnly(order) && (order.status === 'confirmed' || order.status === 'shipping');
  }

  steps(order: Order) {
    const current = TRACK_STEPS.findIndex((s) => s.status === order.status);
    return TRACK_STEPS.map((s, i) => ({ ...s, n: i + 1, state: i < current ? 'done' : i === current ? 'current' : 'todo' }));
  }

  itemMeta(item: OrderItem): string {
    return item.format === 'ebook' ? (item.variant ?? 'Sách điện tử') : `${item.variant ?? 'Sách mới'} · x${item.quantity}`;
  }

  mailto(order: Order): string {
    return gmailCompose(`Hỏi về đơn #${order.orderCode}`);
  }

  buybackMail(b: BuybackRequest): string {
    return gmailCompose(`Hỏi về phiếu thanh lý #${b.code}`);
  }

  toggleQuote(b: BuybackRequest): void {
    this.quoteOpen.update((code) => (code === b.code ? null : b.code));
  }

  /** Admin lưu "Giá thu mua" thì phiếu vẫn ở trạng thái reviewing, nên dựa vào quote để biết đã có báo giá */
  buybackLabel(b: BuybackRequest): string {
    if (b.status === 'completed') return 'Hoàn tất';
    return b.quote != null ? 'Đã có báo giá' : 'Đang định giá';
  }

  cancel(order: Order): void {
    if (order.status !== 'pending' || this.cancelling()) return;
    if (!confirm(`Huỷ đơn #${order.orderCode}? Thao tác này không hoàn tác được.`)) return;
    this.cancelling.set(order._id);
    this.account.cancelOrder(order._id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.cancelling.set(null);
        this.orders.update((list) => list.map((o) => (o._id === updated._id ? updated : o)));
        this.toast.show(`Đã huỷ đơn #${order.orderCode}`);
      },
      error: (err: { error?: { message?: string } }) => {
        this.cancelling.set(null);
        this.toast.show(err?.error?.message ?? 'Chưa huỷ được đơn, vui lòng thử lại.');
      },
    });
  }

  /** Đơn MoMo chưa trả tiền: trả tiếp, không phải đặt đơn mới */
  readonly paying = signal<string | null>(null);

  canPay(order: Order): boolean {
    return order.status === 'pending' && order.paymentStatus === 'unpaid' && order.paymentMethod === 'momo';
  }

  pay(order: Order): void {
    if (!this.canPay(order) || this.paying()) return;
    this.paying.set(order._id);
    this.account.createMomoPayment(order._id, 'atm').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ payUrl }) => this.openExternal(payUrl),
      error: (err: { error?: { message?: string } }) => {
        this.paying.set(null);
        this.toast.show(err?.error?.message ?? 'Chưa tạo được thanh toán MoMo, vui lòng thử lại.');
      },
    });
  }

  /** Sang trang thanh toán MoMo (tách riêng để test không điều hướng thật). MoMo trả khách về /checkout để xác nhận */
  openExternal(url: string): void {
    window.location.assign(url);
  }

  openReturn(order: Order): void {
    if (this.returnBusy() || order.status !== 'delivered') return;
    this.returning.set(order); this.returnReason = 'damaged'; this.returnDescription = '';
    this.returnError.set(''); this.returnResult.set(''); this.expanded.set(order._id);
  }

  submitReturn(): void {
    const order = this.returning(), description = this.returnDescription.trim();
    if (!order || this.returnBusy()) return;
    if (!description || description.length > 1000) { this.returnError.set('Nhập mô tả từ 1 đến 1.000 ký tự.'); return; }
    this.returnBusy.set(true); this.returnError.set('');
    this.account.requestReturn(order._id, { type: 'refund', reason: this.returnReason, description })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: result => { this.returnBusy.set(false); this.returning.set(null);
          this.returnResult.set(`Đã gửi yêu cầu ${result.requestCode}. Cửa hàng sẽ kiểm tra trước khi hoàn tiền.`); },
        error: error => { this.returnBusy.set(false); this.returnError.set(error.error?.message || 'Chưa gửi được yêu cầu. Bạn có thể thử lại cùng nội dung.'); },
      });
  }

  /** Đơn đã giao: viết đánh giá cuốn đầu tiên chưa đánh giá */
  firstUnreviewed(order: Order): OrderItem | undefined {
    return order.items.find((i) => !this.ratings()[i.bookId]);
  }

  review(order: Order, item: OrderItem): void {
    this.reviewing.set({
      bookId: item.bookId, title: item.title, image: item.image, author: item.author,
      meta: `${item.format === 'ebook' ? 'Sách điện tử' : (item.variant ?? 'Sách mới')} · mua ${formatDate(order.createdAt)}`,
    });
  }

  onReviewed(result: { bookId: string; rating: number }): void {
    this.ratings.update((r) => ({ ...r, [result.bookId]: result.rating }));
  }

  buyAgain(order: Order): void {
    const item = order.items.find((i) => i.format === 'print') ?? order.items[0];
    if (item) this.buying.set({ _id: item.bookId, title: item.title, image: item.image ?? '', price: item.price, type: item.format === 'ebook' ? 'ebook' : undefined });
  }
}

/** Bỏ dấu + chữ thường để tìm "lu tre" ra "Lũ Trẻ" */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function initialTab(value: string | null | undefined): OrderTab {
  return ORDER_TABS.includes(value as OrderTab) ? (value as OrderTab) : 'all';
}
