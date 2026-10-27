import { Component, Input } from '@angular/core';

/**
 * Pill trạng thái dùng chung cho các bảng admin.
 *
 * Cách dùng:
 *   <app-status-badge status="pending"></app-status-badge>          -> "Chờ xác nhận" (vàng)
 *   <app-status-badge [status]="order.status"></app-status-badge>
 *   <app-status-badge label="Sắp hết" tone="warn"></app-status-badge> (tự đặt chữ + màu)
 *
 * - status: mã trạng thái lưu trong MongoDB (active, pending, shipping, cancelled...).
 *   Không phân biệt hoa/thường, chấp nhận cả "low-stock" / "low_stock" / "low stock".
 * - label: ghi đè chữ hiển thị (nếu không truyền thì lấy theo bảng STATUS_MAP).
 * - tone : ghi đè màu: ok | warn | info | bad | mute.
 * Mã nào không có trong bảng thì hiện nguyên chữ với màu xám (mute).
 */
export type BadgeTone = 'ok' | 'warn' | 'info' | 'bad' | 'mute';

export const STATUS_MAP: Record<string, { label: string; tone: BadgeTone }> = {
  // Xanh lá — ổn / đã xong
  active: { label: 'Hoạt động', tone: 'ok' },
  selling: { label: 'Đang bán', tone: 'ok' },
  in_stock: { label: 'Còn hàng', tone: 'ok' },
  published: { label: 'Đã đăng', tone: 'ok' },
  approved: { label: 'Đã duyệt', tone: 'ok' },
  paid: { label: 'Đã thanh toán', tone: 'ok' },
  delivered: { label: 'Đã giao', tone: 'ok' },
  completed: { label: 'Hoàn tất', tone: 'ok' },
  refunded: { label: 'Đã hoàn tiền', tone: 'ok' },

  // Vàng — đang chờ / cần chú ý
  pending: { label: 'Chờ xác nhận', tone: 'warn' },
  processing: { label: 'Đang xử lý', tone: 'warn' },
  reviewing: { label: 'Đang thẩm định', tone: 'warn' },
  unpaid: { label: 'Chưa thanh toán', tone: 'warn' },
  low_stock: { label: 'Sắp hết', tone: 'warn' },

  // Xanh dương — đang diễn ra
  confirmed: { label: 'Đã xác nhận', tone: 'info' },
  shipping: { label: 'Đang giao', tone: 'info' },
  received: { label: 'Đã nhận sách', tone: 'info' },
  scheduled: { label: 'Lên lịch', tone: 'info' },

  // Đỏ — lỗi / huỷ / khoá
  cancelled: { label: 'Đã huỷ', tone: 'bad' },
  rejected: { label: 'Từ chối', tone: 'bad' },
  failed: { label: 'Thất bại', tone: 'bad' },
  locked: { label: 'Bị khoá', tone: 'bad' },
  blocked: { label: 'Bị khoá', tone: 'bad' },
  out_of_stock: { label: 'Hết hàng', tone: 'bad' },
  expired: { label: 'Hết hạn', tone: 'bad' },

  // Xám — nháp / ẩn
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

  /** Chuẩn hoá mã: "Low-Stock" -> "low_stock" */
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
