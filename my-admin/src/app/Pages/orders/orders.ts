import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { ORDER_STATUS, Order, OrderListResponse, OrderQuery, OrderStatus, PAYMENT_STATUS, PaymentStatus } from '../../models/order';
import { OrderService } from '../../services/order-service';

/**
 * Trang Đơn hàng: bảng đơn (lọc theo trạng thái, thanh toán, ngày đặt, tìm kiếm) và panel chi tiết
 * ngay trong trang (Pages/orders/order-detail). Đơn đang mở nằm trên URL: /orders?id=... để gửi link được.
 */
@Component({
  selector: 'app-orders',
  standalone: false,
  styleUrl: './orders.css',
  templateUrl: './orders.html',
})
export class Orders {
  private readonly orderService = inject(OrderService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly statusInfo = ORDER_STATUS;
  readonly paymentInfo = PAYMENT_STATUS;
  readonly tabs: { value: '' | OrderStatus; label: string }[] = [
    { value: '', label: 'Tất cả' },
    ...(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => ({ value: s, label: ORDER_STATUS[s].label })),
  ];
  readonly paymentOptions = Object.keys(PAYMENT_STATUS) as PaymentStatus[];
  readonly sortOptions: { value: NonNullable<OrderQuery['sort']>; label: string }[] = [
    { value: 'newest', label: 'Mới nhất' },
    { value: 'oldest', label: 'Cũ nhất' },
    { value: 'total_desc', label: 'Tổng tiền cao → thấp' },
    { value: 'total_asc', label: 'Tổng tiền thấp → cao' },
  ];

  // ----- Bộ lọc -----
  readonly q = signal('');
  readonly status = signal<'' | OrderStatus>('');
  readonly payment = signal<'' | PaymentStatus>('');
  readonly from = signal('');
  readonly to = signal('');
  readonly sort = signal<NonNullable<OrderQuery['sort']>>('newest');
  readonly page = signal(1);
  readonly pageSize = 10;

  // ----- Dữ liệu -----
  readonly data = signal<OrderListResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly selectedId = signal<string | null>(null);

  readonly orders = computed(() => this.data()?.items ?? []);
  readonly hasFilter = computed(() => !!(this.q() || this.status() || this.payment() || this.from() || this.to()));

  private readonly search$ = new Subject<string>();

  constructor() {
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((text) => {
      this.q.set(text);
      this.page.set(1);
      this.load();
    });

    // Đơn đang mở lấy từ URL (?id=...) — link từ Dashboard cũng mở thẳng panel
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.selectedId.set(params.get('id')));

    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.orderService
      .getOrders({
        q: this.q(), status: this.status(), payment: this.payment(), from: this.from(), to: this.to(),
        sort: this.sort(), page: this.page(), limit: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(
            err.status === 0
              ? 'Không kết nối được my-server (http://localhost:3002). Hãy chạy "npm run dev" trong thư mục my-server.'
              : 'Không tải được danh sách đơn hàng. Xem terminal của my-server để biết chi tiết.',
          );
          this.loading.set(false);
        },
      });
  }

  // ----- Bộ lọc -----
  onSearch(text: string): void {
    this.search$.next(text.trim());
  }

  setFilter(name: 'status' | 'payment' | 'from' | 'to' | 'sort', value: string): void {
    if (name === 'status') this.status.set(value as '' | OrderStatus);
    else if (name === 'payment') this.payment.set(value as '' | PaymentStatus);
    else if (name === 'sort') this.sort.set(value as NonNullable<OrderQuery['sort']>);
    else this[name].set(value);
    this.page.set(1);
    this.load();
  }

  clearFilters(): void {
    this.q.set('');
    this.status.set('');
    this.payment.set('');
    this.from.set('');
    this.to.set('');
    this.page.set(1);
    this.load();
  }

  goToPage(p: number): void {
    this.page.set(p);
    this.load();
  }

  // ----- Panel chi tiết -----
  open(order: Order): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { id: order._id }, queryParamsHandling: 'merge' });
  }

  close(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { id: null }, queryParamsHandling: 'merge' });
  }

  /** Panel đổi trạng thái / thanh toán -> cập nhật lại dòng trong bảng và số đếm */
  onChanged(): void {
    this.load();
  }

  // ----- Hiển thị -----
  money(value: number): string {
    return (value ?? 0).toLocaleString('vi-VN') + 'đ';
  }

  count(value: '' | OrderStatus): number {
    const counts = this.data()?.counts;
    return counts ? counts[value || 'all'] ?? 0 : 0;
  }
}
