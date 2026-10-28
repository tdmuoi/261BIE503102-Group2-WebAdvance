import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import {
  RETURN_REASON,
  RETURN_STATUS,
  ReturnListResponse,
  ReturnQuery,
  ReturnReason,
  ReturnRequest,
  ReturnStatus,
} from '../../models/return-request';
import { ReturnService } from '../../services/return-service';

type StatusTab = NonNullable<ReturnQuery['status']>;

/**
 * Trang Đổi trả & hoàn tiền: thống kê, lý do trả hàng, bảng yêu cầu và panel xử lý trong cùng trang
 * (Pages/refunds/refund-detail). Yêu cầu đang mở nằm trên URL: /refunds?id=...
 */
@Component({
  selector: 'app-refunds',
  standalone: false,
  styleUrl: './refunds.css',
  templateUrl: './refunds.html',
})
export class Refunds {
  private readonly returnService = inject(ReturnService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly statusInfo = RETURN_STATUS;
  readonly reasonLabels = RETURN_REASON;
  readonly tabs: { value: StatusTab; label: string }[] = [
    { value: '', label: 'Tất cả' },
    { value: 'open', label: 'Đang xử lý' },
    ...(Object.keys(RETURN_STATUS) as ReturnStatus[]).map((s) => ({ value: s as StatusTab, label: RETURN_STATUS[s].label })),
  ];

  readonly q = signal('');
  readonly status = signal<StatusTab>('open');
  readonly type = signal<'' | 'refund' | 'exchange'>('');
  readonly from = signal('');
  readonly to = signal('');
  readonly page = signal(1);
  readonly pageSize = 10;

  readonly data = signal<ReturnListResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly selectedId = signal<string | null>(null);

  readonly requests = computed(() => this.data()?.items ?? []);
  readonly hasFilter = computed(() => !!(this.q() || this.type() || this.from() || this.to()));

  /** Lý do trả hàng: % trên tổng yêu cầu, sắp giảm dần */
  readonly reasonStats = computed(() => {
    const reasons = this.data()?.reasons;
    if (!reasons) return [];
    const total = Object.values(reasons).reduce((a, b) => a + b, 0);
    return (Object.keys(reasons) as ReturnReason[])
      .map((r) => ({ label: RETURN_REASON[r], count: reasons[r], percent: total ? Math.round((reasons[r] / total) * 100) : 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  });

  private readonly search$ = new Subject<string>();

  constructor() {
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((text) => {
      this.q.set(text);
      this.page.set(1);
      this.load();
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.selectedId.set(params.get('id')));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.returnService
      .getReturns({ q: this.q(), status: this.status(), type: this.type(), from: this.from(), to: this.to(), page: this.page(), limit: this.pageSize })
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(
            err.status === 0
              ? 'Không kết nối được my-server (http://localhost:3002). Hãy chạy "npm run dev" trong thư mục my-server.'
              : 'Không tải được yêu cầu đổi trả. Xem terminal của my-server để biết chi tiết.',
          );
          this.loading.set(false);
        },
      });
  }

  onSearch(text: string): void {
    this.search$.next(text.trim());
  }

  setStatus(value: StatusTab): void {
    this.status.set(value);
    this.reload();
  }

  setType(value: string): void {
    this.type.set(value as '' | 'refund' | 'exchange');
    this.reload();
  }

  setDate(which: 'from' | 'to', value: string): void {
    this[which].set(value);
    this.reload();
  }

  clearFilters(): void {
    this.q.set('');
    this.type.set('');
    this.from.set('');
    this.to.set('');
    this.reload();
  }

  goToPage(p: number): void {
    this.page.set(p);
    this.load();
  }

  open(r: ReturnRequest): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { id: r._id }, queryParamsHandling: 'merge' });
  }

  close(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { id: null }, queryParamsHandling: 'merge' });
  }

  // ----- Hiển thị -----
  money(value: number | null): string {
    return (value ?? 0).toLocaleString('vi-VN') + 'đ';
  }

  count(value: StatusTab): number {
    const counts = this.data()?.counts;
    return counts ? counts[value || 'all'] ?? 0 : 0;
  }

  private reload(): void {
    this.page.set(1);
    this.load();
  }
}
