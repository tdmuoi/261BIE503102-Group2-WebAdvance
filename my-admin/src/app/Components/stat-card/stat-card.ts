import { Component, Input } from '@angular/core';

/**
 * Thẻ số liệu (Dashboard, Quản lý sách, Tồn kho, Đơn hàng...).
 *
 * Cách dùng:
 *   <app-stat-card label="Tổng đầu sách" [value]="2486" note="+48 trong tháng này"></app-stat-card>
 *   <app-stat-card label="Sắp hết hàng" [value]="37" note="Tồn dưới ngưỡng tối thiểu" tone="warn"></app-stat-card>
 *   <app-stat-card label="Doanh thu" [value]="125000000" unit="đ"></app-stat-card>
 *
 * - value: số sẽ tự định dạng kiểu Việt Nam (2486 -> "2.486"); chuỗi thì giữ nguyên.
 * - tone : default | ok | warn | bad | info — đổi màu số và dòng ghi chú.
 * - link : nếu có, cả thẻ bấm được và chuyển tới trang đó (vd '/inventory').
 */
export type StatTone = 'default' | 'ok' | 'warn' | 'bad' | 'info';

@Component({
  selector: 'app-stat-card',
  standalone: false,
  styleUrl: './stat-card.css',
  templateUrl: './stat-card.html',
})
export class StatCard {
  @Input() label = '';
  @Input() value: number | string | null | undefined = null;
  @Input() unit = '';
  @Input() note = '';
  @Input() tone: StatTone = 'default';
  @Input() link: string | null = null;

  get displayValue(): string {
    if (this.value === null || this.value === undefined || this.value === '') return '—';
    return typeof this.value === 'number' ? this.value.toLocaleString('vi-VN') : this.value;
  }
}
