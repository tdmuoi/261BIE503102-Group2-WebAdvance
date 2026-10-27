import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

/**
 * Hộp thoại xác nhận (xoá sách, huỷ đơn, khoá tài khoản...).
 *
 * Cách dùng (trong trang cha):
 *   <app-confirm-dialog
 *     [open]="showDelete"
 *     title='Xoá sản phẩm "Circe"?'
 *     message="Sản phẩm sẽ bị gỡ khỏi website và kho. Thao tác này không thể hoàn tác."
 *     note="Còn 3 cuốn tồn kho và 2 đơn đang xử lý"
 *     confirmText="Xoá sản phẩm"
 *     [loading]="deleting"
 *     (confirmed)="deleteBook()"
 *     (cancelled)="showDelete = false">
 *   </app-confirm-dialog>
 *
 * - variant: 'danger' (mặc định, nút đỏ + icon thùng rác) | 'default' (nút đen + icon dấu hỏi).
 * - Bấm "Huỷ", bấm ra ngoài hoặc nhấn Esc  -> phát (cancelled).
 * - Bấm nút xác nhận                        -> phát (confirmed). Trang cha tự đóng dialog
 *   (gán open = false) sau khi gọi API xong.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: false,
  styleUrl: './confirm-dialog.css',
  templateUrl: './confirm-dialog.html',
  host: { '[attr.title]': 'null' },
})
export class ConfirmDialog {
  @Input() open = false;
  @Input() title = 'Bạn có chắc chắn?';
  @Input() message = '';
  @Input() note = '';
  @Input() confirmText = 'Xác nhận';
  @Input() cancelText = 'Huỷ';
  @Input() variant: 'danger' | 'default' = 'danger';
  @Input() loading = false;

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  confirm(): void {
    if (this.loading) return;
    this.confirmed.emit();
  }

  cancel(): void {
    if (this.loading) return;
    this.cancelled.emit();
  }

  /** Bấm vào vùng nền mờ (không phải trong hộp) thì đóng */
  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open) this.cancel();
  }
}
