import { Component, ElementRef, EventEmitter, HostListener, Input, Output, SimpleChanges, inject } from '@angular/core';

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

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open) this.cancel();
  }
}
