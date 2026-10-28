import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { ORDER_STATUS, Order, OrderStatus, PAYMENT_METHOD, PAYMENT_STATUS, PaymentStatus } from '../../../models/order';
import { OrderService } from '../../../services/order-service';

const STEPS: OrderStatus[] = ['pending', 'confirmed', 'shipping', 'delivered'];

/** Nút chuyển trạng thái: nhãn + kiểu nút */
const ACTIONS: Record<OrderStatus, { label: string; style: 'primary' | 'danger' | 'default' }> = {
  pending: { label: '', style: 'default' },
  confirmed: { label: 'Xác nhận đơn', style: 'primary' },
  shipping: { label: 'Giao cho vận chuyển', style: 'primary' },
  delivered: { label: 'Đã giao thành công', style: 'primary' },
  cancelled: { label: 'Huỷ đơn', style: 'danger' },
  returned: { label: 'Ghi nhận trả hàng', style: 'danger' },
};

/**
 * Panel chi tiết đơn, đặt cạnh bảng trong trang Đơn hàng:
 *   <app-order-detail [orderId]="selectedId()" (closed)="..." (changed)="..."></app-order-detail>
 * Mở trực tiếp /order-detail/:id (link cũ) sẽ được chuyển sang /orders?id=:id
 */
@Component({
  selector: 'app-order-detail',
  standalone: false,
  styleUrl: './order-detail.css',
  templateUrl: './order-detail.html',
})
export class OrderDetail {
  private readonly orderService = inject(OrderService);
  private readonly router = inject(Router);

  readonly statusInfo = ORDER_STATUS;
  readonly paymentInfo = PAYMENT_STATUS;
  readonly paymentMethods = PAYMENT_METHOD;
  readonly paymentOptions = Object.keys(PAYMENT_STATUS) as PaymentStatus[];
  readonly actions = ACTIONS;

  readonly order = signal<Order | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  /** Ô nhập phụ: mã vận đơn khi giao, ghi chú nội bộ */
  trackingCode = '';
  adminNote = '';

  /** Hộp thoại xác nhận huỷ / trả hàng */
  readonly pending = signal<OrderStatus | null>(null);
  reason = '';
  restock = true;
  readonly reasonError = signal('');

  readonly steps = computed(() => {
    const o = this.order();
    if (!o) return [];
    const reached = new Set((o.statusHistory ?? []).map((h) => h.status));
    reached.add(o.status);
    const currentIndex = STEPS.indexOf(o.status === 'returned' ? 'delivered' : o.status);
    return STEPS.filter((s) => !(o.onlyEbooks && s === 'shipping')).map((s) => ({
      status: s,
      label: ORDER_STATUS[s].label,
      done: reached.has(s) || (currentIndex >= 0 && STEPS.indexOf(s) <= currentIndex),
      at: (o.statusHistory ?? []).find((h) => h.status === s)?.at ?? (s === 'pending' ? o.createdAt : null),
    }));
  });

  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<Order>();

  private currentId: string | null = null;

  @Input() set orderId(id: string | null) {
    if (id === this.currentId) return;
    this.currentId = id;
    this.message.set('');
    this.pending.set(null);
    if (id) this.load(id);
    else this.order.set(null);
  }

  constructor() {
    // Mở bằng route cũ /order-detail/:id -> chuyển về trang Đơn hàng, mở sẵn panel
    const routeId = inject(ActivatedRoute).snapshot.paramMap.get('id');
    if (routeId) this.router.navigate(['/orders'], { queryParams: { id: routeId }, replaceUrl: true });
  }

  load(id: string): void {
    this.loading.set(true);
    this.error.set('');
    this.orderService.getOrder(id).subscribe({
      next: (o) => this.apply(o),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.order.set(null);
        this.error.set(err.status === 404 ? 'Không tìm thấy đơn hàng này.' : this.errorText(err));
      },
    });
  }

  // ---------- Chuyển trạng thái ----------
  act(next: OrderStatus): void {
    if (next === 'cancelled' || next === 'returned') {
      this.reason = '';
      this.restock = this.order()?.stockDeducted ?? true;
      this.reasonError.set('');
      this.pending.set(next);
      return;
    }
    this.send(next);
  }

  confirmPending(): void {
    const next = this.pending();
    if (!next) return;
    if (!this.reason.trim()) {
      this.reasonError.set(next === 'cancelled' ? 'Vui lòng nhập lý do huỷ đơn' : 'Vui lòng nhập lý do trả hàng');
      return;
    }
    this.send(next, this.reason.trim());
  }

  private send(next: OrderStatus, note = ''): void {
    const o = this.order();
    if (!o) return;
    this.saving.set(true);
    this.orderService
      .changeStatus(o._id, {
        status: next,
        note: note || undefined,
        trackingCode: next === 'shipping' ? this.trackingCode.trim() || undefined : undefined,
        restock: next === 'cancelled' ? this.restock : undefined,
      })
      .subscribe({
        next: (updated) => {
          this.pending.set(null);
          this.apply(updated);
          this.message.set(`Đã chuyển đơn sang "${ORDER_STATUS[updated.status].label}"`);
          this.changed.emit(updated);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.pending.set(null);
          this.error.set(this.errorText(err));
        },
      });
  }

  // ---------- Thông tin phụ ----------
  setPayment(status: string): void {
    this.update({ paymentStatus: status as PaymentStatus }, 'Đã cập nhật thanh toán');
  }

  saveNote(): void {
    this.update({ adminNote: this.adminNote, trackingCode: this.trackingCode }, 'Đã lưu ghi chú');
  }

  private update(body: Parameters<OrderService['update']>[1], done: string): void {
    const o = this.order();
    if (!o) return;
    this.saving.set(true);
    this.orderService.update(o._id, body).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.message.set(done);
        this.changed.emit(updated);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.errorText(err));
      },
    });
  }

  // ---------- Hiển thị ----------
  money(value: number): string {
    return (value ?? 0).toLocaleString('vi-VN') + 'đ';
  }

  statusLabel(status: string): string {
    return ORDER_STATUS[status as OrderStatus]?.label ?? status;
  }

  address(o: Order): string {
    const a = o.shippingAddress;
    return a ? [a.address, a.ward, a.district, a.province].filter(Boolean).join(', ') : '';
  }

  hideImage(event: Event): void {
    (event.target as HTMLImageElement).style.visibility = 'hidden';
  }

  private apply(o: Order): void {
    this.order.set(o);
    this.trackingCode = o.trackingCode ?? '';
    this.adminNote = o.adminNote ?? '';
    this.loading.set(false);
    this.saving.set(false);
    this.error.set('');
  }

  private errorText(err: HttpErrorResponse): string {
    return err.status === 0
      ? 'Không kết nối được my-server (http://localhost:3002). Hãy chạy "npm run dev" trong thư mục my-server.'
      : err.error?.message || 'Có lỗi xảy ra, vui lòng thử lại.';
  }
}
