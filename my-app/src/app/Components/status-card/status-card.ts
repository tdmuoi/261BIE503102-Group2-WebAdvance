import { Component, input } from '@angular/core';

/**
 * Khung thông báo trạng thái (đang tải / lỗi / không tìm thấy) — cùng kiểu status-card của trang chủ.
 * Nút hành động truyền vào qua <ng-content>.
 */
@Component({
  selector: 'app-status-card',
  standalone: false,
  styleUrl: './status-card.css',
  templateUrl: './status-card.html',
})
export class StatusCard {
  readonly tone = input<'loading' | 'error' | 'info'>('info');
  readonly title = input('');
  readonly message = input('');
}
