import { Component, Input } from '@angular/core';

export type BadgeTone = 'ok' | 'warn' | 'info' | 'bad' | 'mute';

export const STATUS_MAP: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: 'Hoạt động', tone: 'ok' },
  selling: { label: 'Đang bán', tone: 'ok' },
  in_stock: { label: 'Còn hàng', tone: 'ok' },
  published: { label: 'Đã đăng', tone: 'ok' },
  approved: { label: 'Đã duyệt', tone: 'ok' },
  paid: { label: 'Đã thanh toán', tone: 'ok' },
  delivered: { label: 'Đã giao', tone: 'ok' },
  completed: { label: 'Hoàn tất', tone: 'ok' },
  refunded: { label: 'Đã hoàn tiền', tone: 'ok' },

  pending: { label: 'Chờ xác nhận', tone: 'warn' },
  processing: { label: 'Đang xử lý', tone: 'warn' },
  reviewing: { label: 'Đang thẩm định', tone: 'warn' },
  unpaid: { label: 'Chưa thanh toán', tone: 'warn' },
  low_stock: { label: 'Sắp hết', tone: 'warn' },

  confirmed: { label: 'Đã xác nhận', tone: 'info' },
  shipping: { label: 'Đang giao', tone: 'info' },
  received: { label: 'Đã nhận sách', tone: 'info' },
  scheduled: { label: 'Lên lịch', tone: 'info' },

  cancelled: { label: 'Đã huỷ', tone: 'bad' },
  rejected: { label: 'Từ chối', tone: 'bad' },
  returned: { label: 'Trả hàng', tone: 'bad' },
  failed: { label: 'Thất bại', tone: 'bad' },
  locked: { label: 'Bị khoá', tone: 'bad' },
  blocked: { label: 'Bị khoá', tone: 'bad' },
  out_of_stock: { label: 'Hết hàng', tone: 'bad' },
  expired: { label: 'Hết hạn', tone: 'bad' },

  draft: { label: 'Bản nháp', tone: 'mute' },
  hidden: { label: 'Ẩn', tone: 'mute' },
  inactive: { label: 'Ngừng hoạt động', tone: 'mute' },
};

@Component({
  selector: 'app-status-badge',
  standalone: false,
  styleUrl: './status-badge.css',
  templateUrl: './status-badge.html',
})
export class StatusBadge {
  @Input() status: string | null | undefined = '';
  @Input() label = '';
  @Input() tone: BadgeTone | '' = '';

  private get key(): string {
    return (this.status ?? '').toString().trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  get text(): string {
    return this.label || STATUS_MAP[this.key]?.label || (this.status ?? '').toString();
  }

  get toneClass(): string {
    return 'status-' + (this.tone || STATUS_MAP[this.key]?.tone || 'mute');
  }
}
