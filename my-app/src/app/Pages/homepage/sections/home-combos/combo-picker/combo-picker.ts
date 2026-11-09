import { Component, ElementRef, computed, effect, input, output, signal, viewChild } from '@angular/core';

import { BookView } from '../../../../../models/book';

/** Hiện tối đa từng này cuốn, gõ tìm để thu hẹp */
const MAX_RESULTS = 60;

/** Bỏ dấu tiếng Việt để tìm "nha gia kim" vẫn ra "Nhà giả kim" */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

/** Bảng chọn 1 cuốn cho ô combo tự chọn: tìm theo tên sách / tác giả */
@Component({
  selector: 'app-combo-picker',
  standalone: false,
  styleUrl: './combo-picker.css',
  templateUrl: './combo-picker.html',
})
export class ComboPicker {
  readonly books = input.required<BookView[]>();
  readonly open = input(false);
  readonly picked = output<BookView>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly query = signal('');

  protected readonly results = computed(() => {
    const q = plain(this.query().trim());
    const list = q ? this.books().filter((book) => plain(`${book.title} ${book.authorName}`).includes(q)) : this.books();
    return list.slice(0, MAX_RESULTS);
  });

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.open() && !dialog.open) {
        this.query.set('');
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /** Bấm ra vùng tối bên ngoài bảng thì đóng */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.dialog().nativeElement.close();
  }
}
