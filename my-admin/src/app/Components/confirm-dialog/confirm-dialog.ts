import { Component, ElementRef, EventEmitter, HostListener, Input, Output, SimpleChanges, inject } from '@angular/core';

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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private previousFocus: HTMLElement | null = null;
  private destroyed = false;
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

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open']) return;
    if (this.open) {
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      queueMicrotask(() => {
        if (!this.destroyed && this.open) this.focusables()[0]?.focus();
      });
    } else this.restoreFocus();
  }

  ngOnDestroy(): void { this.destroyed = true; this.restoreFocus(); }

  private restoreFocus(): void {
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
    this.previousFocus = null;
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(
      '.dialog button:not([disabled]), .dialog input:not([disabled]), .dialog select:not([disabled]), .dialog textarea:not([disabled]), .dialog a[href], .dialog [tabindex="0"]',
    )).filter((element) => !element.closest('[hidden], [inert]'));
  }

  @HostListener('document:keydown', ['$event'])
  onTab(event: KeyboardEvent): void {
    if (!this.open || event.key !== 'Tab') return;
    const elements = this.focusables();
    const first = elements[0], last = elements[elements.length - 1];
    if (!first) {
      event.preventDefault();
      this.host.nativeElement.querySelector<HTMLElement>('.dialog')?.focus();
    } else if (event.shiftKey && (document.activeElement === first || !this.host.nativeElement.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !this.host.nativeElement.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }

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
