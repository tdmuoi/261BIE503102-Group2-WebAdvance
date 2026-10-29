import { Component, OnDestroy, computed, inject, input, output, signal } from '@angular/core';

import { AuthService } from '../../../../services/auth-service';
import { ToastService } from '../../../../services/toast-service';
import { EbookFormat, LibraryEbook } from '../../bookshelf-ebooks/bookshelf.mock';

export const FORMAT_OPTIONS: { value: EbookFormat; desc: string }[] = [
  { value: 'EPUB', desc: 'Chữ tự co giãn, hợp đọc trên điện thoại' },
  { value: 'PDF', desc: 'Giữ nguyên bố cục bản in, hợp máy tính bảng' },
];

/** "2,1 MB" */
export function formatSize(mb: number): string {
  return `${mb.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
}

/**
 * Pop-up "Tải ebook về máy" (Figma 908:14796).
 *   @if (downloading(); as e) { <app-download-popup [ebook]="e" (closed)="downloading.set(null)" /> }
 */
@Component({
  selector: 'app-download-popup',
  standalone: false,
  styleUrls: ['../popup.css', './download-popup.css'],
  templateUrl: './download-popup.html',
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class DownloadPopup implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly ebook = input.required<Pick<LibraryEbook, 'bookId' | 'title' | 'image' | 'author' | 'translator' | 'purchasedAt' | 'sizes' | 'format'>>();
  readonly closed = output<void>();

  readonly formats = FORMAT_OPTIONS;
  readonly formatSize = formatSize;
  readonly picked = signal<EbookFormat | null>(null);
  readonly format = computed(() => this.picked() ?? this.ebook().format);
  readonly email = computed(() => this.auth.user()?.email ?? 'tài khoản của bạn');
  readonly byline = computed(() => [this.ebook().author, this.ebook().translator ? `${this.ebook().translator} dịch` : ''].filter(Boolean).join(' · '));

  constructor() {
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  download(): void {
    const e = this.ebook();
    // TODO: thay bằng API — GET /api/account/ebooks/:bookId/download?format=epub|pdf trả link file (có DRM theo tài khoản).
    // Chưa có file thật nên tạm báo đang chuẩn bị.
    this.toast.show(`Đang chuẩn bị file “${e.title}” (${this.format()}, ${formatSize(e.sizes[this.format()])})…`);
    this.closed.emit();
  }
}
