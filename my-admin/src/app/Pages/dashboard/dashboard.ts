import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';

import { DashboardData, DashboardStat } from '../../models/dashboard';
import { DashboardService } from '../../services/dashboard-service';
import { StatTone } from '../../Components/stat-card/stat-card';

export interface ChartBar {
  label: string;
  showLabel: boolean;
  height: number;
  tooltip: string;
  isToday: boolean;
}

/**
 * Trang Tổng quan (Dashboard) — lấy số liệu từ GET /api/admin/dashboard?days=7|30
 * Lưu ý: my-admin chạy zoneless nên trạng thái dùng signal() để giao diện tự cập nhật.
 */
@Component({
  selector: 'app-dashboard',
  standalone: false,
  styleUrl: './dashboard.css',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly dashboardService = inject(DashboardService);

  readonly periodOptions = [
    { days: 7, label: '7 ngày qua' },
    { days: 30, label: '30 ngày qua' },
  ];

  readonly days = signal(7);
  readonly data = signal<DashboardData | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly updatedAt = signal<Date | null>(null);

  /** Cột biểu đồ doanh thu (chiều cao % theo ngày cao nhất) */
  readonly chartBars = computed<ChartBar[]>(() => {
    const points = this.data()?.salesChart ?? [];
    const max = Math.max(0, ...points.map((p) => p.revenue));
    const step = points.length > 10 ? 5 : 1; // 30 ngày: cứ 5 ngày hiện 1 nhãn cho đỡ rối
    return points.map((p, i) => ({
      label: p.label,
      showLabel: i === points.length - 1 || (points.length - 1 - i) % step === 0,
      height: max ? Math.max((p.revenue / max) * 100, p.revenue ? 2 : 0) : 0,
      tooltip: `${p.label}: ${this.money(p.revenue)} · ${p.orders} đơn`,
      isToday: i === points.length - 1,
    }));
  });

  readonly chartMax = computed(() => Math.max(0, ...(this.data()?.salesChart ?? []).map((p) => p.revenue)));
  readonly chartTotal = computed(() => (this.data()?.salesChart ?? []).reduce((s, p) => s + p.revenue, 0));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.dashboardService.getDashboard(this.days()).subscribe({
      next: (res) => {
        this.data.set(res);
        this.updatedAt.set(new Date());
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(
          err?.status === 0
            ? 'Không kết nối được my-server (http://localhost:3002). Hãy mở terminal, vào thư mục my-server và chạy "npm run dev".'
            : 'Server báo lỗi khi lấy số liệu (có thể MongoDB chưa kết nối). Xem terminal của my-server để biết chi tiết.',
        );
        this.loading.set(false);
      },
    });
  }

  changeDays(value: string | number): void {
    this.days.set(Number(value));
    this.load();
  }

  // ---------- Hiển thị ----------
  money(value: number): string {
    return value.toLocaleString('vi-VN') + ' đ';
  }

  /** Viết gọn cho trục biểu đồ: 1.250.000 -> 1,3tr */
  shortMoney(value: number): string {
    if (value >= 1e9) return (value / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tỷ';
    if (value >= 1e6) return (value / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'tr';
    if (value >= 1e3) return (value / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + 'k';
    return String(value);
  }

  changeNote(stat: DashboardStat | undefined): string {
    const change = stat?.change;
    if (change === null || change === undefined) return 'Chưa có số liệu kỳ trước';
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toLocaleString('vi-VN')}% so với ${this.days()} ngày trước`;
  }

  changeTone(stat: DashboardStat | undefined): StatTone {
    const change = stat?.change ?? 0;
    return change > 0 ? 'ok' : change < 0 ? 'bad' : 'default';
  }

  /** "Hôm nay, 12:45" | "Hôm qua, 09:00" | "25/10/2026" */
  orderTime(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    if (d.toDateString() === today.toDateString()) return `Hôm nay, ${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `Hôm qua, ${time}`;
    return d.toLocaleDateString('vi-VN');
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0].toUpperCase()).join('');
  }
}
