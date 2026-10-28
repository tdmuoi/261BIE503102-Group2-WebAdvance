import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';

import { REFUND_METHOD, RETURN_REASON, RETURN_STATUS, ReturnRequest, ReturnStatus } from '../../../models/return-request';
import { ReturnService } from '../../../services/return-service';

/** Thao tác cần hỏi lại trước khi gửi */
type Ask = 'rejected' | 'received' | 'refunded';

const ACTIONS: Record<ReturnStatus, { label: string; style: 'primary' | 'danger' }> = {
  pending: { label: '', style: 'primary' },
  approved: { label: 'Duyệt yêu cầu', style: 'primary' },
  received: { label: 'Đã nhận sách trả về', style: 'primary' },
  refunded: { label: 'Hoàn tiền', style: 'primary' },
  exchanged: { label: 'Đã gửi sách đổi', style: 'primary' },
  rejected: { label: 'Từ chối', style: 'danger' },
};

/**
 * Panel chi tiết 1 yêu cầu đổi trả (đặt cạnh bảng trong trang Đổi trả & hoàn tiền):
 *   <app-refund-detail [requestId]="selectedId()" (closed)="..." (changed)="..."></app-refund-detail>
 */
@Component({
  selector: 'app-refund-detail',
  standalone: false,
  styleUrl: './refund-detail.css',
  templateUrl: './refund-detail.html',
})
export class RefundDetail {
  private readonly returnService = inject(ReturnService);

  readonly statusInfo = RETURN_STATUS;
  readonly reasons = RETURN_REASON;
  readonly refundMethods = REFUND_METHOD;
  readonly actions = ACTIONS;

  readonly request = signal<ReturnRequest | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  // Hộp thoại xác nhận
  readonly asking = signal<Ask | null>(null);
  readonly askError = signal('');
  note = '';
  refundAmount: number | null = null;
  restock = true;
  adminNote = '';

  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<ReturnRequest>();

  private currentId: string | null = null;

  @Input() set requestId(id: string | null) {
    if (id === this.currentId) return;
    this.currentId = id;
    this.message.set('');
    this.asking.set(null);
    if (id) this.load(id);
    else this.request.set(null);
  }

  load(id: string): void {
    this.loading.set(true);
    this.error.set('');
    this.returnService.getReturn(id).subscribe({
      next: (r) => this.apply(r),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.request.set(null);
        this.error.set(err.status === 404 ? 'Không tìm thấy yêu cầu này.' : this.errorText(err));
      },
    });
  }

  // ---------- Xử lý ----------
  act(next: ReturnStatus): void {
    const r = this.request();
    if (!r) return;
    if (next === 'rejected' || next === 'received' || next === 'refunded') {
      this.note = '';
      this.askError.set('');
      this.refundAmount = r.itemsValue || null;
      // Sách lỗi / hư hỏng thường không bán lại được
      this.restock = r.reason !== 'damaged';
      this.asking.set(next);
      return;
    }
    this.send({ status: next });
  }

  confirmAsk(): void {
    const ask = this.asking();
    if (!ask) return;
    if (ask === 'rejected' && !this.note.trim()) return this.askError.set('Vui lòng nhập lý do từ chối');
    if (ask === 'refunded' && (!this.refundAmount || this.refundAmount <= 0)) return this.askError.set('Nhập số tiền hoàn lớn hơn 0');
    this.send({
      status: ask,
      note: this.note.trim() || undefined,
      refundAmount: ask === 'refunded' ? this.refundAmount ?? undefined : undefined,
      restock: ask === 'received' ? this.restock : undefined,
    });
  }

  saveNote(): void {
    const r = this.request();
    if (!r) return;
    this.saving.set(true);
    this.returnService.saveNote(r._id, this.adminNote).subscribe({
      next: (updated) => {
        this.apply({ ...updated, order: r.order });
        this.message.set('Đã lưu ghi chú');
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  private send(body: Parameters<ReturnService['changeStatus']>[1]): void {
    const r = this.request();
    if (!r) return;
    this.saving.set(true);
    this.returnService.changeStatus(r._id, body).subscribe({
      next: (updated) => {
        this.asking.set(null);
        this.apply({ ...updated, order: r.order });
        this.message.set(`Đã chuyển sang "${RETURN_STATUS[updated.status].label}"`);
        this.changed.emit(updated);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 400 && err.error?.errors) {
          this.saving.set(false);
          this.askError.set(Object.values(err.error.errors).join('. '));
          return;
        }
        this.asking.set(null);
        this.fail(err);
      },
    });
  }

  // ---------- Hiển thị ----------
  money(value: number | null): string {
    return (value ?? 0).toLocaleString('vi-VN') + 'đ';
  }

  statusLabel(status: string): string {
    return RETURN_STATUS[status as ReturnStatus]?.label ?? status;
  }

  askTitle(): string {
    const code = this.request()?.requestCode ?? '';
    return { rejected: `Từ chối yêu cầu ${code}?`, received: `Xác nhận đã nhận sách của ${code}?`, refunded: `Hoàn tiền cho ${code}?` }[
      this.asking() ?? 'rejected'
    ];
  }

  askMessage(): string {
    return {
      rejected: 'Khách sẽ thấy yêu cầu bị từ chối kèm lý do bạn nhập.',
      received: 'Xác nhận kho đã nhận lại sách khách gửi trả.',
      refunded: 'Chỉ bấm sau khi đã chuyển tiền cho khách. Đơn gốc sẽ được đánh dấu Đã hoàn tiền.',
    }[this.asking() ?? 'rejected'];
  }

  private apply(r: ReturnRequest): void {
    this.request.set(r);
    this.adminNote = r.adminNote ?? '';
    this.loading.set(false);
    this.saving.set(false);
    this.error.set('');
  }

  private fail(err: HttpErrorResponse): void {
    this.saving.set(false);
    this.error.set(this.errorText(err));
  }

  private errorText(err: HttpErrorResponse): string {
    return err.status === 0
      ? 'Không kết nối được my-server (http://localhost:3002). Hãy chạy "npm run dev" trong thư mục my-server.'
      : err.error?.message || 'Có lỗi xảy ra, vui lòng thử lại.';
  }
}
