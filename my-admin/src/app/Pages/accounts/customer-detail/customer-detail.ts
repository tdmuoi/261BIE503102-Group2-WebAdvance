import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Subscription, catchError, combineLatest, of, switchMap } from 'rxjs';
import { CustomerAccountDetail } from '../../../models/account-management';
import { AccountManagementService } from '../../../services/account-management-service';

@Component({
  selector: 'app-customer-detail',
  standalone: false,
  styleUrl: './customer-detail.css',
  templateUrl: './customer-detail.html',
})
export class CustomerDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(AccountManagementService);
  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private mutation?: Subscription;
  readonly customer = signal<CustomerAccountDetail | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly confirming = signal(false);
  readonly transactionTab = signal('orders');
  readonly page = signal(1);
  readonly pageSize = 5;
  constructor() {
    combineLatest([this.route.paramMap, this.refresh$])
      .pipe(
        switchMap(([params]) => {
          this.confirming.set(false);
          this.transactionTab.set('orders');
          this.customer.set(null);
          this.page.set(1);
          this.loading.set(true);
          this.error.set('');
          const id = params.get('id');
          if (!id) {
            this.error.set('Thiếu ID khách hàng trên đường dẫn.');
            return of(null);
          }
          return this.service.getCustomer(id).pipe(
            catchError((error: HttpErrorResponse) => {
              this.error.set(this.describe(error));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((customer) => {
        this.customer.set(customer);
        this.loading.set(false);
      });
  }
  reload(): void {
    this.refresh$.next();
  }
  ngOnDestroy(): void {
    this.mutation?.unsubscribe();
  }
  get rows() {
    return (this.customer()?.orders ?? []).slice(
      (this.page() - 1) * this.pageSize,
      this.page() * this.pageSize,
    );
  }
  get selectedHistory() {
    const customer = this.customer();
    return this.transactionTab() === 'returns'
      ? customer?.returns
      : this.transactionTab() === 'buyback'
        ? customer?.buybacks
        : this.transactionTab() === 'reviews'
          ? customer?.reviews
          : undefined;
  }
  get locked(): boolean {
    return this.customer()?.status === 'locked';
  }
  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
  money(value: number | null): string {
    return value === null ? '—' : value.toLocaleString('vi-VN') + 'đ';
  }
  get lastPurchaseDays(): string {
    const last = this.customer()?.metrics.lastPurchaseAt;
    if (!last) return '—';
    const days = Math.floor((Date.now() - Date.parse(last)) / 86400000);
    return days < 0 ? '—' : days === 0 ? 'Hôm nay' : `${days} ngày`;
  }
  statusLabel(status: string): string {
    return (
      (
        {
          active: 'Hoạt động',
          locked: 'Bị khóa',
          pending: 'Chờ xác nhận',
          unverified: 'Chưa xác minh',
          confirmed: 'Đã xác nhận',
          shipping: 'Đang giao',
          delivered: 'Hoàn tất',
          completed: 'Hoàn tất',
          cancelled: 'Đã hủy',
          returned: 'Đã trả',
          refunded: 'Đã hoàn tiền',
        } as Record<string, string>
      )[status] ?? status
    );
  }
  requestLock(): void {
    if (this.customer()?.capabilities.lock && !this.saving()) this.confirming.set(true);
  }
  confirmLock(): void {
    const customer = this.customer();
    if (!customer || this.saving()) return;
    this.saving.set(true);
    this.mutation = this.service
      .customerAction(customer._id, this.locked ? 'unlock' : 'lock')
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.confirming.set(false);
          this.message.set('Đã cập nhật trạng thái khách hàng.');
          this.reload();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.confirming.set(false);
          this.error.set(this.describe(error));
        },
      });
  }
  imageError(event: Event): void {
    (event.target as HTMLImageElement).hidden = true;
  }
  private describe(error: HttpErrorResponse): string {
    if (error.status === 0) return 'Không kết nối được Backend.';
    if (error.status === 404) return 'Không tìm thấy khách hàng hoặc API chưa được đăng ký.';
    if ([401, 403].includes(error.status))
      return 'Phiên hết hạn hoặc không có quyền truy cập. Vui lòng đăng nhập lại.';
    return typeof error.error?.message === 'string'
      ? error.error.message
      : 'Không tải hoặc lưu được hồ sơ khách hàng.';
  }
}
